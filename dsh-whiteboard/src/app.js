// dsh-whiteboard — browser half（构建产物 = lib/client.js）。
// 形态：会话头部右上角「白板」按钮 → 右侧滑出独立白板窗口（默认占窗口 2/3），
// 与对话区并排；窗口与对话区之间的分隔线可左右拖动（split pane），宽度记忆。
// 画布经 host 端点持久化（~/.dsh/profiles/<profile>/whiteboard/*.json）。
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom'
import * as ReactDOM from 'react-dom'
import * as jsxRuntime from 'react/jsx-runtime'
// Excalidraw 拆到独立 bundle（excalidraw-lib.js，首次打开白板时加载），
// 这里把 React 全家桶暴露给它，保证两个 bundle 共用同一 React 实例
window.__WB_REACT = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  'react-dom': ReactDOM,
  'react-dom/client': ReactDOM,
}

const API = '/dsh-whiteboard/api'
const VENDOR_CSS = '/dsh-whiteboard/vendor/excalidraw.css'
const LS_CURRENT = 'dsh-whiteboard.current'
const LS_WIDTH = 'dsh-whiteboard.width'
const LS_OPEN = 'dsh-whiteboard.open'   // 白板开/关状态（刷新后自动恢复）
const SAVE_DEBOUNCE_MS = 800
const MIN_W = 360

// ── 开合/宽度单例 ──
const openListeners = new Set()
let openState = false
let panelEl = null       // surface 挂载点（React 容器）
let panelWrapper = null  // 窗口 wrapper（fixed 右侧；分割线挂这里，React 清不掉）
let opening = false      // 滑入动画进行中（防重入；动画完成后才挂载 excalidraw）
let centerEl = null      // 官方 center 列（对话区），收缩用 margin-right
let panelWidth = 0
let dragActive = false
let activeFlush = null   // surface 挂载时注册的 flushSave
function setOpen(v) {
  if (openState === v) return
  openState = v
  for (const fn of openListeners) fn(v)
}
function subscribeOpen(fn) {
  openListeners.add(fn)
  return () => { openListeners.delete(fn) }
}
const clampW = (w, vw) => Math.min(Math.max(Math.round(w), MIN_W), Math.round(vw * 0.85))

async function api(path, method = 'GET', body) {
  const res = await fetch(API + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error('whiteboard ' + method + ' ' + path + ': ' + res.status)
  if (res.status === 204) return null
  return res.json()
}

// ── Excalidraw 延迟加载 ──
let wbLibPromise = null
function getExcalidraw() {
  return (window.__WBExcalidraw && window.__WBExcalidraw.Excalidraw) || null
}
function loadExcalidrawLib() {
  const existing = getExcalidraw()
  if (existing) return Promise.resolve()
  if (!wbLibPromise) {
    wbLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = '/dsh-whiteboard/vendor/excalidraw-lib.js'
      s.onload = () => resolve()
      s.onerror = () => { wbLibPromise = null; reject(new Error('excalidraw lib load failed')) }
      document.head.appendChild(s)
    })
  }
  return wbLibPromise
}
// 页面空闲时预加载：用 <link rel="preload"> 只下载不执行（浏览器缓存，
// 打开白板时立即执行）；避免启动阶段解析 6.3MB 阻塞主线程拖慢 DSH 加载
function preloadExcalidraw() {
  const start = () => {
    try {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'script'
      link.href = '/dsh-whiteboard/vendor/excalidraw-lib.js'
      document.head.appendChild(link)
    } catch { /* 预加载失败不打扰 */ }
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 8000 })
  else setTimeout(start, 3000)
}

// ── 主题跟随 ──
function useTheme() {
  const [dark, setDark] = useState(() =>
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e) => setDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return dark ? 'dark' : 'light'
}

// ── 铅笔图标（SVG，跟随 currentColor）──
function PencilIcon() {
  return React.createElement('svg', {
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { flex: 'none' },
  },
    React.createElement('path', { d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' }),
    React.createElement('path', { d: 'm15 5 4 4' }))
}

// ── 头部右上角按钮（conversation.session.header.utilities，右对齐）──
function WhiteboardHeaderAction() {
  const [open, setOpenState] = useState(openState)
  const [hover, setHover] = useState(false)
  useEffect(() => subscribeOpen(setOpenState), [])
  const base = {
    border: '1px solid var(--dsw-alias-border-l2, #d0d0d0)',
    height: 32, color: 'var(--dsw-alias-label-primary, #1a1a1a)',
    fontFamily: 'var(--dsw-font-family, inherit)', cursor: 'pointer',
    background: 'transparent', borderRadius: 18,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 5, padding: '6px 12px', fontSize: 13, lineHeight: '20px', whiteSpace: 'nowrap',
  }
  const hoverStyle = { background: 'var(--dsw-alias-interactive-bg-hover, #f0f0f0)' }
  const activeStyle = {
    background: 'var(--dsw-alias-interactive-bg-hover, #f0f0f0)',
    borderColor: 'var(--dsw-alias-state-accent-primary, #0a84ff)',
  }
  return React.createElement('button', {
    type: 'button',
    style: { ...base, ...(open ? activeStyle : hover ? hoverStyle : {}) },
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    onClick: () => { if (openState) closeWhiteboard(); else openWhiteboard() },
    title: '白板（右侧窗口）',
  },
    React.createElement(PencilIcon, null),
    React.createElement('span', null, '白板'))
}

// ── AppFrame 布局定位：grid 三列 [sidebar, center, (handle), details]，center = 第 2 个子元素 ──
function findFrame() {
  const handle = document.querySelector('[data-side="details"]')
  if (handle && handle.parentElement) return handle.parentElement
  return document.querySelector('[style*="grid-template-columns"]') || null
}
function findCenterCol() {
  const frame = findFrame()
  if (!frame) return null
  const kids = Array.from(frame.children)
  return kids[1] || null
}

// 分隔条拖拽：改面板宽度 + center 列 margin-right（对话区同步收缩）
const ACCENT = 'var(--dsw-alias-state-accent-primary, #0a84ff)'
function initDrag(bar, panel, line) {
  let dragging = false
  let startX = 0
  let startW = 0
  let moved = false
  const setLine = (color, width, glow) => {
    line.style.background = color
    line.style.width = width
    line.style.boxShadow = glow || 'none'
  }
  const setBar = (color) => { bar.style.background = color }
  const highlight = () => {
    // 只高亮分割线本身；热区背景保持透明（无光晕、无色带）
    setBar('transparent')
    setLine(ACCENT, '3px', 'none')
  }
  const dim = () => {
    setBar('transparent')
    setLine('var(--dsw-alias-border-l2, rgba(0,0,0,.18))', '1px', 'none')
  }
  bar.addEventListener('pointerdown', (e) => {
    dragging = true
    dragActive = true
    moved = false
    startX = e.clientX
    startW = panel.offsetWidth
    bar.setPointerCapture(e.pointerId)
    highlight()
    e.preventDefault()
  })
  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const dx = e.clientX - startX
    if (Math.abs(dx) > 2) moved = true
    if (!moved) return
    const w = clampW(startW - dx, window.innerWidth)
    panel.style.width = w + 'px'
    if (centerEl) centerEl.style.marginRight = w + 'px'
    panelWidth = w
  })
  const end = () => {
    if (!dragging) return
    dragging = false
    dragActive = false
    dim()
    if (moved) { try { localStorage.setItem(LS_WIDTH, String(panelWidth)) } catch { /* 忽略 */ } }
  }
  bar.addEventListener('pointerup', end)
  bar.addEventListener('pointercancel', end)
  bar.addEventListener('pointerover', () => {
    if (!dragActive) highlight()
  })
  bar.addEventListener('pointerout', (e) => {
    // 移到 bar 的子元素（line）不熄灭；真正离开 bar 才熄灭
    if (!dragActive && (!e.relatedTarget || !bar.contains(e.relatedTarget))) dim()
  })
  // 双击：恢复默认 2/3 宽度
  bar.addEventListener('dblclick', () => {
    const w = clampW(Math.round(window.innerWidth * 2 / 3), window.innerWidth)
    panel.style.width = w + 'px'
    if (centerEl) centerEl.style.marginRight = w + 'px'
    panelWidth = w
    try { localStorage.setItem(LS_WIDTH, String(w)) } catch { /* 忽略 */ }
  })
}

// 打开：右侧滑出白板窗口（默认 2/3 窗口宽，记忆上次宽度），对话区收缩。
// ⚠️ 时序关键：先播放滑入动画，动画完成（元素到达最终位置）后才挂载 excalidraw——
// 否则它初始化时读取到的容器位置是屏幕外的（transform 影响 getBoundingClientRect），
// offsetLeft/offsetTop 缓存错误 → 画的图形全部落在视口外。
function openWhiteboard() {
  if (openState || opening) return
  opening = true
  let el = null
  try {
  const vw = window.innerWidth
  let w = 0
  try { w = parseInt(localStorage.getItem(LS_WIDTH) || '', 10) || 0 } catch { /* 忽略 */ }
  if (!(w > 0)) w = Math.round(vw * 2 / 3)
  w = clampW(w, vw)
  panelWidth = w
  centerEl = findCenterCol()
  if (centerEl) centerEl.style.marginRight = w + 'px'
  // wrapper：fixed 窗口（动画/宽度在 wrapper 上），分割线挂 wrapper 而非 panelEl——
  // 因为 WhiteboardPanel 的 createRoot(panelEl) 渲染 surface 时会清空 panelEl 内已有节点（bar 会被删）
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:' + w + 'px;z-index:60;transform:translateX(100%);transition:transform .25s ease;min-width:0;'
  document.body.appendChild(wrapper)
  // 分隔条：热区 24px（好命中），内嵌一条 2px 常驻可见分割线骑在窗口左边缘；
  // 悬停/拖动时线高亮。热区全部在画布外侧，不遮挡绘制。
  const bar = document.createElement('div')
  bar.style.cssText = 'position:absolute;left:-14px;top:0;bottom:0;width:24px;cursor:col-resize;z-index:30;background:transparent;'
  bar.title = '拖动调整白板宽度（双击恢复默认）'
  bar.dataset.wbSplitter = '1'
  const line = document.createElement('div')
  line.style.cssText = 'position:absolute;left:13.5px;top:0;bottom:0;width:1px;background:var(--dsw-alias-border-l2, rgba(0,0,0,.18));transition:background .15s ease,width .15s ease,box-shadow .15s ease;'
  bar.appendChild(line)
  wrapper.appendChild(bar)
  initDrag(bar, wrapper, line)
  // panelEl：仅作 surface 挂载点（React 渲染容器）
  el = document.createElement('div')
  el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base,#ffffff);box-shadow:-2px 0 8px rgba(0,0,0,.06);min-width:0;'
  wrapper.appendChild(el)
  panelEl = el
  panelWrapper = wrapper
  requestAnimationFrame(() => { wrapper.style.transform = 'translateX(0)' })
  } catch (err) {
    // 任何失败都复位标志并清理半成品，保证下次点击可重试
    console.error('[dsh-whiteboard] openWhiteboard failed', err)
    if (el && el.parentElement) el.parentElement.removeChild(el)
    if (panelWrapper && panelWrapper.parentElement) panelWrapper.parentElement.removeChild(panelWrapper)
    panelEl = null
    panelWrapper = null
    opening = false
    return
  }
  // 动画（250ms）结束后再挂载 excalidraw；300ms 兜底（transitionend 在某些环境不触发）
  setTimeout(() => {
    opening = false
    setOpen(true)
    try { localStorage.setItem(LS_OPEN, '1') } catch { /* 忽略 */ }
  }, 300)
}

function closeWhiteboard() {
  if (!openState) return
  try { activeFlush && activeFlush() } catch (err) { console.error('[dsh-whiteboard] flush', err) }
  try { localStorage.setItem(LS_OPEN, '0') } catch { /* 忽略 */ }
  setOpen(false)
}

// ── 白板窗口内容 ──
function WhiteboardSurface({ onClose }) {
  const hostRef = useRef(null)
  const rootRef = useRef(null)         // react-dom root
  const apiRef = useRef(null)          // excalidraw imperative API
  const readyRef = useRef(false)       // excalidraw API 就绪信号（修复加载竞态）
  const pendingIdRef = useRef(null)    // API 就绪前挂起的画布 id
  const currentIdRef = useRef(null)
  const saveTimer = useRef(null)
  const userChangedRef = useRef(false) // 用户真正画过才自动保存（加载/切换不触发）
  const dirtyRef = useRef(false)       // 有未落盘的修改（周期性快照用）
  const [boards, setBoards] = useState([])
  const [currentId, setCurrentId] = useState(null)
  const [status, setStatus] = useState('')
  const theme = useTheme()

  const flushSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    const api0 = apiRef.current
    const id = currentIdRef.current
    if (!api0 || !id) return
    dirtyRef.current = false
    const elements = api0.getSceneElements()
    const appState = api0.getAppState()
    api('/boards/' + id, 'PUT', {
      elements,
      appState: { viewBackgroundColor: appState.viewBackgroundColor, name: appState.name },
    }).catch((err) => {
      dirtyRef.current = true // 保存失败：标记脏，周期性快照会重试
      console.error('[dsh-whiteboard] save failed', err)
    })
  }, [])

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS)
  }, [flushSave])

  const loadBoard = useCallback(async (id) => {
    const api0 = apiRef.current
    if (!api0 || !id) return
    try {
      const data = await api('/boards/' + id)
      userChangedRef.current = false
      api0.updateScene({
        elements: data.elements || [],
        appState: {
          viewBackgroundColor: data.appState && data.appState.viewBackgroundColor,
          name: data.appState && data.appState.name,
        },
      })
      setStatus('')
    } catch (err) {
      console.error('[dsh-whiteboard] load failed', err)
      setStatus('加载失败: ' + err.message)
    }
  }, [])

  // 加载入口：excalidraw API 未就绪时先挂起，就绪回调里补加载
  const tryLoad = useCallback((id) => {
    if (!id) return
    if (readyRef.current) loadBoard(id)
    else pendingIdRef.current = id
  }, [loadBoard])

  // 初始化：列画布 → 选中（记忆的或第一个）
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let list = await api('/boards')
        if (cancelled) return
        if (!Array.isArray(list) || list.length === 0) {
          const created = await api('/boards', 'POST', { name: '画布 1' })
          list = [created.board]
        }
        const saved = localStorage.getItem(LS_CURRENT) || ''
        const target = list.find((b) => b.id === saved) || list[0]
        setBoards(list)
        currentIdRef.current = target.id
        setCurrentId(target.id)
        tryLoad(target.id)
      } catch (err) {
        if (!cancelled) setStatus('白板初始化失败: ' + err.message)
      }
    })()
    return () => { cancelled = true }
  }, [loadBoard])

  // 挂载 excalidraw（link 注入样式；直接挂普通 DOM，portal 弹层才能正常显示）
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = VENDOR_CSS
    link.dataset.dshWhiteboard = '1'
    document.head.appendChild(link)

    let cancelled = false
    const render = () => {
      const Exc = getExcalidraw()
      if (!Exc) return
      if (!rootRef.current) rootRef.current = createRoot(host)
      rootRef.current.render(React.createElement(Exc, {
        theme,
        langCode: 'zh-CN',
        excalidrawAPI: (api0) => {
          apiRef.current = api0
          readyRef.current = true
          // 补加载：初始化期间 API 未就绪而挂起的画布
          if (pendingIdRef.current) {
            const id = pendingIdRef.current
            pendingIdRef.current = null
            loadBoard(id)
          } else if (currentIdRef.current) {
            loadBoard(currentIdRef.current)
          }
          // 画布就绪：把键盘焦点移到白板窗口（否则焦点停在打开按钮/输入框，
          // excalidraw 的快捷键会对 input/button 目标跳过，按 B/E/空格无反应）
          try { host.focus({ preventScroll: true }) } catch { host.focus() }
        },
        onChange: () => { if (userChangedRef.current) { dirtyRef.current = true; scheduleSave() } },
      }))
    }
    loadExcalidrawLib().then(() => {
      if (!cancelled) render()
    }).catch((err) => console.error('[dsh-whiteboard] excalidraw lib failed', err))
    // 点击画布时收回焦点（不打扰 excalidraw 内部的文字/颜色输入）
    const onPointerDown = () => {
      const ae = document.activeElement
      const editing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || (typeof ae.isContentEditable === 'boolean' && ae.isContentEditable))
      if (!editing) { try { host.focus({ preventScroll: true }) } catch { host.focus() } }
    }
    host.addEventListener('pointerdown', onPointerDown)
    // 刷新/关闭页面前强制落盘（防抖窗口内的修改不丢；keepalive 请求体限 64KB，超限忽略）
    const onUnload = () => {
      try {
        const api0 = apiRef.current
        const id = currentIdRef.current
        if (!api0 || !id) return
        const body = JSON.stringify({
          elements: api0.getSceneElements(),
          appState: { viewBackgroundColor: api0.getAppState().viewBackgroundColor, name: api0.getAppState().name },
        })
        if (body.length < 60 * 1024) {
          fetch('/dsh-whiteboard/api/boards/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
          }).catch(() => {})
        }
      } catch { /* 刷新前保存失败不阻塞 */ }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      cancelled = true
      clearTimeout(saveTimer.current)
      window.removeEventListener('beforeunload', onUnload)
      host.removeEventListener('pointerdown', onPointerDown)
      if (rootRef.current) { rootRef.current.unmount(); rootRef.current = null }
      apiRef.current = null
      activeFlush = null
      for (const el of document.querySelectorAll('link[data-dsh-whiteboard]')) el.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 注册 flush 供关闭时落盘
  useEffect(() => {
    activeFlush = flushSave
  }, [flushSave])

  // 周期性快照：连续绘制（防抖被反复重置）期间也保证定期落盘
  useEffect(() => {
    const timer = setInterval(() => { if (dirtyRef.current) flushSave() }, 5000)
    return () => clearInterval(timer)
  }, [flushSave])

  // 主题变化时重渲染 excalidraw
  useEffect(() => {
    if (rootRef.current && getExcalidraw()) {
      rootRef.current.render(React.createElement(getExcalidraw(), {
        theme,
        langCode: 'zh-CN',
        excalidrawAPI: (api0) => {
          apiRef.current = api0
          readyRef.current = true
          if (pendingIdRef.current) {
            const id = pendingIdRef.current
            pendingIdRef.current = null
            loadBoard(id)
          }
        },
        onChange: () => { if (userChangedRef.current) { dirtyRef.current = true; scheduleSave() } },
      }))
    }
  }, [theme, scheduleSave])

  // 切换画布
  const switchBoard = (id) => {
    if (!id || id === currentIdRef.current) return
    flushSave()
    currentIdRef.current = id
    setCurrentId(id)
    localStorage.setItem(LS_CURRENT, id)
    loadBoard(id)
  }

  const createBoard = async () => {
    try {
      const created = await api('/boards', 'POST', { name: '画布 ' + (boards.length + 1) })
      const list = [...boards, created.board]
      setBoards(list)
      localStorage.setItem(LS_CURRENT, created.board.id)
      currentIdRef.current = created.board.id
      setCurrentId(created.board.id)
      userChangedRef.current = false
      apiRef.current && apiRef.current.updateScene({ elements: [] })
    } catch (err) {
      console.error('[dsh-whiteboard] create failed', err)
      setStatus('新建失败: ' + err.message)
    }
  }

  const deleteBoard = async () => {
    const id = currentIdRef.current
    if (!id) return
    const name = (boards.find((b) => b.id === id) || {}).name || ''
    if (!window.confirm('删除当前画布「' + name + '」？此操作不可恢复。')) return
    try {
      await api('/boards/' + id, 'DELETE')
      let list = boards.filter((b) => b.id !== id)
      if (list.length === 0) {
        const created = await api('/boards', 'POST', { name: '画布 1' })
        list = [created.board]
      }
      setBoards(list)
      localStorage.setItem(LS_CURRENT, list[0].id)
      currentIdRef.current = list[0].id
      setCurrentId(list[0].id)
      loadBoard(list[0].id)
    } catch (err) {
      console.error('[dsh-whiteboard] delete failed', err)
      setStatus('删除失败: ' + err.message)
    }
  }

  const close = () => { onClose() }

  // ── 窗口顶栏 ──
  const dark = theme === 'dark'
  const bar = {
    flex: '0 0 auto', height: 40, display: 'flex', alignItems: 'center', gap: 6,
    padding: '0 10px', boxSizing: 'border-box', minWidth: 0,
    borderBottom: '1px solid ' + (dark ? '#3a3a42' : '#e2e2e2'),
  }
  const btn = {
    cursor: 'pointer', height: 26, padding: '0 8px', borderRadius: 8,
    border: '1px solid ' + (dark ? '#4a4a55' : '#d0d0d0'),
    background: dark ? '#2e2e36' : '#f7f7f8', color: dark ? '#e8e8ea' : '#1a1a1a',
    fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap', flex: '0 0 auto',
  }
  const selectStyle = {
    height: 26, borderRadius: 8, border: '1px solid ' + (dark ? '#4a4a55' : '#d0d0d0'),
    background: dark ? '#2e2e36' : '#ffffff', color: dark ? '#e8e8ea' : '#1a1a1a',
    fontSize: 12, fontFamily: 'inherit', maxWidth: 160, minWidth: 0, flex: '0 1 auto',
  }

  return React.createElement('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', minWidth: 0 } },
    React.createElement('div', { style: bar },
      React.createElement('select', {
        value: currentId || '', style: selectStyle,
        onChange: (e) => switchBoard(e.target.value),
        title: '切换画布',
      }, boards.map((b) =>
        React.createElement('option', { key: b.id, value: b.id }, b.name))),
      React.createElement('button', { style: btn, onClick: createBoard, title: '新建画布' }, '＋ 新建'),
      React.createElement('button', { style: btn, onClick: deleteBoard, title: '删除当前画布' }, '🗑 删除'),
      status !== '' && React.createElement('span', {
        style: { fontSize: 11, color: dark ? '#f2a0a0' : '#c0392b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }
      }, status),
      React.createElement('div', { style: { flex: 1 } }),
      React.createElement('button', {
        style: { ...btn, borderColor: 'transparent', background: 'none', fontSize: 15, padding: '0 4px' },
        onClick: close, title: '关闭',
      }, '✕')),
    React.createElement('div', { ref: hostRef, tabIndex: -1, style: { flex: 1, position: 'relative', minHeight: 0, outline: 'none' } }))
}

// ── 白板窗口生命周期 ──
function WhiteboardPanel() {
  // 初始同步 openState：会话切换导致组件重挂时，若白板仍开着则恢复挂载
  const [open, setOpenState] = useState(openState)
  const [root, setRoot] = useState(null)
  useEffect(() => subscribeOpen(setOpenState), [])
  useEffect(() => {
    if (open) setRoot(panelEl)
    else setRoot(null)
  }, [open])
  useEffect(() => {
    if (!open || !root) return
    const reactRoot = createRoot(root)
    reactRoot.render(React.createElement(WhiteboardSurface, { onClose: closeWhiteboard }))
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      const t = e.target
      if (t && typeof t.closest === 'function' && t.closest('.excalidraw')) return
      closeWhiteboard()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      reactRoot.unmount()
      if (root.parentElement) root.parentElement.removeChild(root)
      if (panelWrapper && panelWrapper.parentElement) panelWrapper.parentElement.removeChild(panelWrapper)
      panelEl = null
      panelWrapper = null
      if (centerEl) { centerEl.style.marginRight = ''; centerEl = null }
    }
  }, [open, root])
  // 卸载兜底：组件被移除（会话切换/插件禁用）时若白板仍开着，清理 DOM 与状态
  useEffect(() => {
    return () => {
      opening = false // 无条件复位：任何路径都不会把 opening 卡死
      if (!openState) return
      if (panelEl && panelEl.parentElement) panelEl.parentElement.removeChild(panelEl)
      if (panelWrapper && panelWrapper.parentElement) panelWrapper.parentElement.removeChild(panelWrapper)
      panelEl = null
      panelWrapper = null
      if (centerEl) { centerEl.style.marginRight = ''; centerEl = null }
      openState = false
      dragActive = false // 防止拖拽标志卡死导致 hover 高亮永久失效
    }
  }, [])
  return null
}

// ── cordis 插件入口 ──
export function apply(ctx) {
  const slots = ctx.get('slots')
  if (slots === undefined) return
  // 页面空闲时预加载 Excalidraw 库（点开白板时无需等待）
  preloadExcalidraw()
  const disposers = []
  disposers.push(slots.inject('conversation.session.header.utilities', () => slots.register(
    { name: 'conversation.session.header.utilities', id: 'whiteboard-toggle', order: 10 },
    () => React.createElement(WhiteboardHeaderAction, null),
  )))
  disposers.push(slots.inject('conversation.session.header.utilities', () => slots.register(
    { name: 'conversation.session.header.utilities', id: 'whiteboard-panel', order: 99 },
    () => React.createElement(WhiteboardPanel, null),
  )))
  // 刷新后自动恢复：上次白板开着 → 等页面完全加载（load 事件 + 会话 header 就绪）后自动打开。
  // 延迟到页面稳定后再解析 6.3MB 的 excalidraw 库，避免拖慢 DSH 启动界面
  let restoreTries = 0
  const restoreTimer = setInterval(() => {
    restoreTries++
    let shouldOpen = false
    try { shouldOpen = localStorage.getItem(LS_OPEN) === '1' } catch { /* 忽略 */ }
    if (!shouldOpen || openState || opening) {
      if (restoreTries > 90) clearInterval(restoreTimer) // 45s 超时
      return
    }
    if (document.readyState !== 'complete') return // 等页面资源加载完成
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.title && b.title.indexOf('白板') >= 0)
    if (btn) {
      clearInterval(restoreTimer)
      setTimeout(() => {
        try { openWhiteboard() } catch (err) { console.error('[dsh-whiteboard] auto-restore failed', err) }
      }, 400) // 再缓 400ms，确保主线程空闲
    } else if (restoreTries > 90) {
      clearInterval(restoreTimer)
    }
  }, 500)
  disposers.push(() => clearInterval(restoreTimer))
  return () => {
    for (const d of disposers) { try { d() } catch {} }
  }
}

export const inject = ['slots']