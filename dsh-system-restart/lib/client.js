// dsh-system-restart browser half: the sidebar-foot 「重启 DSH」 row, styled
// like the settings trigger, with a DSH-styled confirm modal.
//
// Flow (deliberately simple): click confirm → POST /action → the button shows
// 「正在重启…」 and the page polls the origin every 1.5s. Once the server has
// dropped and come back (or 10s passed without any drop, as a fallback), the
// page reloads itself. A freshly loaded page is the confirmation that the
// restart happened.
window.__ModuleLoader__.load({
  id: 'dsh-system-restart',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    let react = require('react')

    // ── DSH-styled modal (self-contained copy) ───────────────────────────────
    let modalRoot = null
    const closeModal = () => {
      if (modalRoot !== null) { modalRoot.remove(); modalRoot = null }
    }
    const el = (tag, style, children) => {
      const node = document.createElement(tag)
      if (style !== undefined && style !== null) node.style.cssText = style
      if (children !== undefined) {
        for (const child of Array.isArray(children) ? children : [children]) {
          if (child !== null && child !== undefined && child !== false) node.appendChild(child)
        }
      }
      return node
    }
    const text = (content, style) => {
      const node = document.createElement('span')
      node.textContent = content
      if (style !== undefined) node.style.cssText = style
      return node
    }
    const showModal = (opts) => {
      closeModal()
      const overlayStyle = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.38)'
      const panelStyle = [
        'position:relative',
        `width:${opts.width !== undefined ? opts.width : 380}px`,
        'max-width:calc(100vw - 32px)',
        'box-sizing:border-box',
        'background:var(--dsw-alias-bg-base,#fff)',
        'border:1px solid var(--dsw-alias-border-l1,#e2e2e2)',
        'border-radius:12px',
        'box-shadow:var(--dsw-shadow-lv2,0 8px 24px rgba(0,0,0,.18))',
        'padding:16px 16px 14px',
        'font-family:inherit',
        'color:var(--dsw-alias-label-primary,#1a1a1a)'
      ].join(';')
      const titleEl = el('div', 'font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#1a1a1a);margin-bottom:10px', text(opts.title, ''))
      const bodyEl = el('div', 'font-size:13px;line-height:1.55;color:var(--dsw-alias-label-primary,#1a1a1a)', opts.body)
      const footerEl = el('div', 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px')
      const confirmBtn = opts.confirmLabel !== undefined
        ? el('button', 'cursor:pointer;font-family:inherit;font-size:13px;border-radius:8px;padding:5px 14px;border:1px solid transparent;background:var(--dsw-alias-state-error-primary,#e5484d);color:#fff', text(opts.confirmLabel))
        : null
      const cancelBtn = el('button', 'cursor:pointer;font-family:inherit;font-size:13px;border-radius:8px;padding:5px 14px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);background:none;color:var(--dsw-alias-label-primary,#1a1a1a)', text(opts.cancelLabel !== undefined ? opts.cancelLabel : '取消'))
      const dismiss = () => { closeModal(); if (typeof opts.onClose === 'function') opts.onClose() }
      if (confirmBtn !== null) {
        confirmBtn.addEventListener('click', async () => {
          if (confirmBtn.disabled) return
          confirmBtn.disabled = true
          confirmBtn.textContent = opts.busyLabel !== undefined ? opts.busyLabel : '处理中…'
          try {
            const result = await opts.onConfirm()
            if (result !== false) closeModal()
          } catch (error) {
            confirmBtn.disabled = false
            confirmBtn.textContent = opts.confirmLabel
            console.error('[dsh-system-restart]', error)
          }
        })
      }
      cancelBtn.addEventListener('click', dismiss)
      const overlayEl = el('div', overlayStyle, el('div', panelStyle, [titleEl, bodyEl, footerEl]))
      overlayEl.addEventListener('pointerdown', (event) => { if (event.target === overlayEl) dismiss() })
      if (confirmBtn !== null) footerEl.appendChild(confirmBtn)
      footerEl.insertBefore(cancelBtn, footerEl.firstChild)
      document.body.appendChild(overlayEl)
      modalRoot = overlayEl
    }

    // ── Sidebar footer button ─────────────────────────────────────────────────
    // Same geometry as the settings trigger row.
    const btnStyle = {
      boxSizing: 'border-box',
      cursor: 'pointer',
      width: '100%',
      height: '34px',
      color: 'var(--dsw-alias-label-primary,#1a1a1a)',
      background: 'none',
      border: 'none',
      borderRadius: '12px',
      flex: '0 0 auto',
      minWidth: '0',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 2px 6px 10px',
      fontFamily: 'inherit',
      fontSize: '14px',
      lineHeight: '22px',
      display: 'inline-flex',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      margin: '-2px -4px 4px'
    }
    const btnRailStyle = {
      ...btnStyle,
      flex: 'none',
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      justifyContent: 'center',
      gap: '0',
      padding: '0'
    }

    // 图标来源:lucide「Activity」(心电图,在线/活跃语义)。
    // lucide 图标组件,ISC License,https://lucide.dev (lucide-static v1.33.0)。
    // online=true:绿色 + 呼吸动画(后台可达);online=false:红色 + 静止半透明(离线/重启中)。
    const ActivityIcon = ({ size = 16, online = true }) => react.createElement('svg', {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: 'dsc-online-icon' + (online ? '' : ' dsc-online-icon--off'),
      style: { display: 'inline-block', flex: 'none', color: online ? '#34d399' : 'var(--dsw-alias-state-error,#f87171)' }
    }, react.createElement('path', { d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2' }))
    const ICON = () => ActivityIcon

    const RESTART_RELOAD_FALLBACK_MS = 10000 // 从未观测到断连时的兜底刷新时限
    const RESTART_TIMEOUT_MS = 60000         // 超过该时长仍未恢复 → 提示手动启动

    const trySignal = (ms) => {
      return (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
        ? AbortSignal.timeout(ms)
        : undefined
    }

    function RestartButton({ wide }) {
      const [hovered, setHovered] = react.useState(false)
      const [online, setOnline] = react.useState(true)          // 图标颜色(非重启期)
      const [restarting, setRestarting] = react.useState(false) // 已点重启,等待恢复
      const [elapsed, setElapsed] = react.useState(0)           // 重启等待秒数
      const [timedOut, setTimedOut] = react.useState(false)     // 60s 未恢复
      const stateRef = react.useRef({ alive: true, sawDown: false, clickAt: 0, restarting: false })

      // 轮询探活(永远在跑,驱动图标颜色 + 重启恢复检测)
      react.useEffect(() => {
        const st = stateRef.current
        st.alive = true
        const probe = async () => {
          let ok = false
          try {
            const r = await fetch('/', { cache: 'no-store', signal: trySignal(3000) })
            ok = r.ok
          } catch { /* 断连 */ }
          if (!st.alive) return
          if (!ok) {
            st.sawDown = true
            setOnline(false)
            return
          }
          setOnline(true)
          if (!st.restarting) return
          // 重启期:断连后恢复 → 新进程就绪 → 刷新页面
          if (st.sawDown) {
            location.reload()
            return
          }
          // 兜底:从未观测到断连(空窗小于轮询间隔)→ 到点直接刷新(无害)
          if (Date.now() - st.clickAt > RESTART_RELOAD_FALLBACK_MS) {
            location.reload()
          }
        }
        probe()
        const probeT = setInterval(probe, 1500)
        const tickT = setInterval(() => {
          if (!st.alive) return
          if (st.restarting) {
            const sec = Math.max(0, Math.floor((Date.now() - st.clickAt) / 1000))
            setElapsed(sec)
            if (sec >= Math.floor(RESTART_TIMEOUT_MS / 1000) && !timedOut) setTimedOut(true)
          }
        }, 1000)
        return () => { st.alive = false; clearInterval(probeT); clearInterval(tickT) }
      }, [])

      const click = () => {
        showModal({
          title: '重启 DSH',
          body: el('div', 'display:flex;flex-direction:column;gap:6px', [
            text('确定重启 DSH Web 进程？'),
            text('当前连接会中断,会话数据已持久化,不会丢失。新进程就绪后页面将自动刷新。', 'font-size:12px;color:var(--dsw-alias-label-secondary,#666)')
          ]),
          confirmLabel: '确认重启',
          busyLabel: '执行中…',
          cancelLabel: '取消',
          onConfirm: async () => {
            const st = stateRef.current
            st.sawDown = false
            st.clickAt = Date.now()
            st.restarting = true
            setRestarting(true)
            setTimedOut(false)
            setElapsed(0)
            try {
              await fetch('/dsh-system-restart/action', { method: 'POST' })
            } catch { /* process is going away */ }
            return true
          }
        })
      }

      const IconComponent = ICON()
      const style = wide ? btnStyle : btnRailStyle
      // 状态徽标(视觉提示;逻辑仍是最简的「断连→恢复→自动刷新」)
      const pillText = restarting
        ? (timedOut ? '未恢复' : '正在重启 · ' + elapsed + 's')
        : (online ? '运行中' : '离线')
      const pill = restarting
        ? (timedOut
          ? { fg: '#f87171', bg: 'rgba(248,113,113,.14)' }
          : { fg: '#f59e0b', bg: 'rgba(245,158,11,.14)' })
        : (online
          ? { fg: '#34d399', bg: 'rgba(52,211,153,.12)' }
          : { fg: '#f87171', bg: 'rgba(248,113,113,.12)' })
      const title = restarting
        ? (timedOut ? 'DSH 长时间未恢复,请在终端执行 dsh web' : '正在重启,新进程就绪后页面将自动刷新')
        : (online ? 'DSH 运行中 · 点击重启' : 'DSH 离线(重启中) · 点击重启')
      return react.createElement('button', {
        type: 'button',
        style: hovered ? { ...style, background: 'var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))' } : style,
        title: title,
        disabled: restarting,
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
        onClick: click
      }, [
        IconComponent !== null && react.createElement(IconComponent, { size: wide ? 16 : 18, online: restarting ? false : online }),
        wide && react.createElement('span', null, '重启 DSH'),
        wide && react.createElement('span', {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            flex: 'none',
            fontSize: '11px',
            lineHeight: '16px',
            padding: '0 6px',
            borderRadius: '8px',
            color: pill.fg,
            background: pill.bg
          }
        }, pillText)
      ])
    }

    // Layout tweak shared with dsh-system-shutdown: the sidebar foot renders
    // footerActions ABOVE settingsArea; flip the column so the order reads
    // 设置 → 重启 → 关闭 top-down. Hashed class; degrades to default position.
    // 附带注入在线心电图呼吸动画 CSS(.dsc-online-icon)。
    const injectLayoutCss = () => {
      const styleEl = document.createElement('style')
      styleEl.setAttribute('data-dsh-system-actions', 'true')
      styleEl.textContent = '.hHd-Xa_footArea{flex-direction:column-reverse!important}.hHd-Xa_footerActions{flex-wrap:wrap!important}' +
        '@keyframes dscOnlinePulse{0%,100%{opacity:1}50%{opacity:.35}}' +
        '.dsc-online-icon{animation:dscOnlinePulse 2s ease-in-out infinite}' +
        '.dsc-online-icon--off{animation:none;opacity:.55}'
      document.head.appendChild(styleEl)
      return () => styleEl.remove()
    }

    function apply(ctx) {
      const disposers = []
      try { disposers.push(injectLayoutCss()) } catch { /* best effort */ }
      const slots = ctx.get('slots')
      if (slots !== undefined) {
        disposers.push(slots.inject('sidebar.footer.action', () => slots.register(
          { name: 'sidebar.footer.action', id: 'dsh-restart', order: 10 },
          (props) => react.createElement(RestartButton, { wide: Boolean(props.wide) })
        )))
      }
      return () => { for (const dispose of disposers) dispose() }
    }

    const inject = ['slots']
    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
