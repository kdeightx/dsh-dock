// 冒烟测试：模拟浏览器全局 + DSH ModuleLoader 加载 lib/client.js。
import { readFileSync } from 'node:fs'

// 浏览器全局（bundle 顶层初始化需要）
const makeEl = () => ({
  style: {}, dataset: {}, className: '', tabIndex: 0, disabled: false,
  appendChild: () => {}, remove: () => {}, addEventListener: () => {},
  setAttribute: () => {}, getContext: () => ({}), focus: () => {},
})
globalThis.devicePixelRatio = 2
globalThis.document = {
  createElement: () => makeEl(),
  createElementNS: () => makeEl(),
  head: { appendChild: () => {}, querySelectorAll: () => [] },
  body: { appendChild: () => {}, removeChild: () => {}, querySelectorAll: () => [] },
  documentElement: { style: {}, getAttribute: () => null },
  fonts: { has: () => false, add: () => {}, load: () => Promise.resolve([]) },
  querySelectorAll: () => [],
  addEventListener: () => {}, removeEventListener: () => {},
}
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' })
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.CustomEvent = class { constructor(type) { this.type = type } }
// DOM 类存根（bundle 顶层 instanceof 检查用）
globalThis.Node = class Node {}
globalThis.Element = class Element {}
globalThis.HTMLElement = class HTMLElement {}
globalThis.SVGElement = class SVGElement {}
globalThis.HTMLCanvasElement = class HTMLCanvasElement {}
globalThis.HTMLBRElement = class HTMLBRElement {}
globalThis.HTMLInputElement = class HTMLInputElement {}
globalThis.HTMLTextAreaElement = class HTMLTextAreaElement {}
globalThis.HTMLSelectElement = class HTMLSelectElement {}
globalThis.ImageData = class {}
globalThis.ImageBitmap = class { close() {} }
globalThis.FileReader = class {}
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
globalThis.OffscreenCanvas = class {}
globalThis.Worker = class { terminate() {} }

const code = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8')
let captured = null
const window = {
  __ModuleLoader__: { load: (reg) => { captured = reg } },
  location: { origin: 'http://localhost:3080', href: 'http://localhost:3080/' },
  navigator: globalThis.navigator,
  document: globalThis.document,
  devicePixelRatio: 2,
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  localStorage: { getItem: () => null, setItem: () => {} },
  addEventListener: () => {}, removeEventListener: () => {},
  setTimeout, clearTimeout, requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
  URL, Blob, CustomEvent: globalThis.CustomEvent,
  self: null, top: null,
  EXCALIDRAW_EXPORT_SOURCE: 'http://localhost:3080',
}
const fn = new Function('window', code)
fn(window)

if (!captured) { console.error('FAIL: no registration captured'); process.exit(1) }
if (captured.id !== 'dsh-whiteboard') { console.error('FAIL: bad id', captured.id); process.exit(1) }

// react 系列用 mock（主 bundle 的 apply/inject 不执行 React 逻辑）；
// 真实渲染与 Excalidraw 库的验证由 cdp-lazy.mjs（真实 Chrome）覆盖。
const exportsObj = captured.factory((spec) => {
  if (spec === 'react' || spec === 'react-dom' || spec === 'react/jsx-runtime' || spec === 'react-dom/client') {
    return { __mockReact: true }
  }
  throw new Error('unexpected external require: ' + spec)
})

if (typeof exportsObj.apply !== 'function') { console.error('FAIL: no apply export'); process.exit(1) }
console.log('apply:', typeof exportsObj.apply)
console.log('inject:', JSON.stringify(exportsObj.inject))
console.log('exports keys:', Object.keys(exportsObj))
console.log('SMOKE-OK')