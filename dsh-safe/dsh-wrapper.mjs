#!/usr/bin/env node
// dsh-transparent-wrapper
// ─────────────────────────────────────────────────────────────────────────────
// dsh 透明包装器 (插入点①: 启动器层)
//
// 由 install-wrapper.sh 安装。之后无论「首次启动 / 手动重启 / 点重启按钮」,
// 最终都会经过本包装器:
//   1. 【前置体检】启动前毫秒级扫描(读 profile + node --check 每个插件):
//        发现坏插件 → 直接隔离 → 直接以安全模式(9527)启动,一次搞定;
//   2. 【正常启动】无坏插件 → 原样转发给真 dsh(行为与原来完全一致);
//   3. 【失败兜底】正常启动仍失败(如体检漏网的 import 依赖缺失)→
//        自动解析错误 → 隔离 → 带 --patch --port 9527 重新启动;
//   4. 非插件错误或正常退出 → 原样透传退出码。
//
// 故障安全: 本脚本自身任何异常都退化为「纯透传」,绝不让 dsh 命令挂掉。
// 依赖: 同目录下的 dsh-safe-core.mjs(dsh-safe.mjs 的副本,由安装脚本复制)。
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process'
import {
  setProfile,
  loadPatches,
  scanAll,
  ensureQuarantine,
  overlayPath,
  readOverlayIds,
  SAFE_PORT,
  NORMAL_PORT
} from './dsh-safe-core.mjs'

/** 真 dsh 绝对路径 —— 由 install-wrapper.sh 写入。 */
const REAL_BIN = '__DSH_REAL_BIN__'

/** 插件加载失败的判定模式(与 dsh-safe 的 parseFailureIds 同源)。 */
const LOAD_FAIL = /failed to \w+ loader entry |plugin tree failed to load|did not activate|failed to load:/

const args = process.argv.slice(2)

// 从 launcher 参数里解析 profile(web 或 --profile <name>)
let profile = 'web'
const pi = args.indexOf('--profile')
if (pi >= 0 && args[pi + 1]) profile = args[pi + 1]
else if (args[0] === 'web') profile = 'web'
setProfile(profile)

// ── 端口自适应 ──────────────────────────────────────────────────────────────
// 若本次启动参数带的是「安全模式专用参数组合」(--patch <当前overlay> + --port <安全端口>,
// 即上一轮安全模式启动/重启按钮延续下来的),则先剥离它们,让前置体检重新决策:
//   插件健康 → 正常模式 3080;有坏插件 → 重新进入安全模式 9527。
// 用户手动传入的 --patch 其它文件 / --port 其它值 不受影响。
const hasSafeOverlay = args.some((a, i) => a === '--patch' && args[i + 1] === overlayPath())

/** 成对跳过安全模式专用参数(标志+值)。 */
function stripSafeArgs(list) {
  const out = []
  for (let i = 0; i < list.length; i++) {
    const a = list[i]
    if (a === '--patch' && list[i + 1] === overlayPath()) {
      i++ // 跳过标志与它的值
      continue
    }
    if (a === '--port' && String(list[i + 1]) === String(SAFE_PORT)) {
      i++
      continue
    }
    out.push(a)
  }
  return out
}

const launchArgs = hasSafeOverlay ? stripSafeArgs(args) : args

/** 直接启动(不观察失败,长驻接管;stdout/stderr 原样透传)。 */
function runDirect(extraArgs) {
  const child = spawn(REAL_BIN, [...launchArgs, ...extraArgs], {
    stdio: 'inherit',
    env: { ...process.env, DSH_REAL_BIN: REAL_BIN }
  })
  child.on('exit', (c) => process.exit(c ?? 1))
}

/** 带 stderr 收集的启动(失败判定用;错误同时实时转发给用户)。 */
function runCollect(extraArgs, onExit) {
  const child = spawn(REAL_BIN, [...launchArgs, ...extraArgs], {
    stdio: ['inherit', 'inherit', 'pipe'],
    env: { ...process.env, DSH_REAL_BIN: REAL_BIN }
  })
  let err = ''
  child.stderr.on('data', (d) => {
    err += d
    process.stderr.write(d)
  })
  child.on('exit', (code, signal) => onExit(code ?? (signal ? 1 : 0), err))
  return child
}

/** 组装安全模式参数: 启动参数 + --patch overlay + --port 9527(已有则不重复)。 */
function buildSafeArgs() {
  const safe = [...launchArgs]
  if (!safe.includes('--patch')) safe.push('--patch', overlayPath())
  if (!safe.includes('--port')) safe.push('--port', String(SAFE_PORT))
  return safe
}

/** 自动隔离并直接进入安全模式。 */
function enterSafeMode(reason) {
  console.log(`\n⚠ [dsh] ${reason}`)
  let ids = readOverlayIds()
  const patches = loadPatches()
  if (patches) {
    const { quarantinable } = scanAll(patches)
    if (quarantinable.length > 0) ids = ensureQuarantine(quarantinable)
  }
  console.log(`⚠ [dsh] 安全模式: 已隔离 [${ids.join(', ')}] → http://127.0.0.1:${SAFE_PORT}`)
  console.log(`⚠ [dsh] 正常模式端口 ${NORMAL_PORT};修复插件后点便签「解除隔离并重启」或运行 dsh-safe heal --all 即回。\n`)
  runDirect(buildSafeArgs())
}

try {
  // ── 前置体检: 先查后启,避免「失败启动 + 重试」的双倍 boot 时间 ──
  const patches = loadPatches()
  if (patches) {
    const { quarantinable, composeBroken } = scanAll(patches)
    if (quarantinable.length > 0) {
      enterSafeMode('体检发现插件有问题,直接进入安全模式')
      // enterSafeMode 内 runDirect 接管,不再往下走
    } else if (composeBroken.length > 0) {
      console.error('\n⚠ [dsh] 以下插件损坏到无法自动隔离(合成期失败: package.json / cordis.patch.yml 坏):')
      for (const b of composeBroken) console.error(`   - ${b.pkg}: ${b.reason}`)
      console.error(`⚠ [dsh] 请修复文件或移除: dsh plugin --profile ${profile} remove <包名>;详情: dsh-safe status`)
      process.exit(1)
    } else {
      // 健康: 正常启动,失败则降级兜底
      runCollect([], (code, err) => {
        if (code === 0) process.exit(0)
        if (LOAD_FAIL.test(err)) {
          enterSafeMode('检测到插件加载失败,自动进入安全模式')
        } else {
          console.error(`\n[dsh] 启动失败(退出码 ${code}),且不是插件加载错误,原样退出。`)
          process.exit(code)
        }
      })
    }
  } else {
    // 体检模块不可用(罕见): 退化为纯透传(故障安全)
    runDirect([])
  }
} catch (e) {
  // 故障安全: 本脚本自身出错,直接透传真 dsh,绝不让 dsh 命令挂掉
  console.error(`[dsh] wrapper 自身异常(${String(e)}),已退化为直连真 dsh。`)
  runDirect([])
}
