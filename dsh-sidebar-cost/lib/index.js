// dsh-sidebar-cost host half.
// 成本数据路由(完全自研,数据引擎内联自 dsh-cost-crystal,Apache-2.0):
//   GET /ds-balance   余额 + 波峰/低峰 + 下次调整 + 近24h + 预测 + source/activity
//   GET /ds-activity  全局实时速率(投影增量检测,回退会话日志估算)
// 侧边栏折叠条(client.js)轮询这两个路由渲染。
//
// 自愈: dsh 的 webServer 实例在启动过程中可能重建(启动时序竞争,与 dsh-safe-mode
// 曾遭遇的问题同源),导致本插件的路由注册被丢 —— 实测表现: apply 自检通过但
// 请求 404。这里每 2 秒幂等补齐注册(仅缺失时注册,健康时零开销)。
//
// 历史: 本插件曾依赖第三方包 dsh-cost-crystal 提供上述路由,并将它的右上角
// 浮层隐藏(其浮层轮询频繁 readSession 解压会话,是 dsh 卡顿主因)。
// 0.1.1 起数据路由内联(见 cost-data-local.js,Apache-2.0),彻底移除第三方
// 依赖;浮层本身随之不存在,无需再隐藏/删除。
import { createCostData, PEAK_UTC, modeAt, nextBoundary } from './cost-data-local.js'

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return
  const data = createCostData(ctx)

  const sendJson = (res, code, payload) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(payload))
  }

  const balanceHandler = async (req, res) => {
    try {
      const now = Date.now()
      const balance = await data.cachedBalance()
      const sessionId = await data.resolveSession(req)
      let modelParam = null
      try {
        modelParam = new URL(req.url ?? '/', 'http://localhost').searchParams.get('model')
      } catch { /* keep null */ }
      const payload = Object.assign({}, balance, {
        asOf: now,
        period: { mode: modeAt(now), nextAt: nextBoundary(now), windowsUtc: PEAK_UTC },
        usage24h: await data.cachedUsage24h(),
        source: sessionId ? await data.cachedSessionSource(sessionId) : null,
        activity: sessionId ? await data.activity.activityFor(sessionId) : null,
        prediction: sessionId ? await data.activity.cachedPrediction(sessionId, modelParam) : null
      })
      sendJson(res, 200, payload)
    } catch (e) {
      sendJson(res, 500, { ok: false, reason: String(e) })
    }
  }

  const activityHandler = async (req, res) => {
    try {
      const now = Date.now()
      const sessionId = await data.resolveSession(req)
      const activity = data.activity.activityFromProjection() ?? (sessionId === null ? null : (await data.activity.activityFor(sessionId)))
      sendJson(res, 200, { ok: true, asOf: now, activity })
    } catch (e) {
      sendJson(res, 500, { ok: false, reason: String(e) })
    }
  }

  // 幂等注册: 路由缺失才补(自愈时重新取 webServer,规避实例替换)
  const ensureRegistered = () => {
    const ws = ctx.get('webServer')
    if (!ws) return
    if (ws.match('/ds-balance') === undefined) {
      try {
        ws.register({ kind: 'exact', path: '/ds-balance', handler: balanceHandler })
      } catch (e) {
        console.error('dsh-sidebar-cost: 注册 /ds-balance 失败:', String(e))
      }
    }
    if (ws.match('/ds-activity') === undefined) {
      try {
        ws.register({ kind: 'exact', path: '/ds-activity', handler: activityHandler })
      } catch (e) {
        console.error('dsh-sidebar-cost: 注册 /ds-activity 失败:', String(e))
      }
    }
  }

  ensureRegistered()
  const timer = setInterval(ensureRegistered, 2000)
  timer.unref?.()
  ctx.effect(() => {
    clearInterval(timer)
  }, 'dsh-sidebar-cost: self-heal')
}

export const inject = ['webServer', 'credentials', 'shell', 'sessionQuery', 'agents', 'sessionProjections']
