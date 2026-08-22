// dsh-sidebar-cost browser half: a compact cost indicator rendered in the
// sidebar footer actions (beside Settings). Clicking expands a detail panel.
// Registered into the `sidebar.footer.action` LIST slot (additive, safe);
// the old `sidebar.workspaces` SINGLE slot is owned by ui-workspace and
// rejects a second registrant in rc.7 (load-time validation).
// Data reuses dsh-cost-crystal's /ds-balance + /ds-activity routes; the
// original top-right floating card (.ds-balance-card) is hidden via CSS.
//
// ⚠️ 来源声明 (NOTICE):
//   - 数据/helper 函数(usage 汇总、时段、格式化,改写为 React 组件形态)移植自
//     dsh-cost-crystal © xxvk, Apache-2.0,
//     https://github.com/xxvk/dsh-cost-crystal — 按 Apache-2.0 §4 保留版权声明;
//     修改:改为 React 组件、注册点改为 sidebar.footer.action、新增展开面板。
//   - 本文件整体以 Apache-2.0 发布(见 LICENSE)。
window.__ModuleLoader__.load({
  id: 'dsh-sidebar-cost',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')

    var POLL_MS = 20000 // /ds-balance(降频: 减少 readSession 解压会话)
    var ACTIVITY_MS = 8000 // /ds-activity(降频: 原 2s;每次过期 readSession 解压,降低触发)
    var TICK_MS = 30000 // countdown / freshness refresh

    // ── styles ──────────────────────────────────────────────────────────────
    var css = [
      // hide dsh-cost-crystal's floating top-right card
      '.ds-balance-card{display:none!important}',
      // footer action: compact strip, beside Settings at the sidebar foot
      '.dsc-foot{display:flex;flex-direction:column;box-sizing:border-box;width:100%;min-width:0;padding:6px 8px;border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16));user-select:none;cursor:pointer}',
      '.dsc-foot:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}',
      '.dsc-strip{display:flex;align-items:center;gap:4px;width:100%;min-width:0}',
      '.dsc-card{box-sizing:border-box;width:100%;min-width:0;border-radius:10px;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.16));background:var(--dsw-alias-bg-base,rgba(128,128,128,.06));padding:6px 9px 7px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-primary,inherit)}',
      '.dsc-head{display:flex;align-items:center;gap:6px;min-width:0}',
      '.dsc-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-info,#4D6BFE);flex:none}',
      '.dsc-dot--err{background:var(--dsw-alias-state-error,#e5484d)}',
      '@keyframes dscPulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(77,107,254,.45)}50%{opacity:.5;box-shadow:0 0 8px 4px rgba(77,107,254,.22)}}',
      '.dsc-dot--active{animation:dscPulse 1.5s ease-in-out infinite}',
      '.dsc-brand{font-weight:600;letter-spacing:.03em;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsc-src{font-size:9.5px;opacity:.75;padding:0 5px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:999px;white-space:nowrap;flex:none}',
      '.dsc-rate{margin-left:auto;font-size:10.5px;font-weight:600;opacity:.9;white-space:nowrap;flex:none}',
      '.dsc-rate--on{color:var(--dsw-alias-state-success,#34d399)}',
      '.dsc-amtrow{display:flex;align-items:baseline;gap:8px;margin-top:3px;min-width:0}',
      '.dsc-amt{font-size:15px;font-weight:650;letter-spacing:.2px;white-space:nowrap}',
      '.dsc-time{font-size:9px;opacity:.45;letter-spacing:.3px;flex:none}',
      '.dsc-usage{margin-left:auto;font-size:9.5px;opacity:.72;white-space:nowrap;flex:none}',
      '.dsc-period{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:4px;padding-top:4px;border-top:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.18));flex-wrap:wrap;white-space:nowrap}',
      '.dsc-badge{font-size:10px;font-weight:650;padding:0 7px;border-radius:999px;letter-spacing:.3px}',
      '.dsc-badge--peak{background:rgba(251,146,60,.16);color:var(--dsw-alias-state-warning,#fbbf24);border:1px solid rgba(251,146,60,.45)}',
      '.dsc-badge--offpeak{background:rgba(52,211,153,.13);color:var(--dsw-alias-state-success,#34d399);border:1px solid rgba(52,211,153,.4)}',
      '.dsc-next{font-size:10.5px;opacity:.8}',
      '.dsc-usage24{font-size:10px;opacity:.72;white-space:nowrap;flex:none}',
      '.dsc-forecast{font-size:10.5px;opacity:.55;margin-top:3px;letter-spacing:.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsc-forecast--on{opacity:.78}',
      '.dsc-forecast .dsc-cost{font-weight:650;color:var(--dsw-alias-label-primary,inherit)}',
      '.dsc-err{color:var(--dsw-alias-state-error,#f87171);font-size:10.5px}',
      // rail (collapsed) state: centered 36px round control
      '.dsc-rail{align-self:center;flex:none;box-sizing:border-box;width:36px;height:36px;margin:2px 0;border-radius:50%;border:none;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary,inherit)}',
      '.dsc-rail:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}'
    ].join('\n')

    // ── helpers (ported from dsh-cost-crystal's card script) ────────────────
    function currentSessionId() {
      try {
        var raw = localStorage.getItem('dsh.sessions.current')
        if (!raw) return null
        var o = JSON.parse(raw)
        return (o && o.sessionId) || null
      } catch (e) { return null }
    }

    function modelKeyFromLabel(label) {
      if (!label) return null
      var t = String(label).toLowerCase().replace(/[^a-z0-9]/g, '')
      var keys = ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-reasoner', 'deepseek-chat']
      for (var i = 0; i < keys.length; i++) if (t.indexOf(keys[i].replace(/-/g, '')) !== -1) return keys[i]
      return null
    }

    function currentModelFromDom() {
      try {
        var el = document.querySelector('.gTaGEG_trigger')
        return el ? modelKeyFromLabel(el.textContent) : null
      } catch (e) { return null }
    }

    function agoText(asOf, now) {
      var s = Math.max(0, Math.floor((now - asOf) / 1000))
      if (s < 5) return '刚刚'
      if (s < 60) return s + 's前'
      var m = Math.floor(s / 60)
      if (m < 60) return m + '分钟前'
      return Math.floor(m / 60) + '小时前'
    }

    function countdownText(ms, now) {
      var total = Math.max(0, Math.floor((ms - now) / 60000))
      var h = Math.floor(total / 60), m = total % 60
      if (h <= 0 && m <= 0) return '即将调整'
      return h > 0 ? h + '小时' + m + '分' : m + '分'
    }

    // 紧凑倒计时(折叠条用):1h20m / 20分 / 即将调整
    function countdownShort(ms, now) {
      var total = Math.max(0, Math.floor((ms - now) / 60000))
      if (total <= 0) return '即将调整'
      var h = Math.floor(total / 60), m = total % 60
      if (h <= 0) return m + '分'
      return m > 0 ? h + 'h' + m + 'm' : h + 'h'
    }

    function fmtNextAt(ts, now) {
      var d = new Date(ts)
      var n = new Date(now)
      var dayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
      var nextStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      var diff = Math.round((nextStart - dayStart) / 86400000)
      var label = diff === 0 ? '今日' : diff === 1 ? '明日' : (d.getMonth() + 1) + '月' + d.getDate() + '日'
      var h = d.getHours()
      var hm = (h < 10 ? '0' + h : String(h)) + ':' + (d.getMinutes() < 10 ? '0' + d.getMinutes() : String(d.getMinutes()))
      return label + ' ' + hm
    }

    function fmt(b) {
      var sym = b.currency === 'CNY' ? '¥' : b.currency === 'USD' ? '$' : b.currency + ' '
      var n = Number(b.total)
      return { sym: sym, text: isFinite(n) ? n.toFixed(2) : String(b.total) }
    }

    function fmtM(n) {
      var m = Math.max(n, 100000) / 1000000
      return m >= 1 ? Math.round(m) + 'M' : m.toFixed(1) + 'M'
    }

    function fmtTokens(n) { return String(Math.round(Number(n) || 0)) }

    function fmtCost(cny) {
      if (typeof cny === 'number') return '¥' + (cny < 0.01 ? cny.toFixed(4) : cny.toFixed(3))
      return String(cny)
    }

    function fmtTps(n) { return String(Math.round(Number(n) || 0)) }

    function localWindows(windowsUtc) {
      if (!windowsUtc) return ''
      return windowsUtc.map(function (w) {
        return w[0] + '-' + w[1] + ' UTC'
      }).join(' / ')
    }

    function pickCurrencies(infos) {
      if (!Array.isArray(infos)) return []
      var seen = {}
      return infos.filter(function (i) {
        if (seen[i.currency]) return false
        seen[i.currency] = true
        return true
      })
    }

    function sourceLabel(provider) {
      // 模型来源:官方 API 显示中文,其它(网关/OpenRouter/本机路由)显示路由名
      if (provider === 'deepseek-official') return '官方 API'
      if (provider === 'deepseek') return 'DeepSeek'
      return String(provider)
    }

    // ── rail title (collapsed sidebar) ───────────────────────────────────────
    function railTitle(data) {
      if (!data) return '成本卡片加载中…'
      if (data.ok !== true) return data.reason === 'no-key' ? '未配置 API key' : '查询失败'
      var list = pickCurrencies(data.infos)
      var main = fmt(list[0] || { currency: 'CNY', total: '--' })
      var mode = data.period && data.period.mode === 'peak' ? '波峰' : '低峰'
      var u24 = data.usage24h
      var u24Text = ''
      if (u24) {
        var c24 = typeof u24.cny === 'number' ? '¥' + u24.cny.toFixed(2) : (typeof u24.usd === 'number' ? '$' + u24.usd.toFixed(2) : '--')
        u24Text = ' · 近24h ' + c24
      }
      return '余额 ' + main.sym + main.text + ' · ' + mode + u24Text + ' · 点击展开侧边栏'
    }

    // ── component ────────────────────────────────────────────────────────────
    function CostCard(props) {
      var wide = Boolean(props.wide)
      var state = react.useState(null)
      var data = state[0]
      var setData = state[1]
      var state2 = react.useState(null)
      var activity = state2[0]
      var setActivity = state2[1]
      var state3 = react.useState(Date.now())
      var now = state3[0]
      var setNow = state3[1]
      var state4 = react.useState(null)
      var error = state4[0]
      var setError = state4[1]
      var state5 = react.useState(false)
      var open = state5[0]
      var setOpen = state5[1]

      react.useEffect(function () {
        var alive = true
        var poll = function () {
          var sid = currentSessionId()
          var qs = sid ? '?session=' + encodeURIComponent(sid) : ''
          var model = currentModelFromDom()
          if (model) qs += (qs ? '&' : '?') + 'model=' + encodeURIComponent(model)
          fetch('/ds-balance' + qs, { cache: 'no-store' })
            .then(function (r) { return r.json() })
            .then(function (d) { if (alive) { setData(d); setError(null) } })
            .catch(function () { if (alive) setError('查询失败') })
        }
        poll()
        var t = setInterval(poll, POLL_MS)
        return function () { alive = false; clearInterval(t) }
      }, [])

      react.useEffect(function () {
        var alive = true
        var poll = function () {
          var sid = currentSessionId()
          fetch('/ds-activity' + (sid ? '?session=' + encodeURIComponent(sid) : ''), { cache: 'no-store' })
            .then(function (r) { return r.json() })
            .then(function (d) { if (alive && d && d.activity) setActivity(d.activity) })
            .catch(function () {})
        }
        poll()
        var t = setInterval(poll, ACTIVITY_MS)
        return function () { alive = false; clearInterval(t) }
      }, [])

      react.useEffect(function () {
        var t = setInterval(function () { setNow(Date.now()) }, TICK_MS)
        return function () { clearInterval(t) }
      }, [])

      if (!wide) {
        var mode = data && data.period ? data.period.mode : null
        var dotCls = 'dsc-dot' + (data && data.ok === true && !data.isAvailable ? ' dsc-dot--err' : (activity && activity.active ? ' dsc-dot--active' : ''))
        return react.createElement('button', {
          type: 'button',
          className: 'dsc-rail',
          title: railTitle(data)
        }, react.createElement('span', { className: dotCls }))
      }

      var list = pickCurrencies(data && data.infos)
      var main = fmt(list[0] || { currency: 'CNY', total: '--' })
      var peak = data && data.period ? data.period.mode === 'peak' : null

      var stripKids = []
      stripKids.push(react.createElement('span', { key: 'dot', className: 'dsc-dot' + (!data || (data.ok === true && !data.isAvailable) ? ' dsc-dot--err' : (activity && activity.active ? ' dsc-dot--active' : '')) }))
      stripKids.push(react.createElement('span', { key: 'amt', className: 'dsc-amt', style: { fontSize: '12px' } }, data && data.ok === true ? main.sym + main.text : '--'))
      if (peak !== null) {
        stripKids.push(react.createElement('span', { key: 'badge', className: 'dsc-badge ' + (peak ? 'dsc-badge--peak' : 'dsc-badge--offpeak') }, peak ? '波峰' : '低峰'))
      }
      if (data && data.period && data.period.nextAt) {
        stripKids.push(react.createElement('span', { key: 'next', className: 'dsc-next' }, countdownShort(data.period.nextAt, now)))
      }
      // 折叠条:近24h 消耗(/ds-balance 的 usage24h,滚动窗口)
      var u24 = data && data.usage24h
      if (u24) {
        var cny24 = typeof u24.cny === 'number' ? '¥' + u24.cny.toFixed(2) : null
        var usd24 = typeof u24.usd === 'number' ? '$' + u24.usd.toFixed(2) : null
        var up24 = []
        if (u24.flatUsd > 0) up24.push('平峰 $' + u24.flatUsd.toFixed(3))
        if (u24.peakUsd > 0) up24.push('波峰 $' + u24.peakUsd.toFixed(3))
        if (u24.offUsd > 0) up24.push('低峰 $' + u24.offUsd.toFixed(3))
        stripKids.push(react.createElement('span', {
          key: 'u24',
          className: 'dsc-usage24',
          title: '近24h 消耗(本机会话估算):' + (cny24 || usd24 || '--') + (up24.length ? '(' + up24.join(' / ') + ')' : '') + ' / 调用 ' + u24.calls + ' 次'
        }, '近24h ' + (cny24 || usd24 || '--')))
      }
      stripKids.push(react.createElement('span', { key: 'chev', style: { marginLeft: 'auto', fontSize: '14px', opacity: .8 } }, open ? '▾' : '▸'))

      var panel = null
      if (open) {
        var panelKids = []
        if (!data) {
          panelKids.push(react.createElement('div', { key: 'load', className: 'dsc-err' }, '余额加载中…'))
        } else if (data.ok !== true) {
          var reason = data.reason === 'no-key' ? '未配置 API key' : (error || '查询失败')
          panelKids.push(react.createElement('div', { key: 'err', className: 'dsc-err' }, reason))
        } else {
          var headKids = []
          headKids.push(react.createElement('span', { key: 'brand', className: 'dsc-brand' }, 'DeepSeek'))
          if (data.source && data.source.provider) {
            headKids.push(react.createElement('span', {
              key: 'src',
              className: 'dsc-src',
              title: '模型: ' + (data.source.model || '?')
            }, sourceLabel(data.source.provider)))
          }
          var tpsOn = Boolean(activity && activity.active)
          headKids.push(react.createElement('span', {
            key: 'rate',
            className: 'dsc-rate' + (tpsOn ? ' dsc-rate--on' : ''),
            title: tpsOn ? '运行中 · 实时 ' + fmtTps(activity.tps) + ' tok/s' : '空闲 · 速率 0'
          }, fmtTps(tpsOn ? activity.tps : 0) + ' tok/s'))
          panelKids.push(react.createElement('div', { key: 'head', className: 'dsc-head' }, headKids))

          var asOf = typeof data.asOf === 'number' ? data.asOf : now
          var amtKids = []
          amtKids.push(react.createElement('span', {
            key: 'time',
            className: 'dsc-time',
            title: '更新于 ' + new Date(asOf).toLocaleTimeString('zh-CN', { hour12: false })
          }, agoText(asOf, now)))
          var amtTitle = ''
          if (list[0]) {
            var tAmt = fmt({ currency: list[0].currency, total: list[0].toppedUp })
            var gAmt = fmt({ currency: list[0].currency, total: list[0].granted })
            amtTitle = '充值 ' + tAmt.sym + tAmt.text + ' / 赠送 ' + gAmt.sym + gAmt.text
          }
          amtKids.push(react.createElement('span', { key: 'amt', className: 'dsc-amt', title: amtTitle }, main.sym + main.text))
          if (data.usage24h) {
            var u = data.usage24h
            var mainCur = list[0] ? list[0].currency : 'CNY'
            // 面板保持「近24h」原口径(折叠条才是「今日」)
            var usageTxt = mainCur === 'USD'
              ? '近24h $' + (typeof u.usd === 'number' ? u.usd.toFixed(2) : '--')
              : '近24h ' + (typeof u.cny === 'number' ? '¥' + u.cny.toFixed(2) : '$' + (typeof u.usd === 'number' ? u.usd.toFixed(2) : '--'))
            var uparts = []
            if (u.flatUsd > 0) uparts.push('平峰 $' + u.flatUsd.toFixed(3))
            if (u.peakUsd > 0) uparts.push('波峰 $' + u.peakUsd.toFixed(3))
            if (u.offUsd > 0) uparts.push('低峰 $' + u.offUsd.toFixed(3))
            amtKids.push(react.createElement('span', {
              key: 'usage',
              className: 'dsc-usage',
              title: '仅本机 Harness 会话;官方政策价估算' + (uparts.length ? '(' + uparts.join(' / ') + ')' : '') + ' / 调用 ' + u.calls + ' 次'
            }, usageTxt))
          }
          panelKids.push(react.createElement('div', { key: 'amtrow', className: 'dsc-amtrow' }, amtKids))

          if (data.period) {
            var badge = react.createElement('span', {
              key: 'badge',
              className: 'dsc-badge ' + (peak ? 'dsc-badge--peak' : 'dsc-badge--offpeak'),
              title: '波峰时段(本地): ' + localWindows(data.period.windowsUtc)
            }, peak ? '波峰' : '低峰')
            var next = react.createElement('span', {
              key: 'next',
              className: 'dsc-next'
            }, '下次调整 ' + countdownText(data.period.nextAt, now) + ' · ' + fmtNextAt(data.period.nextAt, now))
            panelKids.push(react.createElement('div', { key: 'period', className: 'dsc-period' }, [badge, next]))
          }

          var p = data.prediction
          var fcCls = 'dsc-forecast' + (p && p.totalTokens > 0 ? ' dsc-forecast--on' : '')
          var fcKids = []
          if (p && p.totalTokens > 0) {
            fcKids.push('🔮 此次预测 ' + fmtM(p.totalTokens) + ' tok · ')
            fcKids.push(react.createElement('span', {
              key: 'cost',
              className: 'dsc-cost',
              title: '预计输入 ' + fmtTokens(p.predictedInput) + '(含上下文 ' + fmtTokens(p.contextTokens) + ') + 输出 ' + fmtTokens(p.predictedOutput) + ' · ' + (p.model || '未知模型') + ' 估算\n数据为本地日志估算,仅供参考'
            }, fmtCost(p.costCny)))
          } else {
            fcKids.push('🔮 预测模块开发中')
          }
          panelKids.push(react.createElement('div', { key: 'fc', className: fcCls }, fcKids))
        }
        panel = react.createElement('div', { key: 'panel', className: 'dsc-card', style: { marginTop: '6px' } }, panelKids)
      }

      var strip = react.createElement('div', { key: 'strip', className: 'dsc-strip' }, stripKids)
      return react.createElement('div', { className: 'dsc-foot', onClick: function () { setOpen(!open) } }, panel ? [strip, panel] : [strip])
    }

    // ── apply ────────────────────────────────────────────────────────────────
    function apply(ctx) {
      var disposers = []
      try {
        var styleEl = document.createElement('style')
        styleEl.setAttribute('data-dsh-sidebar-cost', 'true')
        styleEl.textContent = css
        document.head.appendChild(styleEl)
        disposers.push(function () { styleEl.remove() })
      } catch (e) { /* best effort */ }
      var slots = ctx.get('slots')
      if (slots !== undefined) {
        disposers.push(slots.inject('sidebar.footer.action', function () {
          return slots.register(
            { name: 'sidebar.footer.action', id: 'dsh-sidebar-cost' },
            function (props) { return react.createElement(CostCard, props) }
          )
        }))
      }
      return function () { for (var i = 0; i < disposers.length; i++) disposers[i]() }
    }

    var inject = ['slots']
    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
