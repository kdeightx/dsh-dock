// dsh-system-restart host half.
// POST /dsh-system-restart/action -> spawns a fresh process with the current
// argv/env and exits the old one (hot restart).
import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const diag = (line) => {
  try {
    appendFileSync('/tmp/dsh-system-restart.log', `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch { /* best effort */ }
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
          diag('restarting: argv=' + process.argv.slice(1).join(' '))
          const child = spawn(process.execPath, process.argv.slice(1), {
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
