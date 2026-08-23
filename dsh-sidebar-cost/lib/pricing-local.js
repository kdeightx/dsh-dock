// 定价引擎 —— 内联自 dsh-cost-crystal/lib/pricing.js(© xxvk, Apache-2.0)。
// 同步日期: 2026-08-21(对应 dsh-cost-crystal 0.1.0)。
// 本地补丁 2026-08-23: 官方新规「周末(周六/周日)全天不区分峰谷,统一按低谷价」,
// modeAt/nextBoundary 已适配(8-23 00:00 起生效;此前周末波段仍按旧规计)。
// 原因: link 插件的模块解析基于软链真实路径,无法 import profile 依赖下的
// dsh-cost-crystal,故内联本文件;官方价格政策变更时需手动同步此文件。
// 来源: https://github.com/xxvk/dsh-cost-crystal

// deepseek-v4-flash 波峰/低峰价($ / 每百万 tokens);低峰为波峰半价
export const RATES = {
  peak: { cacheHit: 0.014, cacheMiss: 0.44, output: 1.32 },
  offpeak: { cacheHit: 0.007, cacheMiss: 0.22, output: 0.66 },
}
// 波峰窗口(UTC):01:00–04:00 与 06:00–10:00(即北京 09:00–12:00、14:00–18:00),
// 仅周一至周五;周末(8-23 新规起)全天为低峰
export const PEAK_UTC = [[1, 4], [6, 10]]
const BOUNDARIES_UTC = [1, 4, 6, 10]
/** 展示用美元→人民币估算汇率 */
export const USD_CNY = 7.1

/** 官方 2026-08-23 00:00(北京时间)起:周末全天低谷,不再执行峰谷 */
const WEEKEND_OFFPEAK_SINCE = Date.parse('2026-08-23T00:00:00+08:00')

/** 某时刻按北京时间(+08:00)所属星期:weekday | weekend */
export function dayKindAt(ms) {
  const dow = new Date(ms + 8 * 3600 * 1000).getUTCDay()
  return dow === 0 || dow === 6 ? 'weekend' : 'weekday'
}

/** 某时刻按北京时间(+08:00)的星期标签:周一…周日 */
export function dayLabelAt(ms) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(ms + 8 * 3600 * 1000).getUTCDay()]
}

/** 某时刻属于波峰还是低峰;波峰窗口(UTC 01:00–04:00 / 06:00–10:00,
 *  即北京 09:00–12:00、14:00–18:00)仅周一至周五,
 *  周末全天为低峰(8-23 公告前周末仍执行峰谷,按时间点回溯正确计费) */
export function modeAt(ms) {
  const h = new Date(ms).getUTCHours()
  const inWindow = PEAK_UTC.some(([a, b]) => h >= a && h < b)
  if (!inWindow) return 'offpeak'
  const dow = new Date(ms).getUTCDay()
  if (dow === 0 || dow === 6) return ms >= WEEKEND_OFFPEAK_SINCE ? 'offpeak' : 'peak'
  return 'peak'
}

/** 下一个费用调整边界(UTC 整点 01/04/06/10),返回 epoch 毫秒。
 *  周末全天低谷(8-23 新规起)无任何边界:下一调整为下个工作日(周一)01:00 UTC。 */
export function nextBoundary(ms) {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  const dow = d.getUTCDay()
  const weekendAllOffpeak = ms >= WEEKEND_OFFPEAK_SINCE && (dow === 0 || dow === 6)
  if (!weekendAllOffpeak) {
    for (const h of BOUNDARIES_UTC) {
      const t = Date.UTC(y, m, day, h, 0, 0, 0)
      if (t > ms) return t
    }
  }
  // 当日边界已过(或周末全天低谷):下一边界为下个工作日的 01:00 UTC(跳过周六/周日)
  let next = Date.UTC(y, m, day + 1, BOUNDARIES_UTC[0], 0, 0, 0)
  for (;;) {
    const nd = new Date(next).getUTCDay()
    if (nd === 0) next += 24 * 3600 * 1000
    else if (nd === 6) next += 48 * 3600 * 1000
    else break
  }
  return next
}

/** 一条用量记录的美元成本 */
export function costUsd(usage, mode) {
  const r = RATES[mode]
  const input = usage.inputTokens || 0
  const hit = usage.cacheReadTokens || 0
  const output = usage.outputTokens || 0
  return (input * r.cacheMiss + hit * r.cacheHit + output * r.output) / 1e6
}

const ZERO_UNIT = { cny: { input: 0, cacheRead: 0, output: 0 }, usd: { input: 0, cacheRead: 0, output: 0 } }

/** 官方政策时间表:最新且不晚于消息时间的政策生效。新政策追加条目即可。 */
export const OFFICIAL_PRICING_POLICIES = [
  {
    since: '2025-02-09T00:00:00+08:00',
    label: 'deepseek-chat / deepseek-reasoner 标准价',
    prices: {
      'deepseek-chat': {
        cny: { input: 2, cacheRead: 0.5, output: 8 },
        usd: { input: 0.28, cacheRead: 0.028, output: 0.42 },
      },
      'deepseek-reasoner': {
        cny: { input: 4, cacheRead: 1, output: 16 },
        usd: { input: 0.55, cacheRead: 0.055, output: 1.68 },
      },
      '*': { cny: { input: 2, cacheRead: 0.5, output: 8 }, usd: { input: 0.28, cacheRead: 0.028, output: 0.42 } },
    },
  },
  {
    since: '2026-05-22T00:00:00+08:00',
    label: 'V4 系列 75% 降价转永久(deepseek-v4-flash / deepseek-v4-pro)',
    prices: {
      'deepseek-v4-flash': {
        cny: { input: 1, cacheRead: 0.02, output: 2 },
        usd: { input: 0.14, cacheRead: 0.0028, output: 0.28 },
      },
      'deepseek-v4-pro': {
        cny: { input: 3, cacheRead: 0.025, output: 6 },
        usd: { input: 0.435, cacheRead: 0.003625, output: 0.87 },
      },
      '*': { cny: { input: 1, cacheRead: 0.02, output: 2 }, usd: { input: 0.14, cacheRead: 0.0028, output: 0.28 } },
    },
  },
  {
    since: '2026-08-17T00:00:00+08:00',
    label: '峰谷定价:高峰 09:00-12:00 / 14:00-18:00(北京时间),空闲时段半价',
    peak: {
      'deepseek-v4-flash': {
        cny: { input: 3, cacheRead: 0.1, output: 9 },
        usd: { input: 0.44, cacheRead: 0.014, output: 1.32 },
      },
      'deepseek-v4-pro': {
        cny: { input: 9, cacheRead: 0.3, output: 27 },
        usd: { input: 1.32, cacheRead: 0.044, output: 3.96 },
      },
      '*': { cny: { input: 3, cacheRead: 0.1, output: 9 }, usd: { input: 0.44, cacheRead: 0.014, output: 1.32 } },
    },
    offPeak: {
      'deepseek-v4-flash': {
        cny: { input: 1.5, cacheRead: 0.05, output: 4.5 },
        usd: { input: 0.22, cacheRead: 0.007, output: 0.66 },
      },
      'deepseek-v4-pro': {
        cny: { input: 4.5, cacheRead: 0.15, output: 13.5 },
        usd: { input: 0.66, cacheRead: 0.022, output: 1.98 },
      },
      '*': { cny: { input: 1.5, cacheRead: 0.05, output: 4.5 }, usd: { input: 0.22, cacheRead: 0.007, output: 0.66 } },
    },
  },
]

/** 某时刻生效的官方政策(第一条 since 之前取首条)。 */
export function activePolicy(timeMs) {
  let active = OFFICIAL_PRICING_POLICIES[0]
  for (const policy of OFFICIAL_PRICING_POLICIES) {
    const since = Date.parse(policy.since)
    if (Number.isFinite(since) && timeMs >= since) active = policy
  }
  return active
}

function priceFor(model, table) {
  return table[model] ?? table['*'] ?? ZERO_UNIT
}

/** 某模型在某时刻的单价(双币种)+ 计价模式。 */
export function priceAt(model, timeMs) {
  const peak = modeAt(timeMs) === 'peak'
  const active = activePolicy(timeMs)
  const table = active.peak !== undefined && active.offPeak !== undefined ? (peak ? active.peak : active.offPeak) : (active.prices ?? {})
  // 从新到旧找点名该模型的政策(下架模型沿用旧价);找不到用最新政策的 * 兜底
  let unit = ZERO_UNIT
  for (let i = OFFICIAL_PRICING_POLICIES.length - 1; i >= 0; i--) {
    const policy = OFFICIAL_PRICING_POLICIES[i]
    if (Date.parse(policy.since) > timeMs) continue
    const t = policy.peak !== undefined && policy.offPeak !== undefined ? (peak ? policy.peak : policy.offPeak) : policy.prices
    if (t !== undefined) {
      unit = priceFor(model, t)
      break
    }
  }
  if (unit === ZERO_UNIT) unit = priceFor(model, table)
  const mode = active.peak !== undefined && active.offPeak !== undefined ? (peak ? 'peak' : 'offPeak') : 'flat'
  return { cny: unit.cny, usd: unit.usd, mode }
}

/** 按单价与用量计算双币种费用。 */
export function costOf(usage, unit) {
  const input = usage.inputTokens ?? 0
  const cacheRead = usage.cacheReadTokens ?? 0
  const output = usage.outputTokens ?? 0
  return {
    cost: (input * unit.cny.input + cacheRead * unit.cny.cacheRead + output * unit.cny.output) / 1e6,
    costUsd: (input * unit.usd.input + cacheRead * unit.usd.cacheRead + output * unit.usd.output) / 1e6,
  }
}
