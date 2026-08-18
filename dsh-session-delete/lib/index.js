// dsh-session-delete host half.
// Exposes HTTP endpoints used by the browser half:
//   POST /dsh-session-delete/resolve  { title }   -> unique session match by title
//   POST /dsh-session-delete/delete   { sessionId } -> permanent session deletion
import { rm } from 'node:fs/promises'
import { appendFileSync } from 'node:fs'
import { dirname } from 'node:path'

const diag = (line) => {
  try {
    appendFileSync('/tmp/dsh-session-delete.log', `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch { /* best effort */ }
}

/** Hard service dependencies: without these the plugin waits and never applies. */
const inject = ['webServer', 'sessionQuery', 'sessionPersistence', 'workspaceRegistry', 'agents', 'sessions']

const readBody = (req) => new Promise((resolve) => {
  let data = ''
  req.on('data', (chunk) => {
    data += chunk
    if (data.length > 65536) {
      resolve(null)
      req.destroy()
      return
    }
  })
  req.on('end', () => {
    if (data === '') return resolve(null)
    try {
      resolve(JSON.parse(data))
    } catch {
      resolve(null)
    }
  })
  req.on('error', () => resolve(null))
})

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Resolve the unique live-or-persisted session whose display title equals `title`. */
async function resolveByTitle(ctx, title) {
  const query = ctx.get('sessionQuery')
  const records = query === undefined ? [] : await query.listSessions()
  const ids = records.map((record) => String(record.header.id))
  const titleById = new Map()
  if (query !== undefined && ids.length > 0) {
    try {
      const observations = await query.readTitleSnapshots(ids)
      for (const observation of observations) {
        if (observation.status === 'fulfilled' && observation.value.title !== undefined) {
          titleById.set(String(observation.sessionId), observation.value.title)
        }
      }
    } catch {
      // titles are best-effort; unmatched titles simply fail below
    }
  }
  const matches = []
  for (const record of records) {
    const id = String(record.header.id)
    const snapshot = titleById.get(id)
    const recordTitle = snapshot === undefined ? undefined : snapshot.title
    if (recordTitle === title) {
      matches.push({
        sessionId: id,
        createdAt: record.header.createdAt,
        preset: record.header.agentPreset,
        cwd: record.header.cwd
      })
    }
  }
  // Newest first, mirroring the sidebar's session ordering.
  matches.sort((a, b) => b.createdAt - a.createdAt)
  return matches
}

/** Permanently delete one session: refuse only *running* agents (idle open
 *  sessions are fine), flush + detach a live session from the in-memory store
 *  (which drives the browser's `host/session-removed` frame), remove the
 *  physical log directory, then detach the id from every workspace account. */
async function deleteSession(ctx, sessionId) {
  const agents = ctx.get('agents')
  const agent = agents === undefined ? undefined : agents.get(sessionId)
  if (agent !== undefined && agent.status === 'running') {
    return { ok: false, error: '该会话正在运行，不能删除' }
  }
  const query = ctx.get('sessionQuery')
  const records = query === undefined ? [] : await query.listSessions()
  const header = records.find((record) => String(record.header.id) === sessionId)?.header
  if (header === undefined) return { ok: false, error: '会话不存在' }
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined) return { ok: false, error: 'session persistence unavailable' }
  const location = persistence.locate(header)
  if (location === undefined || location === null || typeof location.path !== 'string' || location.path.length === 0) {
    return { ok: false, error: '无法定位会话日志' }
  }

  // Live session: durability barrier first, then detach from the store so
  // `session/disposed` fires and the connected browser removes the row.
  const sessions = ctx.get('sessions')
  const live = sessions === undefined ? undefined : sessions.get(sessionId)
  let liveDetached = false
  if (live !== undefined) {
    try {
      await sessions.flush(live)
      if (typeof sessions.liveEntryFor === 'function' && typeof sessions.detachEntered === 'function') {
        sessions.detachEntered(sessions.liveEntryFor(live))
        liveDetached = true
      }
    } catch (error) {
      return { ok: false, error: '关闭会话失败: ' + (error instanceof Error ? error.message : String(error)) }
    }
  }

  const registry = ctx.get('workspaceRegistry')
  if (registry !== undefined) {
    for (const workspace of registry.list()) {
      await workspace.detachSession(sessionId)
    }
  }
  await rm(dirname(location.path), { recursive: true, force: true })
  return { ok: true, live: liveDetached }
}

export function apply(ctx) {
  diag('apply called; get=' + String(typeof ctx.get) + '; webServer=' + String(typeof ctx.get('webServer')))
  const webServer = ctx.get('webServer')
  if (webServer === undefined) {
    diag('webServer unavailable; routes not registered')
    return
  }

  const disposers = [
    webServer.register({
      kind: 'exact',
      path: '/dsh-session-delete/resolve',
      handler: async (req, res) => {
        const body = await readBody(req)
        const title = body !== null && typeof body === 'object' && typeof body.title === 'string' ? body.title.trim() : ''
        if (title === '') return sendJson(res, 400, { ok: false, error: '缺少会话标题' })
        try {
          const matches = await resolveByTitle(ctx, title)
          if (matches.length === 1) return sendJson(res, 200, { ok: true, sessionId: matches[0].sessionId })
          if (matches.length === 0) return sendJson(res, 200, { ok: true, sessionId: null })
          return sendJson(res, 200, {
            ok: true,
            sessionId: null,
            candidates: matches.map((m) => ({ sessionId: m.sessionId, createdAt: m.createdAt, preset: m.preset, cwd: m.cwd }))
          })
        } catch (error) {
          return sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      }
    }),
    webServer.register({
      kind: 'exact',
      path: '/dsh-session-delete/delete',
      handler: async (req, res) => {
        const body = await readBody(req)
        const sessionId = body !== null && typeof body === 'object' && typeof body.sessionId === 'string' ? body.sessionId : ''
        if (sessionId === '') return sendJson(res, 400, { ok: false, error: '缺少 sessionId' })
        try {
          const result = await deleteSession(ctx, sessionId)
          return sendJson(res, result.ok ? 200 : 400, result)
        } catch (error) {
          return sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      }
    })
  ]

  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  }, 'dsh-session-delete: http routes')
}

export { inject }
