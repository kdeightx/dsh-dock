// cdp-lazy.mjs — 验证拆包：页面加载快 + 打开白板时加载 excalidraw-lib
const CDP_HTTP = "http://localhost:9222"
let msgId = 0
const pending = new Map()
let ws = null
const perf = []
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evalJs(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text).slice(0, 300) }
  return r.result && r.result.value
}
async function waitFor(expr, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const v = await evalJs(expr)
    if (v) return v
    await new Promise((r2) => setTimeout(r2, 400))
  }
  console.log("TIMEOUT: " + label)
  return null
}
let tabs = await fetch(CDP_HTTP + "/json/list").then((r2) => r2.json())
let tab = tabs.find((t) => t.type === "page" && t.url.includes("3080"))
if (!tab) {
  await fetch(CDP_HTTP + "/json/new?http://127.0.0.1:3080/", { method: "PUT" })
  await new Promise((r2) => setTimeout(r2, 2000))
  tabs = await fetch(CDP_HTTP + "/json/list").then((r2) => r2.json())
  tab = tabs.find((t) => t.type === "page" && t.url.includes("3080"))
}
ws = new WebSocket(tab.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
  }
}
await send("Runtime.enable")

// 1. 加载性能：reload 计时（到白板按钮出现）
console.log("1. 页面加载计时（硬刷新）…")
const t0 = Date.now()
await send("Page.reload", { ignoreCache: true })
const btn = await waitFor("(function(){var b=Array.from(document.querySelectorAll('button')).find(function(x){return x.title&&x.title.indexOf('白板')>=0});return b?true:false})()", 30000, "白板按钮")
const tLoad = Date.now() - t0
console.log("页面加载→白板按钮就绪:", (tLoad / 1000).toFixed(2) + "s（含 reload + bundle + 会话恢复）")

// 2. 打开白板前 excalidraw-lib 是否已加载
console.log("2. 打开前: __WBExcalidraw =", await evalJs("!!(window.__WBExcalidraw && window.__WBExcalidraw.Excalidraw)"), "| lib script =", await evalJs("!!Array.from(document.querySelectorAll('script')).some(function(s){return s.src.indexOf('excalidraw-lib')>=0})"))

// 3. 点击白板
const t1 = Date.now()
await evalJs("(function(){var b=Array.from(document.querySelectorAll('button')).find(function(x){return x.title&&x.title.indexOf('白板')>=0});if(b){b.click();return true}return false})()")
const ready = await waitFor("(function(){return !!document.querySelector('.excalidraw__canvas')})()", 20000, "画布渲染")
const tOpen = Date.now() - t1
console.log("3. 点击→画布渲染:", (tOpen / 1000).toFixed(2) + "s")

// 4. 画布 + 分割线状态
const st = await evalJs("(function(){var bar=document.querySelector('[data-wb-splitter]');return {canvas:!!document.querySelector('.excalidraw__canvas'),bar:!!bar,libLoaded:!!(window.__WBExcalidraw&&window.__WBExcalidraw.Excalidraw)}})()")
console.log("4. 状态:", JSON.stringify(st))

// 5. 悬停高亮
if (st.bar) {
  const br = await evalJs("(function(){var bar=document.querySelector('[data-wb-splitter]');var r=bar.getBoundingClientRect();return {x:Math.round((r.left+r.right)/2)}})()")
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: br.x, y: 300, button: "none", pointerType: "mouse" })
  await new Promise((r2) => setTimeout(r2, 500))
  const hover = await evalJs("(function(){var bar=document.querySelector('[data-wb-splitter]');var line=bar.firstElementChild;return {lineBg:getComputedStyle(line).backgroundColor,lineW:getComputedStyle(line).width}})()")
  console.log("5. 悬停:", JSON.stringify(hover))
}

// 6. 刷新持久化（open=1 应自动恢复）
console.log("6. 刷新持久化…")
await send("Page.reload", { ignoreCache: true })
const restored = await waitFor("(function(){var bar=document.querySelector('[data-wb-splitter]');return bar?{w:getComputedStyle(bar.parentElement).width}:null})()", 30000, "自动恢复")
console.log("刷新后自动恢复:", JSON.stringify(restored))
ws.close()
console.log("DONE")
