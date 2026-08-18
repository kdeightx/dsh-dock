// dsh-plugin-manager host half.
//   GET  /dsh-plugin-manager/plugins              -> user-installed plugin list (enabled/running state)
//   POST /dsh-plugin-manager/plugins/toggle { entryId, enabled } -> hot enable/disable
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const readBody = (req) => new Promise((resolve) => {
  let data = ''
  req.on('data', (chunk) => {
    data += chunk
    if (data.length > 65536) { resolve(null); req.destroy(); return }
  })
  req.on('end', () => {
    if (data === '') return resolve(null)
    try { resolve(JSON.parse(data)) } catch { resolve(null) }
  })
  req.on('error', () => resolve(null))
})

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Recursively collect every loader entry across all entry trees. */
function collectEntries(root) {
  const out = []
  const seen = new Set()
  const walk = (tree) => {
    let entries = []
    try { entries = typeof tree.entries === 'function' ? [...tree.entries()] : [] } catch { entries = [] }
    for (const entry of entries) {
      if (entry === undefined || entry === null || seen.has(entry)) continue
      seen.add(entry)
      out.push(entry)
      const plugin = entry.fiber !== undefined && entry.fiber.runtime !== undefined ? entry.fiber.runtime.callback : undefined
      if (plugin !== undefined && plugin !== tree && typeof plugin.entries === 'function') walk(plugin)
    }
  }
  walk(root)
  return out
}

/** Resolve the profile directory from the Include plugin instance. */
function profileDir(loader) {
  try {
    const includeEntry = loader.resolve('include')
    const plugin = includeEntry.fiber !== undefined && includeEntry.fiber.runtime !== undefined ? includeEntry.fiber.runtime.callback : undefined
    if (plugin !== undefined && typeof plugin.filename === 'string' && plugin.filename.endsWith('cordis.yml')) {
      return dirname(plugin.filename)
    }
  } catch { /* fall through */ }
  for (const entry of collectEntries(loader)) {
    const plugin = entry.fiber !== undefined && entry.fiber.runtime !== undefined ? entry.fiber.runtime.callback : undefined
    if (plugin !== undefined && typeof plugin.filename === 'string' && plugin.filename.endsWith('cordis.yml')) {
      return dirname(plugin.filename)
    }
  }
  return undefined
}

/** Persist one entry's disabled flag into the profile's cordis.patch.yml. */
async function persistPatchDisabled(ctx, entryId, disabled) {
  const loader = ctx.get('loader')
  if (loader === undefined) return null
  const dir = profileDir(loader)
  if (dir === undefined) return null
  const patchPath = join(dir, 'cordis.patch.yml')
  let content = ''
  if (existsSync(patchPath)) {
    try { content = await readFile(patchPath, 'utf8') } catch { content = '' }
  }
  const lines = content.split('\n')
  const blockStart = lines.findIndex((line) => /^\s*- id:\s*/.test(line) && line.includes(entryId))
  if (blockStart === -1) {
    const chunk = disabled
      ? `- id: ${entryId}\n  disabled: true\n`
      : `- id: ${entryId}\n`
    return writeFile(patchPath, content.trimEnd() + (content.trimEnd() === '' ? '' : '\n') + '\n' + chunk, 'utf8').then(() => patchPath)
  }
  let blockEnd = lines.length
  for (let i = blockStart + 1; i < lines.length; i += 1) {
    if (/^\s*- id:/.test(lines[i])) { blockEnd = i; break }
  }
  const before = lines.slice(0, blockStart)
  const after = lines.slice(blockEnd)
  const header = lines[blockStart]
  const rest = lines.slice(blockStart + 1, blockEnd)
  const filtered = rest.filter((line) => !/^\s*disabled:/.test(line))
  const body = disabled ? [header, '  disabled: true', ...filtered] : [header, ...filtered]
  const next = [...before, ...body, ...after].join('\n')
  return writeFile(patchPath, next, 'utf8').then(() => patchPath)
}

/** Hot toggle one plugin entry: update state, force-unload/reload the fiber,
 *  and persist the switch into cordis.patch.yml. */
async function togglePlugin(ctx, entryId, enabled) {
  const selfId = ctx.fiber !== undefined && ctx.fiber.entry !== undefined ? String(ctx.fiber.entry.id) : 'plugin-manager'
  if (String(entryId) === selfId || String(entryId).endsWith(':' + selfId)) {
    return { ok: false, error: '不能禁用插件管理器自身（禁用后没有入口可以恢复）' }
  }
  const loader = ctx.get('loader')
  if (loader === undefined) return { ok: false, error: 'loader unavailable' }
  const normalized = String(entryId).split(':').pop()
  const entry = collectEntries(loader).find((candidate) => {
    const id = String(candidate.id)
    return id === String(entryId) || id === normalized || id.endsWith(':' + normalized)
  })
  if (entry === undefined) return { ok: false, error: `未找到插件行 ${entryId}` }
  try {
    if (enabled) {
      await entry.update({ disabled: false })
    } else {
      await entry.update({ disabled: true })
      if (entry.fiber !== undefined) await entry._dispose()
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  try {
    await persistPatchDisabled(ctx, normalized, !enabled)
  } catch { /* persistence is best-effort */ }
  return { ok: true, enabled }
}

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return

  const disposers = [
    webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-manager/plugins',
      handler: async (req, res) => {
        try {
          const modules = ctx.get('clientModules')
          const loader = ctx.get('loader')
          // Loader-driven: every non-official entry, enabled or disabled, so
          // the manager can still show and re-enable disabled plugins.
          // `cordis:group` / `cordis:include` are loader-internal rows (npm
          // package names never contain ':').
          const rows = loader === undefined ? [] : collectEntries(loader)
            .filter((entry) => {
              const name = entry.options !== undefined ? entry.options.name : undefined
              return typeof name === 'string' && name !== '' &&
                !String(name).startsWith('@deepseek-ai/') &&
                !String(name).includes(':')
            })
          const graphById = new Map()
          if (modules !== undefined) {
            for (const entry of (Array.isArray(modules.graph().entries) ? modules.graph().entries : [])) {
              graphById.set(String(entry.id), entry)
            }
          }
          const plugins = rows.map((row) => {
            const name = String(row.options.name)
            const graph = graphById.get(name)
            return {
              id: name,
              rev: graph !== undefined ? graph.rev : '',
              url: graph !== undefined ? graph.url : '',
              entryId: String(row.id),
              enabled: row.options.disabled !== true,
              running: row.fiber !== undefined && row.fiber.uid !== undefined && row.fiber.uid !== null
            }
          })
          for (const [name, graph] of graphById) {
            if (!String(name).startsWith('@deepseek-ai/') && !String(name).includes(':') && !plugins.some((plugin) => plugin.id === name)) {
              plugins.push({ id: name, rev: graph.rev, url: graph.url, entryId: null, enabled: true, running: true })
            }
          }
          plugins.sort((a, b) => String(a.id).localeCompare(String(b.id)))
          return sendJson(res, 200, { ok: true, plugins })
        } catch (error) {
          return sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      }
    }),
    webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-manager/plugins/toggle',
      handler: async (req, res) => {
        const body = await readBody(req)
        const entryId = body !== null && typeof body === 'object' && typeof body.entryId === 'string' ? body.entryId : ''
        const enabled = body !== null && typeof body === 'object' && body.enabled === true
        if (entryId === '') return sendJson(res, 400, { ok: false, error: '缺少 entryId' })
        try {
          const result = await togglePlugin(ctx, entryId, enabled)
          return sendJson(res, result.ok ? 200 : 400, result)
        } catch (error) {
          return sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      }
    })
  ]

  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  }, 'dsh-plugin-manager: http routes')
}

const inject = ['webServer', 'loader', 'clientModules']
export { inject }
