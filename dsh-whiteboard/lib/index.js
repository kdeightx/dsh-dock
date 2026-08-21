// dsh-whiteboard host half — 画布持久化 + vendor 静态资源。
// 存储: ~/.dsh/profiles/<profile>/whiteboard/（boards.json 索引 + <id>.json 画布）
// 端点:
//   GET    /dsh-whiteboard/api/boards              画布列表（meta）
//   POST   /dsh-whiteboard/api/boards  {name}     新建画布
//   GET    /dsh-whiteboard/api/boards/:id         读画布（elements + appState）
//   PUT    /dsh-whiteboard/api/boards/:id         原子写画布
//   DELETE /dsh-whiteboard/api/boards/:id         删除画布
//   GET    /dsh-whiteboard/vendor/*               静态资源（excalidraw.css / fonts）
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const NAME = 'dsh-whiteboard'
const DIAG = '/tmp/dsh-whiteboard.log'

function log(...parts) {
  try { appendFileSync(DIAG, new Date().toISOString() + ' ' + parts.join(' ') + '\n', 'utf8') } catch { /* 日志失败不影响功能 */ }
}

const inject = ['webServer']
export { inject }

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
}

function profileName() {
  return process.env.DSH_WHITEBOARD_PROFILE || 'web'
}

function storeDir(ctx) {
  try {
    const homePath = ctx.get('dshHomePath')
    if (typeof homePath === 'function') return homePath('profiles', profileName(), 'whiteboard')
  } catch { /* fall through */ }
  const home = process.env.DSH_HOME || process.env.HOME || ''
  return join(home, '.dsh', 'profiles', profileName(), 'whiteboard')
}

function boardFile(dir, id) {
  if (!/^[a-z0-9-]{1,64}$/i.test(id || '')) return null
  return join(dir, id + '.json')
}

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) { log('no webServer service'); return }

  const dir = storeDir(ctx)
  mkdirSync(dir, { recursive: true })
  const indexFile = join(dir, 'boards.json')
  log('store dir: ' + dir)

  const readIndex = () => {
    try { return JSON.parse(readFileSync(indexFile, 'utf8')) } catch { return { boards: [] } }
  }
  const writeIndex = (index) => {
    const tmp = indexFile + '.tmp'
    writeFileSync(tmp, JSON.stringify(index, null, 2) + '\n', 'utf8')
    renameSync(tmp, indexFile)
  }
  const readBoard = (file) => {
    try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
  }
  const writeBoard = (file, board) => {
    const tmp = file + '.tmp'
    writeFileSync(tmp, JSON.stringify(board, null, 2) + '\n', 'utf8')
    renameSync(tmp, file)
  }

  const disposers = []
  const register = (kind, path, handler) => {
    try { disposers.push(webServer.register({ kind, path, handler })) }
    catch (err) { log('register failed ' + kind + ' ' + path + ' ' + String(err)) }
  }
  const sendJson = (res, code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(data))
  }
  const readBody = (req) => new Promise((resolve) => {
    const chunks = []
    let size = 0
    const MAX = 20 * 1024 * 1024 // 20MB 防御上限
    req.on('data', (c) => {
      size += c.length
      if (size > MAX) { req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
  const urlPath = (req) => {
    try { return new URL(req.url, 'http://local').pathname } catch { return req.url || '/' }
  }

  // ── REST ──
  register('prefix', '/dsh-whiteboard/api', async (req, res) => {
    try {
      const rest = urlPath(req).replace(/^\/dsh-whiteboard\/api\/?/, '')
      const parts = rest.split('/').filter(Boolean)
      // GET /boards
      if (req.method === 'GET' && parts.length === 1 && parts[0] === 'boards') {
        return sendJson(res, 200, readIndex().boards)
      }
      // POST /boards
      if (req.method === 'POST' && parts.length === 1 && parts[0] === 'boards') {
        const body = await readBody(req)
        const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
        const now = new Date().toISOString()
        const board = { id, name: body.name || '画布', elements: [], appState: {}, createdAt: now, updatedAt: now }
        writeBoard(boardFile(dir, id), board)
        const index = readIndex()
        index.boards.push({ id, name: board.name, createdAt: now, updatedAt: now })
        writeIndex(index)
        return sendJson(res, 200, { board })
      }
      // /boards/:id
      if (parts.length === 2 && parts[0] === 'boards') {
        const file = boardFile(dir, parts[1])
        if (file === null) return sendJson(res, 400, { error: 'bad id' })
        if (req.method === 'GET') {
          const board = readBoard(file)
          if (board === null) return sendJson(res, 404, { error: 'not found' })
          return sendJson(res, 200, board)
        }
        if (req.method === 'PUT') {
          const board = readBoard(file)
          if (board === null) return sendJson(res, 404, { error: 'not found' })
          const body = await readBody(req)
          if (body.name !== undefined) board.name = body.name
          if (body.elements !== undefined) board.elements = body.elements
          if (body.appState !== undefined) board.appState = body.appState
          board.updatedAt = new Date().toISOString()
          writeBoard(file, board)
          const index = readIndex()
          const row = index.boards.find((b) => b.id === parts[1])
          if (row) { row.name = board.name; row.updatedAt = board.updatedAt }
          else index.boards.push({ id: parts[1], name: board.name, createdAt: board.createdAt, updatedAt: board.updatedAt })
          writeIndex(index)
          return sendJson(res, 200, { ok: true })
        }
        if (req.method === 'DELETE') {
          rmSync(file, { force: true })
          const index = readIndex()
          index.boards = index.boards.filter((b) => b.id !== parts[1])
          writeIndex(index)
          return sendJson(res, 200, { ok: true })
        }
      }
      return sendJson(res, 404, { error: 'not found' })
    } catch (err) {
      log('api error: ' + String(err))
      sendJson(res, 500, { error: String(err) })
    }
  })

  // ── vendor 静态资源 ──
  const vendorRoot = normalize(join(import.meta.dirname, 'vendor'))
  register('prefix', '/dsh-whiteboard/vendor', (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end() }
      const rel = urlPath(req).replace(/^\/dsh-whiteboard\/vendor\/?/, '')
      const file = normalize(join(vendorRoot, rel))
      if (!file.startsWith(vendorRoot)) { res.writeHead(403); return res.end() }
      if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end() }
      const body = readFileSync(file)
      res.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      })
      res.end(body)
    } catch (err) {
      log('vendor error: ' + String(err))
      res.writeHead(500)
      res.end()
    }
  })

  return () => {
    for (const d of disposers) { try { d() } catch { /* 忽略 */ } }
  }
}