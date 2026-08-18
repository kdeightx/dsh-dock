// dsh-session-delete browser half.
// Injects a "删除会话" item into the sidebar session-row ⋯ menu, right below
// the shipped "归档会话" item, and drives permanent deletion over HTTP.
// All user feedback uses a DSH-styled modal instead of native confirm/alert.
window.__ModuleLoader__.load({
  id: 'dsh-session-delete',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    let react = require('react')

    /** zh: 会话“X”的操作  /  en: Session actions for X */
    const TITLE_LABEL_ZH = /^会话“(.+)”的操作$/
    const TITLE_LABEL_EN = /^Session actions for (.+)$/

    const ARCHIVE_ZH = '归档会话'
    const ARCHIVE_EN = 'Archive session'
    const DELETE_ZH = '删除会话'
    const DELETE_EN = 'Delete session'

    function parseTitleFromLabel(label) {
      if (typeof label !== 'string') return null
      const zh = TITLE_LABEL_ZH.exec(label)
      if (zh !== null) return zh[1]
      const en = TITLE_LABEL_EN.exec(label)
      if (en !== null) return en[1]
      return null
    }

    function formatTime(ts) {
      if (typeof ts !== 'number' || ts <= 0) return ''
      const date = new Date(ts)
      const now = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
      return sameDay ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    function applyMenuInjection() {
      let lastTitle = null

      // ── DSH-styled modal ────────────────────────────────────────────────────
      // One modal at a time; the current root element is tracked for cleanup.
      let modalRoot = null

      const closeModal = () => {
        if (modalRoot !== null) {
          modalRoot.remove()
          modalRoot = null
        }
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

      /**
       * Open a DSH-styled modal.
       * @param opts { title, body: Node|Node[], confirmLabel?, danger?, busyLabel?,
       *              onConfirm?: async () => void|boolean, onClose?: () => void,
       *              width? }
       * When onConfirm resolves true the modal closes; false keeps it open.
       */
      const showModal = (opts) => {
        closeModal()
        const overlayStyle = [
          'position:fixed',
          'inset:0',
          'z-index:10000',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'background:rgba(0,0,0,.38)'
        ].join(';')
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
          ? el('button', [
              'cursor:pointer',
              'font-family:inherit',
              'font-size:13px',
              'border-radius:8px',
              'padding:5px 14px',
              'border:1px solid transparent',
              'background:var(--dsw-alias-state-error-primary,#e5484d)',
              'color:#fff'
            ].join(';'), text(opts.confirmLabel))
          : null
        const cancelBtn = el('button', [
          'cursor:pointer',
          'font-family:inherit',
          'font-size:13px',
          'border-radius:8px',
          'padding:5px 14px',
          'border:1px solid var(--dsw-alias-border-l2,#d0d0d0)',
          'background:none',
          'color:var(--dsw-alias-label-primary,#1a1a1a)'
        ].join(';'), text(opts.cancelLabel !== undefined ? opts.cancelLabel : '取消'))

        const busyLabel = opts.busyLabel !== undefined ? opts.busyLabel : '处理中…'
        const setBusy = (busy) => {
          if (confirmBtn !== null) {
            confirmBtn.disabled = busy
            confirmBtn.style.opacity = busy ? '0.6' : '1'
            confirmBtn.style.cursor = busy ? 'default' : 'pointer'
            confirmBtn.textContent = busy ? busyLabel : opts.confirmLabel
          }
          cancelBtn.disabled = busy
          cancelBtn.style.opacity = busy ? '0.5' : '1'
        }
        const finish = (close) => {
          closeModal()
          if (typeof opts.onClose === 'function') opts.onClose()
        }
        const dismiss = () => finish(false)
        if (confirmBtn !== null) {
          confirmBtn.addEventListener('click', async () => {
            if (confirmBtn.disabled) return
            setBusy(true)
            try {
              const result = await opts.onConfirm()
              if (result !== false) closeModal()
            } catch (error) {
              setBusy(false)
              // Fall back to an error modal surfaced by the caller's own error path.
              console.error('[dsh-session-delete]', error)
            }
          })
        }
        cancelBtn.addEventListener('click', dismiss)

        const overlayEl = el('div', overlayStyle, el('div', panelStyle, [titleEl, bodyEl, footerEl]))
        overlayEl.addEventListener('pointerdown', (event) => {
          if (event.target === overlayEl) dismiss()
        })
        if (confirmBtn !== null) footerEl.appendChild(confirmBtn)
        // attach the cancel button after building overlay (order matters visually)
        footerEl.insertBefore(cancelBtn, footerEl.firstChild)
        document.body.appendChild(overlayEl)
        modalRoot = overlayEl
      }

      const showError = (message, zhMode) => {
        showModal({
          title: zhMode ? '操作失败' : 'Operation failed',
          width: 340,
          body: el('div', 'display:flex;flex-direction:column;gap:8px', [
            text(message),
            text(zhMode ? '如果问题持续出现，请查看 DSH 进程日志。' : 'If this keeps happening, check the DSH process logs.', 'font-size:12px;color:var(--dsw-alias-label-secondary,#666)')
          ]),
          cancelLabel: zhMode ? '知道了' : 'OK'
        })
      }

      const showConfirm = (title, sessionId, zhMode) => {
        showModal({
          title: zhMode ? '删除会话' : 'Delete session',
          body: el('div', 'display:flex;flex-direction:column;gap:6px', [
            text(zhMode ? `确定永久删除会话"${title}"？` : `Permanently delete session "${title}"?`),
            text(zhMode ? '此操作不可恢复。' : 'This cannot be undone.', 'color:var(--dsw-alias-state-error-primary,#e5484d);font-weight:500')
          ]),
          confirmLabel: zhMode ? '确认删除' : 'Delete',
          busyLabel: zhMode ? '删除中…' : 'Deleting…',
          cancelLabel: zhMode ? '取消' : 'Cancel',
          onConfirm: async () => {
            const result = await doDelete(sessionId, zhMode)
            return result
          }
        })
      }

      const PRESET_LABELS = {
        standard: { zh: '标准模式', en: 'Standard' },
        code: { zh: 'PTC 模式', en: 'PTC' },
        minimal: { zh: '极简模式', en: 'Minimal' },
        cordis: { zh: '创造模式', en: 'Creator' }
      }

      const presetLabel = (preset, zhMode) => {
        if (preset === undefined || preset === null || preset === '') return null
        const entry = PRESET_LABELS[preset]
        if (entry === undefined) return String(preset)
        return zhMode ? entry.zh : entry.en
      }

      const showCandidates = (title, candidates, zhMode) => {
        const rows = candidates.map((candidate, index) => {
          const row = el('button', [
            'display:flex',
            'align-items:center',
            'gap:10px',
            'width:100%',
            'box-sizing:border-box',
            'padding:7px 10px',
            'border:none',
            'background:none',
            'border-radius:8px',
            'cursor:pointer',
            'font-family:inherit',
            'font-size:13px',
            'color:var(--dsw-alias-label-primary,#1a1a1a)',
            'text-align:left'
          ].join(';'))
          row.addEventListener('mouseenter', () => {
            row.style.background = 'var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))'
          })
          row.addEventListener('mouseleave', () => {
            row.style.background = 'none'
          })
          const titleEl = text(title, 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')
          titleEl.title = title
          row.appendChild(titleEl)
          const modeLabel = presetLabel(candidate.preset, zhMode)
          if (modeLabel !== null) {
            row.appendChild(text(modeLabel, 'flex:none;font-size:11px;padding:1px 7px;border-radius:99px;border:1px solid var(--dsw-alias-border-l2,#d0d0d0);color:var(--dsw-alias-label-secondary,#666);white-space:nowrap'))
          }
          if (typeof candidate.cwd === 'string' && candidate.cwd !== '') {
            const parts = candidate.cwd.split(/[\\/]/).filter((segment) => segment !== '')
            const shortPath = parts.length > 0 ? parts[parts.length - 1] : candidate.cwd
            const pathEl = text(shortPath, 'flex:none;font-size:12px;color:var(--dsw-alias-label-secondary,#888);white-space:nowrap')
            pathEl.title = candidate.cwd
            row.appendChild(pathEl)
          }
          row.appendChild(text(formatTime(candidate.createdAt), 'flex:none;font-size:12px;color:var(--dsw-alias-label-secondary,#666)'))
          row.addEventListener('click', () => showConfirm(title, candidate.sessionId, zhMode))
          row.dataset.index = String(index)
          return row
        })
        showModal({
          title: zhMode ? '选择要删除的会话' : 'Choose session to delete',
          width: 420,
          body: el('div', 'display:flex;flex-direction:column;gap:4px', [
            text(zhMode
              ? `有 ${candidates.length} 个会话同名"${title}"，请选择要删除的那一个：`
              : `${candidates.length} sessions are named "${title}". Pick the one to delete:`,
              'margin-bottom:6px'),
            el('div', 'display:flex;flex-direction:column;gap:2px;max-height:300px;overflow-y:auto', rows)
          ]),
          cancelLabel: zhMode ? '取消' : 'Cancel'
        })
      }

      // ── deletion flow ───────────────────────────────────────────────────────
      const doDelete = async (sessionId, zhMode) => {
        try {
          const deleteResponse = await fetch('/dsh-session-delete/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
          })
          const deleted = await deleteResponse.json()
          if (deleted !== null && typeof deleted === 'object' && deleted.ok === true) {
            // Live sessions are detached server-side: `host/session-removed`
            // removes the row automatically. Cold sessions have no removal
            // frame, so refresh the page to rebuild the list from disk.
            if (deleted.live !== true) {
              setTimeout(() => window.location.reload(), 250)
            }
            return true
          }
          closeModal()
          showError((deleted !== null && typeof deleted === 'object' && deleted.error) || (zhMode ? '删除失败' : 'Delete failed'), zhMode)
          return false
        } catch (error) {
          closeModal()
          showError((zhMode ? '删除失败: ' : 'Delete failed: ') + String(error), zhMode)
          return false
        }
      }

      const handleDelete = async (zhMode, button) => {
        if (lastTitle === null) {
          showError(zhMode ? '无法确定要删除的会话' : 'Could not determine the session', zhMode)
          return
        }
        const title = lastTitle
        button.disabled = true
        try {
          const resolveResponse = await fetch('/dsh-session-delete/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
          })
          const resolved = await resolveResponse.json()
          if (resolved === null || typeof resolved !== 'object' || resolved.ok !== true) {
            showError((resolved !== null && typeof resolved === 'object' && resolved.error) || (zhMode ? '解析会话失败' : 'Resolve failed'), zhMode)
            return
          }
          if (typeof resolved.sessionId === 'string') {
            showConfirm(title, resolved.sessionId, zhMode)
            return
          }
          const candidates = Array.isArray(resolved.candidates) ? resolved.candidates : []
          if (candidates.length > 1) {
            showCandidates(title, candidates, zhMode)
            return
          }
          showError(zhMode ? '未找到该会话' : 'Session not found', zhMode)
        } catch (error) {
          showError((zhMode ? '删除失败: ' : 'Delete failed: ') + String(error), zhMode)
        } finally {
          button.disabled = false
        }
      }

      // 1. Capture the session row whose ⋯ button was clicked, by reading the
      //    stable aria-label (title travels inside it).
      const onCaptureClick = (event) => {
        const target = event.target
        if (!(target instanceof Element)) return
        const button = target.closest('button[aria-label]')
        if (button === null) return
        const title = parseTitleFromLabel(button.getAttribute('aria-label') || '')
        if (title === null) return
        if (button.closest('[role="treeitem"]') === null) return
        lastTitle = title
      }
      document.addEventListener('click', onCaptureClick, true)

      // 2. When a session-row menu portal opens, insert the delete item right
      //    below the shipped "归档会话" item. The menu list is React-owned and
      //    unmounts on close, so every open renders a fresh container and the
      //    injection naturally re-runs; the marker guards against duplicate
      //    injection inside one container instance.
      const observer = new MutationObserver(() => {
        for (const menuEl of document.querySelectorAll('div[role="menu"]')) {
          if (menuEl.querySelector('[data-session-delete-injected]') !== null) continue
          const items = menuEl.querySelectorAll('[role="menuitem"]')
          let archiveItem = null
          let zhMode = true
          for (const item of items) {
            const textContent = (item.textContent || '').trim()
            if (textContent === ARCHIVE_ZH || textContent === ARCHIVE_EN) {
              archiveItem = item
              zhMode = textContent === ARCHIVE_ZH
              break
            }
          }
          if (archiveItem === null) continue
          injectDeleteItem(archiveItem, zhMode)
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })

      function injectDeleteItem(archiveItem, zhMode) {
        const separator = document.createElement('div')
        separator.setAttribute('role', 'separator')
        separator.setAttribute('data-session-delete-injected', 'true')
        separator.style.cssText = 'height:1px;margin:5px 4px;background:var(--dsw-alias-border-l1,#e2e2e2)'

        const item = document.createElement('button')
        item.setAttribute('type', 'button')
        item.setAttribute('role', 'menuitem')
        item.setAttribute('data-session-delete-injected', 'true')
        item.style.cssText = [
          'display:flex',
          'align-items:center',
          'gap:8px',
          'width:100%',
          'padding:7px 10px',
          'border:none',
          'background:none',
          'border-radius:8px',
          'cursor:pointer',
          'font-family:inherit',
          'font-size:13px',
          'color:var(--dsw-alias-state-error-primary,#e5484d)',
          'text-align:left'
        ].join(';')
        item.addEventListener('mouseenter', () => {
          item.style.background = 'var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))'
        })
        item.addEventListener('mouseleave', () => {
          item.style.background = 'none'
        })

        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        icon.setAttribute('width', '14')
        icon.setAttribute('height', '14')
        icon.setAttribute('viewBox', '0 0 16 16')
        icon.setAttribute('fill', 'none')
        icon.setAttribute('stroke', 'currentColor')
        icon.setAttribute('stroke-width', '1.4')
        icon.setAttribute('stroke-linecap', 'round')
        icon.setAttribute('stroke-linejoin', 'round')
        icon.innerHTML = '<path d="M2.5 4.5h11"/><path d="M4 4.5V13a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 12 13V4.5"/><path d="M6.5 4.5V3h3v1.5"/>'

        const label = document.createElement('span')
        label.textContent = zhMode ? DELETE_ZH : DELETE_EN

        item.appendChild(icon)
        item.appendChild(label)
        item.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          handleDelete(zhMode, item)
        })

        archiveItem.after(separator, item)
      }

      return () => {
        document.removeEventListener('click', onCaptureClick, true)
        observer.disconnect()
        closeModal()
      }
    }


    function apply(ctx) {
      const disposers = []
      const menuCleanup = applyMenuInjection()
      if (typeof menuCleanup === 'function') disposers.push(menuCleanup)
      return () => {
        for (const dispose of disposers) dispose()
      }
    }

    const inject = ['slots']

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
