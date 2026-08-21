// test-host.mjs — host 面单元测试：mock webServer/dshHomePath，验证 CRUD 全流程与异常路径。
// 运行: node test-host.mjs
import { apply } from './lib/index.js'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let passed = 0
let failed = 0
function check(name, cond, detail) {
  if (cond) { passed++; console.log("  ✅ " + name) }
  else { failed++; console.log("  ❌ " + name + (detail ? " — " + detail : "")) }
}

// ── mock 基础设施 ──
const tmpRoot = mkdtempSync(join(tmpdir(), 'dsh-wb-test-'))
const routes = []
let disposeCalls = 0
const mockWebServer = {
  register: (opts) => { routes.push(opts); return () => { disposeCalls++ } },
  tapIndex: () => () => {},
}

const ctx = {
  get: (name) => {
    if (name === 'webServer') return mockWebServer
    if (name === 'dshHomePath') return (...seg) => join(tmpRoot, ...seg)
    return undefined
  },
}

// ── HTTP 模拟 ──
function makeReq(method, url, body) {
  const events = {}
  const req = {
    method,
    url,
    on: (ev, cb) => { (events[ev] = events[ev] || []).push(cb) },
    destroy: () => { (events.error || []).forEach((cb) => cb(new Error("destroyed"))) },
    emit: (ev, data) => { (events[ev] || []).forEach((cb) => cb(data)) },
  }
  // data/end 都异步发出（模拟真实 HTTP：handler 先注册监听，事件随后到达）
  if (body !== undefined) {
    queueMicrotask(() => req.emit('data', Buffer.from(JSON.stringify(body), 'utf8')))
  }
  queueMicrotask(() => req.emit('end'))
  return req
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: null,
    writeHead: (code) => { res.statusCode = code },
    end: (data) => { if (data) { try { res.body = JSON.parse(data.toString()) } catch { res.body = data.toString() } } },
  }
  return res
}

async function call(path, method, body) {
  const route = routes.find((rt) => rt.kind === 'prefix' && path.startsWith(rt.path))
  if (!route) return { statusCode: -1, body: null }
  const req = makeReq(method, path, body)
  const res = makeRes()
  await route.handler(req, res)
  await new Promise((r2) => setTimeout(r2, 10))
  return res
}

// ── 测试 ──
console.log("== host CRUD ==")
const disposer = apply(ctx)
check('apply 注册了 api 路由', routes.some((rt) => rt.kind === 'prefix' && rt.path === '/dsh-whiteboard/api'))
check('apply 注册了 vendor 路由', routes.some((rt) => rt.kind === 'prefix' && rt.path === '/dsh-whiteboard/vendor'))

const storeDir = join(tmpRoot, 'profiles', 'web', 'whiteboard')

// 1. 空列表
let res = await call('/dsh-whiteboard/api/boards', 'GET')
check('空列表返回 []', res.statusCode === 200 && Array.isArray(res.body) && res.body.length === 0, 'status=' + res.statusCode)

// 2. 创建
res = await call('/dsh-whiteboard/api/boards', 'POST', { name: '画布 1' })
check('创建返回 200 + board', res.statusCode === 200 && res.body.board && res.body.board.name === '画布 1', JSON.stringify(res.body))
const id1 = res.body && res.body.board ? res.body.board.id : null
check('创建写入文件', id1 !== null && existsSync(join(storeDir, id1 + '.json')))

// 3. 列表含新画布
res = await call('/dsh-whiteboard/api/boards', 'GET')
check('列表含 1 个画布', res.statusCode === 200 && res.body.length === 1 && res.body[0].id === id1)

// 4. 读取空画布
res = await call('/dsh-whiteboard/api/boards/' + id1, 'GET')
check('读取画布 elements 为空数组', res.statusCode === 200 && Array.isArray(res.body.elements) && res.body.elements.length === 0)

// 5. 保存元素
const elements = [{ id: 'e1', type: 'rectangle', x: 10, y: 20, width: 100, height: 50, points: [[0, 0], [1, 1]] }]
res = await call('/dsh-whiteboard/api/boards/' + id1, 'PUT', { elements, appState: { viewBackgroundColor: '#ffffff' } })
check('保存返回 ok', res.statusCode === 200 && res.body.ok === true)

// 6. 读取验证元素
res = await call('/dsh-whiteboard/api/boards/' + id1, 'GET')
check('读取到保存的元素', res.statusCode === 200 && res.body.elements.length === 1 && res.body.elements[0].type === 'rectangle')
check('appState 保存', res.statusCode === 200 && res.body.appState.viewBackgroundColor === '#ffffff')

// 7. 索引不含 elements
res = await call('/dsh-whiteboard/api/boards', 'GET')
check('索引无 elements 字段', res.statusCode === 200 && res.body[0].elements === undefined)

// 8. 404
res = await call('/dsh-whiteboard/api/boards/no-such-id', 'GET')
check('未知 id 返回 404', res.statusCode === 404)

// 9. 非法 id
res = await call('/dsh-whiteboard/api/boards/..%2F..%2Fevil', 'GET')
check('非法 id 被拒', res.statusCode === 400 || res.statusCode === 404)

// 10. 未知路径
res = await call('/dsh-whiteboard/api/nope', 'GET')
check('未知 api 路径 404', res.statusCode === 404)

// 11. 删除
res = await call('/dsh-whiteboard/api/boards/' + id1, 'DELETE')
check('删除返回 ok', res.statusCode === 200 && res.body.ok === true)
check('文件已删除', !existsSync(join(storeDir, id1 + '.json')))
res = await call('/dsh-whiteboard/api/boards', 'GET')
check('删除后列表为空', res.statusCode === 200 && res.body.length === 0)

// 12. 重复删除幂等
res = await call('/dsh-whiteboard/api/boards/' + id1, 'DELETE')
check('重复删除幂等', res.statusCode === 200)

// 13. 坏 JSON body
const postRoute = routes.find((rt) => rt.path === '/dsh-whiteboard/api')
const badReq = makeReq("POST", "/dsh-whiteboard/api/boards", "{not json")
const badRes = makeRes()
await postRoute.handler(badReq, badRes)
await new Promise((r2) => setTimeout(r2, 10))
check('坏 JSON 不崩溃', badRes.statusCode === 200)

// 14. dispose
const before = disposeCalls
disposer()
check("dispose 清理路由", disposeCalls > before)

// 15. vendor 路径穿越
res = await call('/dsh-whiteboard/vendor/../lib/index.js', 'GET')
check('vendor 路径穿越被拒', res.statusCode === 403 || res.statusCode === 404 || res.statusCode === 500)

// 清理
rmSync(tmpRoot, { recursive: true, force: true })

console.log("")
console.log("结果: " + passed + " 通过, " + failed + " 失败")
process.exit(failed > 0 ? 1 : 0)