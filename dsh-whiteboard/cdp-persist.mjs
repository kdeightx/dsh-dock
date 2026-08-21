// cdp-persist.mjs — 验证状态持久化：调宽 → 刷新 → 自动恢复
const CDP_HTTP = "http://localhost:9222"
let msgId = 0
const pending = new Map()
let ws = null
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evalJs(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text).slice(0, 200) }
  return r.result && r.result.value
}
async function waitFor(expr, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const v = await evalJs(expr)
    if (v) return v
    await new Promise((r2) => setTimeout(r2, 500))
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
if (!tab) { console.error("NO TAB"); process.exit(1) }
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

// 若白板已开先关闭（清状态）
await evalJs("(function(){var b=Array.from(document.querySelectorAll('button')).find(function(x){return x.title&&x.title.indexOf('白板')>=0});if(b&&getComputedStyle(b).borderColor==='rgb(10, 132, 255)'){b.click();return 'closed'}return 'was-closed'})()")
await new Promise((r2) => setTimeout(r2, 800))

// 清 localStorage 状态（干净起点）
await evalJs("localStorage.removeItem('dsh-whiteboard.open');localStorage.removeItem('dsh-whiteboard.width')")

// 打开白板
console.log("1. 打开白板…")
await evalJs("(function(){var b=Array.from(document.querySelectorAll('button')).find(function(x){return x.title&&x.title.indexOf('白板')>=0});if(b){b.click();return true}return false})()")
await new Promise((r2) => setTimeout(r2, 2000))
let st = await evalJs("(function(){var bar=document.querySelector('[data-wb-splitter]');return {open:localStorage.getItem('dsh-whiteboard.open'),w:bar?getComputedStyle(bar.parentElement).width:null}})()")
console.log("打开后:", JSON.stringify(st))

// 拖动调宽（左移 80px）
const bar = await evalJs("(function(){var bar=document.querySelector('[data-wb-splitter]');var r=bar.getBoundingClientRect();return {x:Math.round((r.left+r.right)/2),y:300}})()")
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: bar.x, y: bar.y, button: "none", pointerType: "mouse" })
await new Promise((r2) => setTimeout(r2, 200))
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: bar.x, y: bar.y, button: "left", buttons: 1, clickCount: 1 })
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: bar.x - 80, y: bar.y, button: "left", buttons: 1 })
await new Promise((r2) => setTimeout(r2, 200))
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: bar.x - 80, y: bar.y, button: "left", buttons: 0, clickCount: 1 })
await new Promise((r2) => setTimeout(r2, 500))
st = await evalJs("(function(){var bar=document.querySelector('[data-wb-splitter]');return {w:bar?getComputedStyle(bar.parentElement).width:null,storedW:localStorage.getItem('dsh-whiteboard.width'),open:localStorage.getItem('dsh-whiteboard.open')}})()")
console.log("2. 拖动后:", JSON.stringify(st))

// 刷新页面
console.log("3. 刷新页面…")
await send("Page.reload", { ignoreCache: true })
const restored = await waitFor("(function(){var bar=document.querySelector('[data-wb-splitter]');return bar?{w:getComputedStyle(bar.parentElement).width}:null})()", 30000, "自动恢复白板")
console.log("4. 刷新后自动恢复:", JSON.stringify(restored))
console.log("localStorage:", JSON.stringify(await evalJs("({open:localStorage.getItem('dsh-whiteboard.open'),w:localStorage.getItem('dsh-whiteboard.width')})")))
ws.close()
console.log("DONE")
