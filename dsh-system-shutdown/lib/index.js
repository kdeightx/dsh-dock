// dsh-system-shutdown host half.
// POST /dsh-system-shutdown/action -> exits the DSH Web process.
import { appendFileSync } from 'node:fs'

const diag = (line) => {
  try {
    appendFileSync('/tmp/dsh-system-shutdown.log', `${new Date().toISOString()} ${line}\n`, 'utf8')
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
    path: '/dsh-system-shutdown/action',
    handler: async (req, res) => {
      // Answer first so the browser receives the response, then exit.
      sendJson(res, 200, { ok: true })
      setTimeout(() => {
        try {
          diag('shutting down')
        } catch { /* best effort */ }
        process.exit(0)
      }, 800)
    }
  })

  ctx.effect(() => dispose, 'dsh-system-shutdown: route')
}

const inject = ['webServer']
export { inject }
