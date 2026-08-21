// dsh-system-restart browser half: the sidebar-foot 「重启 DSH」 row, styled
// like the settings trigger, with a DSH-styled confirm modal.
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

    function RestartButton({ wide }) {
      const [hovered, setHovered] = react.useState(false)
      const [online, setOnline] = react.useState(true)
      // 实时探测后台连接状态:3s 一次轻量请求,失败即离线(重启中)。
      react.useEffect(() => {
        let alive = true
        const ping = () => {
          fetch('/', { cache: 'no-store' })
            .then((r) => {
              if (!alive) return
              try { r.body && r.body.cancel() } catch (e) { /* best effort */ }
              setOnline(r.ok)
            })
            .catch(() => { if (alive) setOnline(false) })
        }
        ping()
        const t = setInterval(ping, 3000)
        return () => { alive = false; clearInterval(t) }
      }, [])
      const click = () => {
        showModal({
          title: '重启 DSH',
          body: el('div', 'display:flex;flex-direction:column;gap:6px', [
            text('确定重启 DSH Web 进程？'),
            text('当前连接会中断，会话数据已持久化，不会丢失。', 'font-size:12px;color:var(--dsw-alias-label-secondary,#666)')
          ]),
          confirmLabel: '确认重启',
          busyLabel: '执行中…',
          cancelLabel: '取消',
          onConfirm: async () => {
            fetch('/dsh-system-restart/action', { method: 'POST' }).catch(() => { /* process is going away */ })
            return true
          }
        })
      }
      const IconComponent = ICON()
      const style = wide ? btnStyle : btnRailStyle
      return react.createElement('button', {
        type: 'button',
        style: hovered ? { ...style, background: 'var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))' } : style,
        title: online ? 'DSH 运行中 · 点击重启' : 'DSH 离线(重启中) · 点击重启',
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
        onClick: click
      }, [
        IconComponent !== null && react.createElement(IconComponent, { size: wide ? 16 : 18, online }),
        wide && react.createElement('span', null, '重启 DSH')
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
