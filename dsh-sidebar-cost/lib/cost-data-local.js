// ─────────────────────────────────────────────────────────────────────────────
// 成本数据引擎 —— 内联自 dsh-cost-crystal(© xxvk, Apache-2.0)。
// 同步日期: 2026-08-22(对应 dsh-cost-crystal 0.1.0)。
// 来源: https://github.com/xxvk/dsh-cost-crystal
// 修改: CJS 转 ESM;去除右上角浮层注入,仅保留 /ds-balance 与 /ds-activity
//       数据路由所需逻辑(usage24h/来源/活动/预测/余额 + 缓存,阈值与原版一致)。
// 目的: 让 dsh-sidebar-cost 的成本功能完全自研,不再依赖第三方包 dsh-cost-crystal;
//       也免去「patch 第三方包会被升级覆盖」的维护。
// ─────────────────────────────────────────────────────────────────────────────
import { PEAK_UTC, modeAt, nextBoundary, dayKindAt, dayLabelAt, priceAt, costOf } from './pricing-local.js'

export { PEAK_UTC, modeAt, nextBoundary, dayKindAt, dayLabelAt }

// ── 缓存(与原版一致的阈值) ───────────────────────────────────────────────────
const cacheState = {
  balanceCache: { data: null, at: 0 },
  usage24hCache: { data: null, at: 0 },
  globalTpsState: null
}
const activityCache = new Map() // sessionId -> {at, data} (30s, 负缓存)
const predictionCache = new Map() // sessionId -> {at, data, model} (60s)
const sourceCache = new Map() // sessionId -> {at, data} (60s, 负缓存)

// ── 会话日志用量读取(仅使用服务契约的最小局部类型) ──────────────────────────
function modelOf(ev) {
  const d = ev.data
  return d?.message?.source?.model ?? d?.source?.model ?? 'unknown'
}

/** 近 24 小时全部会话的累计费用估算 */
async function usage24h(sq, nowMs) {
  const cutoff = nowMs - 24 * 3600 * 1000
  const out = { usd: 0, cny: 0, flatUsd: 0, peakUsd: 0, offUsd: 0, calls: 0, asOf: nowMs }
  let sessions = []
  try {
    sessions = await sq.listSessions()
  } catch {
    return null
  }
  for (const rec of sessions) {
    const id = rec.header?.id
    if (!id) continue
    let snapshot = null
    try {
      snapshot = await sq.readSession(id)
    } catch {
      continue
    }
    for (const ev of snapshot?.events ?? []) {
      if (typeof ev.time !== 'number' || ev.time < cutoff) continue
      const u = ev.data?.usage
      if (!u) continue
      if ((u.inputTokens || 0) + (u.cacheReadTokens || 0) + (u.outputTokens || 0) <= 0) continue
      const unit = priceAt(modelOf(ev), ev.time)
      const c = costOf(u, unit)
      out.usd += c.costUsd
      out.cny += c.cost
      if (unit.mode === 'flat') out.flatUsd += c.costUsd
      else if (unit.mode === 'peak') out.peakUsd += c.costUsd
      else out.offUsd += c.costUsd
      out.calls++
    }
  }
  return out
}

/** 纯计算:从事件列表提取最近的 provider/model(与 readSession 解耦) */
function computeSource(events) {
  let provider = null
  let model = null
  for (const ev of events) {
    if (ev.type === 'request/header') {
      const cfg = ev.data?.header?.config
      if (cfg?.provider) {
        provider = cfg.provider
        model = cfg.model ?? model
      }
    }
  }
  return provider ? { provider, model } : null
}

/** 会话最近的模型来源 */
async function sessionSource(sq, sessionId) {
  let snapshot = null
  try {
    snapshot = await sq.readSession(sessionId)
  } catch {
    return null
  }
  return computeSource(snapshot?.events ?? [])
}

/** 会话活动度:近 60s 输出 tokens 求速率(tps),近 20s 内有事件判定运行中 */
async function sessionActivity(sq, sessionId) {
  let snapshot = null
  try {
    snapshot = await sq.readSession(sessionId)
  } catch {
    return null
  }
  const events = snapshot?.events ?? []
  const now = Date.now()
  let lastTime = 0
  let outputInWindow = 0
  for (const ev of events) {
    if (typeof ev.time === 'number') {
      if (ev.time > lastTime) lastTime = ev.time
      if (ev.time >= now - 60000) outputInWindow += ev.data?.usage?.outputTokens ?? 0
    }
  }
  if (lastTime === 0) return { active: false, tps: 0 }
  return { active: now - lastTime < 20000, tps: Math.round(outputInWindow / 60) }
}

// ── 余额查询:curl 官方 balance 接口(key 只经 env 传 curl;30s 缓存) ──────────
function createBalance(credentials, shell) {
  async function fetchBalance() {
    const resolved = await credentials.resolve('DEEPSEEK_API_KEY')
    if (!resolved) return { ok: false, reason: 'no-key' }
    try {
      const spec = shell.resolve({
        // env -u 剥离 http(s)_proxy: 直连官方接口(本机代理失效时余额仍可查)
        command: 'env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u all_proxy -u ALL_PROXY curl -sf -m 10 https://api.deepseek.com/user/balance -H "Authorization: Bearer $DS_KEY"',
        env: { DS_KEY: resolved.value },
        timeoutMs: 15000,
        stdoutMaxBytes: 4096
      })
      const result = await shell.run(spec)
      if (result.exitCode !== 0) return { ok: false, reason: 'http', code: result.exitCode }
      const data = JSON.parse(result.stdout.text)
      if (data === null || typeof data !== 'object') return { ok: false, reason: 'parse' }
      if (data.error) {
        const msg = typeof data.error === 'object' ? String(data.error.message ?? '') : String(data.error)
        return { ok: false, reason: 'api', message: msg }
      }
      return {
        ok: true,
        isAvailable: !!data.is_available,
        infos: (Array.isArray(data.balance_infos) ? data.balance_infos : []).map((b) => ({
          currency: typeof b.currency === 'string' ? b.currency : '?',
          total: String(b.total_balance ?? ''),
          granted: String(b.granted_balance ?? ''),
          toppedUp: String(b.topped_up_balance ?? '')
        }))
      }
    } catch {
      return { ok: false, reason: 'parse' }
    }
  }
  async function cachedBalance() {
    if (cacheState.balanceCache.data !== null && Date.now() - cacheState.balanceCache.at < 30000) {
      return cacheState.balanceCache.data
    }
    const data = await fetchBalance()
    if (data && data.ok === true) cacheState.balanceCache = { at: Date.now(), data }
    return data
  }
  return { fetchBalance, cachedBalance }
}

// ── 下一条预测:读会话较重,60s 缓存;model 变化立即重算 ───────────────────────
async function predictNext(sq, sessionId, modelHint) {
  let snapshot = null
  try {
    snapshot = await sq.readSession(sessionId)
  } catch {
    return null
  }
  const now = Date.now()
  let context = 0
  let histModel = null
  const inputs = []
  const outputs = []
  for (const ev of snapshot?.events ?? []) {
    const u = ev.data?.usage
    if (!u) continue
    const t = u.inputTokens || 0
    const h = u.cacheReadTokens || 0
    const o = u.outputTokens || 0
    if (t + h + o <= 0) continue
    if (t + h > 0) context = t + h
    if (t > 0) inputs.push(t)
    if (o > 0) outputs.push(o)
    histModel = modelOf(ev)
  }
  const sum = (a) => a.reduce((x, y) => x + y, 0)
  const avgInput = inputs.length ? Math.round(sum(inputs) / inputs.length) : 0
  const avgOutput = outputs.length ? Math.round(sum(outputs) / outputs.length) : Math.max(50, Math.round(context / 5))
  const predictedInput = context + avgInput
  const predictedOutput = avgOutput
  const model = modelHint && modelHint.trim() ? modelHint : histModel
  const unit = priceAt(model ?? 'unknown', now)
  const c = costOf({ inputTokens: avgInput, cacheReadTokens: context, outputTokens: predictedOutput }, unit)
  return {
    contextTokens: context,
    avgInput,
    avgOutput,
    predictedInput,
    predictedOutput,
    totalTokens: predictedInput + predictedOutput,
    costCny: c.cost,
    costUsd: c.costUsd,
    model,
    asOf: now
  }
}

// ── 会话活动(呼吸灯/速率)与模型来源 ────────────────────────────────────────
function createActivity(agents, projections, sessionQuery) {
  // 全局近实时活动检测:汇总 live 会话投影增量 → tok/s;无投影回退日志估算
  function activityFromProjection() {
    if (!agents || !projections) return null
    try {
      let totalOutput = 0
      let hasAny = false
      for (const agent of agents.list()) {
        const session = agent.session
        if (!session) continue
        const tokenUsage = projections.snapshot(session)?.values?.tokenUsage
        if (tokenUsage && typeof tokenUsage.outputTokens === 'number') {
          totalOutput += tokenUsage.outputTokens
          hasAny = true
        }
      }
      if (!hasAny) return null
      const now = Date.now()
      const prev = cacheState.globalTpsState
      let active = false
      let tps = 0
      if (prev !== null) {
        const dt = Math.max(1, now - prev.at)
        const delta = Math.max(0, totalOutput - prev.output)
        tps = delta / (dt / 1000)
        active = delta > 0
      }
      cacheState.globalTpsState = { output: totalOutput, at: now }
      return { active, tps, live: true }
    } catch {
      return null
    }
  }
  // 当前会话选中的模型
  function currentModel(sessionId) {
    if (!agents) return null
    for (const agent of agents.list()) {
      if (agent.session && agent.session.id === sessionId) return agent.options?.model ?? null
    }
    return null
  }
  async function cachedSessionActivity(sessionId) {
    if (!sessionQuery) return null
    const hit = activityCache.get(sessionId)
    if (hit !== undefined && Date.now() - hit.at < 30000) return hit.data
    const data = await sessionActivity(sessionQuery, sessionId)
    activityCache.set(sessionId, { at: Date.now(), data }) // 负缓存
    return data
  }
  async function activityFor(sessionId) {
    const base = await cachedSessionActivity(sessionId)
    if (base === null) return null
    return { active: base.active, tps: base.tps, live: false }
  }
  async function cachedPrediction(sessionId, modelHint) {
    if (!sessionQuery) return null
    const model = modelHint && modelHint.trim() ? modelHint : currentModel(sessionId)
    const hit = predictionCache.get(sessionId)
    if (hit !== undefined && Date.now() - hit.at < 60000 && hit.model === model) return hit.data
    const data = await predictNext(sessionQuery, sessionId, model)
    if (data !== null) predictionCache.set(sessionId, { at: Date.now(), data, model })
    return data
  }
  return { activityFromProjection, currentModel, cachedSessionActivity, activityFor, cachedPrediction }
}

// ── 对外工厂: 一次拿齐各计算器 ──────────────────────────────────────────────
export function createCostData(ctx) {
  const credentials = ctx.get('credentials')
  const shell = ctx.get('shell')
  const sessionQuery = ctx.get('sessionQuery')
  const agents = ctx.get('agents')
  const projections = ctx.get('sessionProjections')

  const { fetchBalance, cachedBalance } = credentials && shell
    ? createBalance(credentials, shell)
    : { fetchBalance: async () => ({ ok: false, reason: 'no-credential' }), cachedBalance: async () => ({ ok: false, reason: 'no-credential' }) }
  const activity = createActivity(agents, projections, sessionQuery)

  async function cachedUsage24h() {
    if (!sessionQuery) return null
    if (cacheState.usage24hCache.data !== null && Date.now() - cacheState.usage24hCache.at < 300000) {
      return cacheState.usage24hCache.data
    }
    const data = await usage24h(sessionQuery, Date.now())
    if (data !== null) cacheState.usage24hCache = { at: Date.now(), data }
    return data
  }

  async function cachedSessionSource(sessionId) {
    if (!sessionQuery) return null
    const hit = sourceCache.get(sessionId)
    if (hit !== undefined && Date.now() - hit.at < 60000) return hit.data
    const data = await sessionSource(sessionQuery, sessionId)
    sourceCache.set(sessionId, { at: Date.now(), data }) // 负缓存:null 也缓存
    return data
  }

  // 从请求 url 解析 session 参数;缺省回退最新会话
  async function resolveSession(req) {
    try {
      const u = new URL(req.url ?? '/', 'http://localhost')
      const s = u.searchParams.get('session')
      if (s !== null) return s
    } catch { /* keep null */ }
    if (!sessionQuery) return null
    try {
      const sessions = await sessionQuery.listSessions()
      return sessions[0]?.header?.id ?? null
    } catch {
      return null
    }
  }

  return {
    cachedBalance,
    cachedUsage24h,
    cachedSessionSource,
    activity,
    resolveSession
  }
}
