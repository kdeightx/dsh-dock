// dsh-system-restart host half.
// POST /dsh-system-restart/action -> spawns a fresh process with the current
// argv/env and exits the old one (hot restart).
//
// 端口自适应(与 dsh-safe 透明包装器配合):
//   重启时优先拉起包装器(升级免疫方案: ~/.local/bin/dsh),由包装器重新
//   体检并决策端口: 插件健康 → 回到正常模式 3080;仍有隔离 → 继续 9527。
//   兼容旧劫持式安装(argv[1] 是 dsh.real → 去掉 .real);未装包装器时行为不变。
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const diag = (line) => {
  try {
    appendFileSync('/tmp/dsh-system-restart.log', `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch { /* best effort */ }
}

/** 计算重启要拉起的入口: 优先新位置包装器(~/.local/bin/dsh),兼容旧劫持式。 */
const launchBin = () => {
  const self = process.argv[1]
  // 升级免疫方案: ~/.local/bin/dsh(用户目录, npm 升级不覆盖)
  try {
    const localWrapper = join(process.env.HOME || '', '.local', 'bin', 'dsh')
    if (existsSync(localWrapper) && readFileSync(localWrapper, 'utf8').includes('dsh-transparent-wrapper')) {
      diag('launch through wrapper: ' + localWrapper)
      return localWrapper
    }
  } catch { /* 读不到就按旧逻辑 */ }
  // 旧劫持式: argv[1] 是 dsh.real → 去掉 .real 回到包装器
  if (typeof self === 'string' && self.endsWith('.real')) {
    const wrapper = self.slice(0, -'.real'.length)
    diag('launch through wrapper: ' + wrapper)
    return wrapper
  }
  return self
}

const readBody = (req) => new Promise((resolve) => {
  let data = ''
  req.on('data', (chunk) => { data += chunk })
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

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return

  const dispose = webServer.register({
    kind: 'exact',
    path: '/dsh-system-restart/action',
    handler: async (req, res) => {
      // Answer first so the browser receives the response, then restart.
      sendJson(res, 200, { ok: true })
      setTimeout(() => {
        try {
          const bin = launchBin()
          const args = process.argv.slice(2)
          diag('restarting: ' + [bin, ...args].join(' '))
          const child = spawn(process.execPath, [bin, ...args], {
            detached: true,
            stdio: 'inherit',
            env: process.env,
            cwd: process.cwd()
          })
          child.unref()
        } catch (error) {
          diag('restart failed: ' + (error instanceof Error ? error.message : String(error)))
        }
        process.exit(0)
      }, 800)
    }
  })

  ctx.effect(() => dispose, 'dsh-system-restart: route')
}

const inject = ['webServer']
export { inject }
