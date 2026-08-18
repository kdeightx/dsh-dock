// dsh-plugin-manager browser half: the 「自定义插件」 settings tab listing
// installed plugins with hot enable/disable switches.
window.__ModuleLoader__.load({
  id: 'dsh-plugin-manager',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    let react = require('react')

    const tabTitle = '自定义插件'
    const tabNoteStyle = { margin: '0', padding: '14px 0', fontSize: '13px', color: 'var(--dsw-alias-label-secondary,#666)' }
    const tabErrorStyle = { margin: '0', padding: '14px 0', fontSize: '13px', color: 'var(--dsw-alias-state-error-primary,#e5484d)' }
    const tabListStyle = { listStyle: 'none', margin: '0', padding: '0', display: 'flex', flexDirection: 'column', gap: '8px' }
    const tabCardStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      border: '1px solid var(--dsw-alias-border-l2,#d0d0d0)',
      background: 'var(--dsw-alias-bg-layer-3,#f6f6f6)',
      borderRadius: '12px',
      padding: '12px 16px'
    }
    const tabCardTextStyle = { flex: '1', minWidth: '0' }
    const tabNameStyle = { color: 'var(--dsw-alias-label-primary,#1a1a1a)', fontSize: '15px', fontWeight: 600, lineHeight: '1.4' }
    const tabMetaStyle = { color: 'var(--dsw-alias-label-tertiary,#888)', fontSize: '12px', lineHeight: '1.5', marginTop: '2px', wordBreak: 'break-all' }
    const tabToggleStyle = {
      flex: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: '13px',
      borderRadius: '99px',
      border: '1px solid var(--dsw-alias-border-l2,#d0d0d0)',
      background: 'none',
      color: 'var(--dsw-alias-label-primary,#1a1a1a)',
      padding: '4px 14px',
      whiteSpace: 'nowrap'
    }
    const tabToggleOnStyle = {
      flex: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontSize: '13px',
      borderRadius: '99px',
      border: '1px solid transparent',
      background: 'var(--dsw-alias-state-success-primary,#30a46c)',
      color: '#fff',
      padding: '4px 14px',
      whiteSpace: 'nowrap'
    }

    function CustomPluginsTab() {
      const [state, setState] = react.useState({ status: 'loading', plugins: [], error: null })
      const [busyId, setBusyId] = react.useState(null)

      const load = () => {
        fetch('/dsh-plugin-manager/plugins')
          .then((response) => response.json())
          .then((data) => {
            if (data !== null && typeof data === 'object' && data.ok === true) {
              setState({ status: 'ready', plugins: Array.isArray(data.plugins) ? data.plugins : [], error: null })
            } else {
              setState({ status: 'ready', plugins: [], error: (data !== null && typeof data === 'object' && data.error) || '加载失败' })
            }
          })
          .catch((reason) => {
            setState({ status: 'ready', plugins: [], error: reason instanceof Error ? reason.message : String(reason) })
          })
      }
      react.useEffect(() => {
        let alive = true
        fetch('/dsh-plugin-manager/plugins')
          .then((response) => response.json())
          .then((data) => {
            if (!alive) return
            if (data !== null && typeof data === 'object' && data.ok === true) {
              setState({ status: 'ready', plugins: Array.isArray(data.plugins) ? data.plugins : [], error: null })
            } else {
              setState({ status: 'ready', plugins: [], error: (data !== null && typeof data === 'object' && data.error) || '加载失败' })
            }
          })
          .catch((reason) => {
            if (alive) setState({ status: 'ready', plugins: [], error: reason instanceof Error ? reason.message : String(reason) })
          })
        return () => { alive = false }
      }, [])

      const toggle = async (plugin) => {
        if (busyId !== null || plugin.entryId === null) return
        const target = !plugin.enabled
        setBusyId(String(plugin.id))
        try {
          const response = await fetch('/dsh-plugin-manager/plugins/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entryId: plugin.entryId, enabled: target })
          })
          const data = await response.json()
          if (data !== null && typeof data === 'object' && data.ok === true) {
            load()
          } else {
            setState((current) => ({ ...current, error: (data !== null && typeof data === 'object' && data.error) || '切换失败' }))
          }
        } catch (reason) {
          setState((current) => ({ ...current, error: reason instanceof Error ? reason.message : String(reason) }))
        } finally {
          setBusyId(null)
        }
      }

      if (state.status === 'loading') return react.createElement('p', { style: tabNoteStyle }, '加载中…')
      if (state.error !== null) return react.createElement('p', { style: tabErrorStyle, role: 'alert' }, state.error)
      if (state.plugins.length === 0) return react.createElement('p', { style: tabNoteStyle }, '没有安装自定义插件')
      return react.createElement('ul', { style: tabListStyle }, state.plugins.map((plugin) => {
        const enabled = plugin.enabled !== false
        const running = plugin.running === true
        const isSelf = plugin.entryId === 'include:plugin-manager' || plugin.entryId === 'plugin-manager'
        const toggleStyle = enabled ? tabToggleOnStyle : tabToggleStyle
        const toggleLabel2 = enabled ? '禁用' : '启用'
        const statusText = enabled
          ? (running ? '运行中' : '已停止')
          : '已禁用'
        const statusColor = enabled
          ? (running ? 'var(--dsw-alias-state-success-primary,#30a46c)' : 'var(--dsw-alias-state-warn-primary,#f5a524)')
          : 'var(--dsw-alias-label-tertiary,#888)'
        return react.createElement('li', { key: plugin.id, style: tabCardStyle }, [
          react.createElement('div', { style: tabCardTextStyle }, [
            react.createElement('div', { style: tabNameStyle }, [
              String(plugin.id),
              isSelf && react.createElement('span', { style: { marginLeft: '8px', fontSize: '11px', color: 'var(--dsw-alias-label-tertiary,#888)' } }, '（管理器，不能禁用）')
            ]),
            react.createElement('div', { style: tabMetaStyle }, `版本 ${String(plugin.rev).slice(0, 8)} · ${String(plugin.url)}`)
          ]),
          react.createElement('span', {
            style: { flex: 'none', fontSize: '12px', color: statusColor }
          }, statusText),
          react.createElement('button', {
            type: 'button',
            style: toggleStyle,
            disabled: busyId !== null || isSelf,
            title: isSelf ? '管理器自身不能被禁用' : undefined,
            onClick: () => toggle(plugin)
          }, busyId === String(plugin.id) ? '处理中…' : (isSelf ? '—' : toggleLabel2))
        ])
      }))
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      return slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'custom-plugins', order: 30, label: () => tabTitle },
        () => react.createElement(CustomPluginsTab, null)
      ))
    }

    const inject = ['slots']
    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
