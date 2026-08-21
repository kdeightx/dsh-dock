// excalidraw-entry.js — 独立打包的 Excalidraw 库（延迟加载，首次打开白板时才拉取）。
// 产物由 build.mjs 包装为 excalidraw-lib.js：
//   * react 系列从 window.__WB_REACT 取（主 bundle 注入，保证同一 React 实例）
//   * bundle 执行完毕后挂载 window.__WBExcalidraw = { Excalidraw }
// 注意：显式 import + export（不用 re-export），保证 esbuild cjs 输出逐属性赋值 exports，
// 避免整体替换 module.exports 导致 wrapper 的 exports 引用失效。
import { Excalidraw } from '@excalidraw/excalidraw'
export { Excalidraw }
