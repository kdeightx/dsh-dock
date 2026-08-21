#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// dsh-safe — DSH 安全模式入口
//
// 问题: AI(或人)修改插件时一旦把 host 代码(lib/index.js)改坏,dsh 的 Loader
// 整体回滚启动 —— 一个坏插件 = dsh 打不开,连修复的入口都没有。
//
// 方案: 本脚本在启动前「体检」profile 里所有插件(bundle):
//   1. package.json 可解析、声明了 dsh.bundle.patch;
//   2. cordis.patch.yml 可解析(js-yaml),并提取其中的行 id;
//   3. lib/index.js、lib/client.js 通过 node --check。
// 发现坏的 → 写入 <profile>/safe-mode.overlay.yml(patch 覆盖层,格式:
//   - id: xxx / disabled: true)→ 以 `dsh web --patch <overlay>` 启动。
//   disabled 的条目 Loader 连模块都不会 import,坏插件不影响启动 —— 这就是
//   安全模式。dsh-safe-mode 插件随后在页面顶部显示横幅,提供修复入口。
// 若启动仍失败(如 import 了缺失依赖),脚本从错误日志解析失败的 entry id,
// 自动隔离后重试一次。
//
// 用法:
//   dsh-safe start                体检 → 自动隔离 → 启动(默认命令)
//   dsh-safe start --force        跳过「dsh 已在运行」检查
//   dsh-safe status               打印体检报告与隔离清单
//   dsh-safe heal <pkg|id> [--all] [--force]   解除隔离
//   dsh-safe quarantine <pkg> [--force]        手动隔离
//   dsh-safe remove <pkg>         从 profile 移除插件(dsh plugin remove)
//   dsh-safe --profile <name> …   指定 profile(默认 web,或用 DSH_SAFE_PROFILE)
//
// 依赖: 仅 node 内置模块 + dsh 自带的 js-yaml(从 dsh 安装目录解析)。
// ─────────────────────────────────────────────────────────────────────────────
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BOOT_LOG = '/tmp/dsh-safe-boot.log'
let PROFILE = process.env.DSH_SAFE_PROFILE || 'web'
let FORCE = false

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}
function profileDir() {
  return join(dshHome(), 'profiles', PROFILE)
}
function overlayPath() {
  return join(profileDir(), 'safe-mode.overlay.yml')
}
function statePath() {
  return join(profileDir(), 'safe-mode.state.json')
}

// ── dsh 定位 ─────────────────────────────────────────────────────────────────
function findDsh() {
  if (process.env.DSH_BIN && existsSync(process.env.DSH_BIN)) return process.env.DSH_BIN
  const r = spawnSync('which', ['dsh'], { encoding: 'utf8' })
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
  for (const p of [join(homedir(), '.npm-global/bin/dsh'), '/usr/local/bin/dsh', join(homedir(), '.local/bin/dsh')]) {
    if (existsSync(p)) return p
  }
  return null
}

/** 从 dsh bin 一路向上找 @deepseek-ai/dsh 包根目录。 */
function dshPackageRoot(bin) {
  try {
    let dir = dirname(realpathSync(bin))
    for (let i = 0; i < 8 && dir !== dirname(dir); i++, dir = dirname(dir)) {
      const pj = join(dir, 'package.json')
      if (!existsSync(pj)) continue
      try {
        if (JSON.parse(readFileSync(pj, 'utf8')).name === '@deepseek-ai/dsh') return dir
      } catch {
        /* 继续向上 */
      }
    }
  } catch {
    /* 找不到就返回 null */
  }
  return null
}

/** js-yaml: 优先用 dsh 自带的(它依赖 js-yaml),找不到再用本脚本环境的。 */
function loadJsYaml() {
  const bin = findDsh()
  if (bin) {
    const root = dshPackageRoot(bin)
    if (root) {
      try {
        return createRequire(join(root, 'package.json'))('js-yaml')
      } catch {
        /* 落到兜底 */
      }
    }
  }
  try {
    return createRequire(fileURLToPath(import.meta.url))('js-yaml')
  } catch {
    return null
  }
}

/**
 * patch 解析器: js-yaml + 与 dsh 完全一致的 schema。
 * dsh 的 patch 方言允许 !!js 标量(dsh-base / dsh-web-app 的 patch 里就有),
 * 默认 schema 会解析失败。优先直接引用 dsh 安装里的
 * @deepseek-ai/cordis-plugin-include 导出的 entryListSchema(与 dsh 版本绑定);
 * 引用不到时复刻同样的 !!js 标签定义兜底。
 * @returns {{yaml: object, schema: object}} 或 null
 */
function loadPatches() {
  const yaml = loadJsYaml()
  if (!yaml) return null
  let schema
  const bin = findDsh()
  if (bin) {
    const root = dshPackageRoot(bin)
    if (root) {
      try {
        const include = createRequire(join(root, 'package.json'))('@deepseek-ai/cordis-plugin-include')
        schema = include.entryListSchema
      } catch {
        /* 落到兜底 */
      }
    }
  }
  if (!schema) {
    try {
      const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
        kind: 'scalar',
        resolve: (data) => typeof data === 'string',
        construct: (data) => ({ __jsExpr: data })
      })
      schema = yaml.JSON_SCHEMA.extend(JsExpr)
    } catch {
      return null
    }
  }
  return { yaml, schema }
}

// ── profile 与 bundle 解析 ───────────────────────────────────────────────────
function readProfile() {
  const pj = join(profileDir(), 'package.json')
  if (!existsSync(pj)) {
    throw new Error(
      `profile 不存在: ${profileDir()}\n` +
      `先运行一次 \`dsh ${PROFILE}\` 或 \`dsh plugin --profile ${PROFILE} add <package>\` 完成初始化。`
    )
  }
  return JSON.parse(readFileSync(pj, 'utf8'))
}

function resolveBundleDir(pkg) {
  const p = join(profileDir(), 'node_modules', pkg)
  if (existsSync(p)) return p
  const bin = findDsh()
  if (bin) {
    const root = dshPackageRoot(bin)
    if (root) {
      const q = join(root, 'node_modules', pkg)
      if (existsSync(q)) return q
    }
  }
  return null
}

/** node --check;失败时用 stdin + --input-type=module 兜底(部分 node 版本按 CJS 检查)。 */
function checkJs(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (r.status === 0) return { ok: true }
  let src
  try {
    src = readFileSync(file, 'utf8')
  } catch {
    return { ok: false, err: `无法读取 ${file}` }
  }
  const r2 = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: src, encoding: 'utf8' })
  if (r2.status === 0) return { ok: true }
  const err = (r2.stderr || r.stderr || '').split('\n').find(Boolean) || 'syntax error'
  return { ok: false, err: err.slice(0, 300) }
}

/**
 * 体检一个 bundle。返回:
 *   { pkg, dir, ok, rows: [{id, name}], errors: [], warnings: [] }
 * rows 是该 bundle 在 cordis.patch.yml 里插入的行(id/name),隔离时按行禁用它。
 * @param patches - loadPatches() 的返回值 {yaml, schema}
 */
function scanBundle(pkg, patches) {
  const { yaml, schema } = patches
  const out = { pkg, dir: null, ok: true, rows: [], errors: [], warnings: [] }
  const dir = resolveBundleDir(pkg)
  if (!dir) {
    out.ok = false
    out.errors.push('无法定位包目录(profile node_modules 与 dsh 安装目录都没有)')
    return out
  }
  out.dir = dir
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch (e) {
    out.ok = false
    out.errors.push(`package.json 解析失败: ${e.message}`)
    return out
  }
  const patchRel = manifest.dsh?.bundle?.patch
  if (!patchRel) {
    out.ok = false
    out.errors.push('package.json 缺少 dsh.bundle.patch 声明(不是 bundle 或声明被删)')
    return out
  }
  const patchPath = join(dir, patchRel)
  let patchRows
  try {
    patchRows = yaml.load(readFileSync(patchPath, 'utf8'), { schema })
  } catch (e) {
    out.ok = false
    out.errors.push(`${patchRel} 解析失败: ${e.message}`)
    return out
  }
  if (!Array.isArray(patchRows)) {
    out.ok = false
    out.errors.push(`${patchRel} 顶层必须是 YAML 数组`)
    return out
  }
  for (const patch of patchRows) {
    if (!patch || typeof patch !== 'object' || !patch.insert) continue
    const entries = Array.isArray(patch.insert) ? patch.insert : [patch.insert]
    for (const e of entries) {
      if (e && typeof e === 'object' && typeof e.id === 'string') {
        out.rows.push({ id: e.id, name: e.name || pkg })
      }
    }
  }
  if (out.rows.length === 0) out.warnings.push('patch 里没有找到 insert 行(可能全是 edit,不影响体检)')

  const mainRel = manifest.main || 'lib/index.js'
  const mainPath = join(dir, mainRel)
  if (existsSync(mainPath)) {
    const r = checkJs(mainPath)
    if (!r.ok) out.errors.push(`${mainRel} 语法错误: ${r.err}`)
  } else if (manifest.main) {
    out.errors.push(`main 文件不存在: ${mainRel}`)
  } else {
    out.warnings.push('没有 main,也不存在默认 lib/index.js(纯客户端插件?)')
  }
  const clientPath = join(dir, 'lib/client.js')
  if (existsSync(clientPath)) {
    const r = checkJs(clientPath)
    if (!r.ok) out.errors.push(`lib/client.js 语法错误: ${r.err}`)
  }
  if (out.errors.length > 0) out.ok = false
  return out
}

// ── 隔离文件读写 ─────────────────────────────────────────────────────────────
// overlay 是 dsh 真正读取的文件。空时写 '[]' 而不是删除:
// 若进程以 --patch <它> 启动,文件缺失会让重启按钮的拉起直接失败。
function readOverlayIds() {
  const file = overlayPath()
  if (!existsSync(file)) return []
  const ids = []
  for (const m of readFileSync(file, 'utf8').matchAll(/^\s*(?:-\s*)?id:\s*([^\s#]+)/gm)) ids.push(m[1].trim())
  return ids
}

function writeOverlay(ids) {
  const file = overlayPath()
  const head = '# dsh-safe quarantine overlay — generated by dsh-safe. Do not edit by hand.\n'
  if (ids.length === 0) {
    writeFileSync(file, head + '[]\n', 'utf8')
    return
  }
  // patch 格式: 非 insert 条目 = 顶层 id + 覆盖字段(与 loader 写回 / dsh-plugin-manager
  // 持久化的格式一致;没有 `edit:` 包装层)
  writeFileSync(file, head + ids.map((id) => `- id: ${id}\n  disabled: true`).join('\n') + '\n', 'utf8')
}

function readState() {
  try {
    return JSON.parse(readFileSync(statePath(), 'utf8'))
  } catch {
    return { quarantined: [] }
  }
}

function writeState(quarantined) {
  writeFileSync(statePath(), JSON.stringify({ quarantined, updatedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8')
}

/** 把体检出的坏 bundle 写入隔离(按行 id),返回写入的 id 列表。 */
function ensureQuarantine(broken) {
  if (broken.length === 0) {
    const prev = readOverlayIds()
    writeOverlay([])
    writeState([])
    if (prev.length > 0) console.log('✔ 插件全部健康,已清除遗留隔离(overlay 保留空文件,保证重启按钮可用)')
    return []
  }
  const ids = broken.map((b) => b.id)
  writeOverlay(ids)
  writeState(
    broken.map((b) => ({
      id: b.id,
      pkg: b.pkg,
      reason: (b.reason || '').slice(0, 300),
      at: new Date().toISOString()
    }))
  )
  return ids
}

// ── 全量体检 ─────────────────────────────────────────────────────────────────
/**
 * 返回 { bundles: [scanBundle结果...], quarantinable: [坏且可隔离的], composeBroken: [坏到没法隔离的] }
 * 坏 bundle 若解析不出行 id(cordis.patch.yml 坏了 / package.json 坏了)就无法用
 * overlay 禁用 —— 那是「合成期损坏」,只能修文件或从 bundles 列表移除。
 */
function scanAll(patches) {
  const manifest = readProfile()
  const bundles = (manifest.dsh?.profile?.bundles ?? []).map((pkg) => scanBundle(pkg, patches))
  const quarantinable = []
  const composeBroken = []
  for (const b of bundles) {
    if (b.ok) continue
    const reason = b.errors[0] || '未知错误'
    if (b.rows.length === 0) composeBroken.push({ pkg: b.pkg, reason })
    else for (const row of b.rows) quarantinable.push({ pkg: b.pkg, id: row.id, reason })
  }
  return { bundles, quarantinable, composeBroken }
}

// ── 启动 ─────────────────────────────────────────────────────────────────────
async function isDshRunning() {
  try {
    const r = await fetch('http://127.0.0.1:3080/', { signal: AbortSignal.timeout(1200) })
    return r.ok || r.status === 404 // 有服务在答就视为已在运行
  } catch {
    return false
  }
}

function runWeb(onExit) {
  const bin = findDsh()
  if (!bin) {
    console.error('✗ 找不到 dsh 命令;可用 DSH_BIN 环境变量指定路径')
    process.exit(127)
  }
  const args = ['web']
  if (existsSync(overlayPath())) args.push('--patch', overlayPath())
  console.log(`==> 启动: ${bin} ${args.join(' ')}`)
  const child = spawn(bin, args, {
    stdio: ['inherit', 'inherit', 'pipe'],
    env: { ...process.env, DSH_SAFE_PROFILE: PROFILE }
  })
  child.stderr.on('data', (d) => {
    try {
      appendFileSync(BOOT_LOG, d)
    } catch {
      /* 日志写不进就算了 */
    }
    process.stderr.write(d)
  })
  child.on('exit', (code, signal) => onExit(code ?? (signal ? 1 : 0)))
  return child
}

/** 从启动失败日志解析失败的 entry id/name。 */
function parseFailureIds(text) {
  const ids = new Set()
  for (const m of text.matchAll(/failed to \w+ loader entry ([^\s(]+) \(([^)]+)\)/g)) ids.add(m[1])
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/did not activate|failed to load:/.test(lines[i])) continue
    for (let j = i + 1; j < lines.length; j++) {
      const m = /^([^\s:]+): (?:Error|TypeError|ReferenceError|SyntaxError|AggregateError)/.exec(lines[j])
      if (m) ids.add(m[1])
      else if (lines[j].trim() && !/^\s+at /.test(lines[j])) break
    }
  }
  return [...ids]
}

async function cmdStart() {
  const patches = loadPatches()
  if (!patches) {
    console.error('✗ 找不到 js-yaml(dsh 自带依赖里应有;也可在本脚本同目录装一个)')
    process.exit(1)
  }
  if (!FORCE && (await isDshRunning())) {
    console.error('✗ dsh 似乎已在运行 (http://127.0.0.1:3080)。')
    console.error('  已运行的实例无法被本脚本接管;如需安全模式: 先关闭 dsh,再运行本命令;')
    console.error('  或用 --force 强行再启动(端口会被占,不建议)。')
    process.exit(1)
  }

  console.log(`==> 体检 profile「${PROFILE}」: ${profileDir()}`)
  let { bundles, quarantinable, composeBroken } = scanAll(patches)
  printReport(bundles)

  if (composeBroken.length > 0) {
    console.error('\n⚠ 以下插件损坏到无法用 overlay 隔离(合成期失败: package.json / cordis.patch.yml 坏):')
    for (const b of composeBroken) console.error(`   - ${b.pkg}: ${b.reason}`)
    console.error('\n修复方式(任选):')
    console.error(`   1. 修好文件后重跑本命令;`)
    console.error(`   2. 移除插件: dsh plugin --profile ${PROFILE} remove ${composeBroken[0].pkg}`)
    console.error(`   3. 手动编辑 ${join(profileDir(), 'package.json')} 的 dsh.profile.bundles,去掉对应项`)
    process.exit(1)
  }

  if (quarantinable.length > 0) {
    const ids = ensureQuarantine(quarantinable)
    console.log(`\n⚠ 安全模式: 已隔离 ${ids.length} 个损坏条目 → ${overlayPath()}`)
    for (const b of quarantinable) console.log(`   - ${b.id} (${b.pkg}): ${b.reason}`)
  } else {
    ensureQuarantine([])
  }

  let retried = false
  const boot = () => {
    runWeb((code) => {
      if (code === 0) return
      if (retried) {
        console.error(`\n✗ dsh 启动失败(退出码 ${code})。完整日志: ${BOOT_LOG}`)
        console.error('  如果日志显示某插件仍损坏,修好后重跑本命令;若与插件无关,请查看日志。')
        process.exit(code)
      }
      let text = ''
      try {
        text = readFileSync(BOOT_LOG, 'utf8')
      } catch {
        /* 无日志可读 */
      }
      const failed = parseFailureIds(text)
      if (failed.length === 0) {
        console.error(`\n✗ dsh 启动失败(退出码 ${code}),但日志里没有可自动隔离的条目。完整日志: ${BOOT_LOG}`)
        process.exit(code)
      }
      // name → id 映射(有些失败信息里给的是包名而不是行 id)
      const nameToId = new Map()
      for (const b of scanAll(patches).bundles) for (const row of b.rows) nameToId.set(row.name, row.id)
      const newIds = failed.map((f) => nameToId.get(f) || f).filter((id) => !readOverlayIds().includes(id))
      if (newIds.length === 0) {
        console.error(`\n✗ 启动失败,且失败条目已在隔离清单里(说明隔离没生效或错误与插件无关)。日志: ${BOOT_LOG}`)
        process.exit(code)
      }
      const reason = (text.match(/failed to \w+ loader entry [^\n]*/) || [])[0] || '启动失败,自动隔离'
      const existing = readState().quarantined
      const merged = [...existing]
      for (const id of newIds) {
        if (!merged.some((q) => q.id === id)) {
          merged.push({ id, pkg: id, reason, at: new Date().toISOString() })
        }
      }
      writeOverlay([...readOverlayIds(), ...newIds])
      writeState(merged)
      console.log(`\n⚠ 启动失败 → 自动隔离 ${newIds.join(', ')} 后重试(原因: ${reason.slice(0, 120)})`)
      retried = true
      boot()
    })
  }
  boot()
}

// ── 报告 ─────────────────────────────────────────────────────────────────────
function printReport(bundles) {
  const rows = bundles.map((b) => {
    const status = b.ok ? '✓' : '✗'
    const detail = b.ok ? (b.warnings[0] ? `(${b.warnings[0]})` : '') : b.errors[0]
    const rowIds = b.rows.map((r) => r.id).join(', ')
    return `  ${status} ${b.pkg.padEnd(24)} ${rowIds ? `rows: ${rowIds}` : ''} ${detail}`
  })
  console.log(rows.join('\n'))
}

// ── 手动命令 ─────────────────────────────────────────────────────────────────
function cmdStatus() {
  const patches = loadPatches()
  if (!patches) {
    console.error('✗ 找不到 js-yaml')
    process.exit(1)
  }
  console.log(`==> profile「${PROFILE}」: ${profileDir()}`)
  const { bundles } = scanAll(patches)
  printReport(bundles)
  const ids = readOverlayIds()
  const state = readState()
  console.log(`\n==> 隔离清单 (${ids.length}):`)
  if (ids.length === 0) {
    console.log('  (无)')
  } else {
    for (const id of ids) {
      const s = state.quarantined.find((q) => q.id === id)
      console.log(`  ⛔ ${id} (${s?.pkg || id})${s?.reason ? ' — ' + s.reason : ''}${s?.at ? ' @ ' + s.at : ''}`)
    }
  }
  console.log(`\noverlay: ${overlayPath()}`)
}

function cmdHeal(targets) {
  const patches = loadPatches()
  if (!patches) process.exit(1)
  const ids = readOverlayIds()
  const state = readState()
  const all = targets.length === 0 || targets.includes('--all')
  const wanted = all ? ids : []
  for (const t of targets) {
    if (t === '--all' || t === '--force') continue
    const hit = ids.find((id) => id === t) || (state.quarantined.find((q) => q.pkg === t)?.id)
    if (!hit) console.warn(`!! 未在隔离清单中找到 ${t}`)
    else if (!wanted.includes(hit)) wanted.push(hit)
  }
  if (wanted.length === 0) {
    console.log('(隔离清单为空,无需解除)')
    return
  }
  // 语法体检: 仍损坏的拒绝解除(除非 --force)
  for (const id of wanted) {
    const entry = state.quarantined.find((q) => q.id === id)
    if (!entry?.pkg || entry.pkg === id || FORCE) continue
    const dir = resolveBundleDir(entry.pkg)
    if (!dir) continue
    const scan = scanBundle(entry.pkg, patches)
    if (!scan.ok) {
      console.error(`✗ ${entry.pkg} 仍然损坏,拒绝解除: ${scan.errors[0]}`)
      console.error('  修好源码后再试,或用 --force 强制解除(会再次启动失败)。')
      process.exit(1)
    }
  }
  const remaining = ids.filter((id) => !wanted.includes(id))
  writeOverlay(remaining)
  writeState(state.quarantined.filter((q) => !wanted.includes(q.id)))
  console.log(`✔ 已解除隔离: ${wanted.join(', ')}`)
  console.log('  重启 dsh 生效(推荐: dsh-safe start,会自动完成剩余体检)')
}

function cmdQuarantine(pkg) {
  const patches = loadPatches()
  if (!patches) process.exit(1)
  const scan = scanBundle(pkg, patches)
  if (!scan.dir) {
    console.error(`✗ 找不到插件 ${pkg}`)
    process.exit(1)
  }
  if (scan.ok && !FORCE) {
    console.error(`✗ ${pkg} 当前体检是健康的,确认要手动隔离? 加 --force 继续。`)
    process.exit(1)
  }
  const ids = readOverlayIds()
  const state = readState()
  for (const row of scan.rows) {
    if (!ids.includes(row.id)) {
      ids.push(row.id)
      state.quarantined.push({ id: row.id, pkg, reason: '手动隔离', at: new Date().toISOString() })
    }
  }
  if (ids.length === 0) {
    console.error('✗ 该插件没有可隔离的 insert 行;请直接修文件或 dsh-safe remove。')
    process.exit(1)
  }
  writeOverlay(ids)
  writeState(state.quarantined)
  console.log(`✔ 已隔离 ${pkg}: ${scan.rows.map((r) => r.id).join(', ')}`)
  console.log('  重启 dsh 生效(推荐: dsh-safe start)')
}

function cmdRemove(pkg) {
  const bin = findDsh()
  if (!bin) {
    console.error('✗ 找不到 dsh 命令')
    process.exit(127)
  }
  const r = spawnSync(bin, ['plugin', '--profile', PROFILE, 'remove', pkg], {
    stdio: 'inherit',
    env: { ...process.env, DSH_SAFE_PROFILE: PROFILE }
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
  // 顺带清理隔离记录
  const ids = readOverlayIds()
  const state = readState()
  const idxs = state.quarantined.map((q, i) => (q.pkg === pkg ? i : -1)).filter((i) => i >= 0)
  if (idxs.length > 0 || ids.some((id) => state.quarantined.find((q) => q.id === id)?.pkg === pkg)) {
    writeOverlay(ids.filter((id) => !state.quarantined.find((q) => q.id === id && q.pkg === pkg)))
    writeState(state.quarantined.filter((q) => q.pkg !== pkg))
    console.log('✔ 已顺带清除该插件的隔离记录')
  }
  console.log('✔ 已移除。重启 dsh 生效。')
}

// ── 入口 ─────────────────────────────────────────────────────────────────────
const HELP = `dsh-safe — DSH 安全模式入口

用法:
  dsh-safe [--profile <name>] <命令> [参数]

命令:
  start                 体检所有插件 → 自动隔离损坏者 → 以安全模式启动(默认)
                        (启动失败还会自动解析错误、隔离失败条目并重试一次)
  status                打印体检报告与隔离清单
  heal <pkg|id> …       解除隔离(--all 解除全部;仍损坏时拒绝,除非 --force)
  quarantine <pkg>      手动隔离一个插件(--force 跳过健康检查)
  remove <pkg>          从 profile 移除插件(dsh plugin remove)

选项:
  --profile <name>      目标 profile(默认 web;也可用 DSH_SAFE_PROFILE 环境变量)
  --force               跳过「dsh 已在运行」检查 / 强制 heal / quarantine
  -h, --help            显示本帮助

示例:
  dsh-safe start                     # 日常: 体检后启动
  dsh-safe status                    # 看谁坏了
  dsh-safe heal --all                # 修好后全部解除并重启
`

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--profile') {
    PROFILE = args[1]
    args.splice(0, 2)
  }
  if (args.includes('--force')) {
    FORCE = true
    args.splice(args.indexOf('--force'), 1)
  }
  const cmd = args.shift()
  switch (cmd) {
    case undefined:
    case 'start':
      await cmdStart()
      break
    case 'status':
      cmdStatus()
      break
    case 'heal':
      cmdHeal(args)
      break
    case 'quarantine':
      cmdQuarantine(args[0])
      break
    case 'remove':
      cmdRemove(args[0])
      break
    case '-h':
    case '--help':
    case 'help':
      console.log(HELP)
      break
    default:
      console.error(`未知命令: ${cmd}\n`)
      console.log(HELP)
      process.exit(1)
  }
}

await main()
