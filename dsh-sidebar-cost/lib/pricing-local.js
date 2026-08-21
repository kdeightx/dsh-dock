// 定价引擎 —— 内联自 dsh-cost-crystal/lib/pricing.js(© xxvk, Apache-2.0)。
// 同步日期: 2026-08-21(对应 dsh-cost-crystal 0.1.0)。
// 原因: link 插件的模块解析基于软链真实路径,无法 import profile 依赖下的
// dsh-cost-crystal,故内联本文件;官方价格政策变更时需手动同步此文件。
// 来源: https://github.com/xxvk/dsh-cost-crystal

// deepseek-v4-flash 波峰/低峰价($ / 每百万 tokens);低峰为波峰半价
export const RATES = {
  peak: { cacheHit: 0.014, cacheMiss: 0.44, output: 1.32 },
  offpeak: { cacheHit: 0.007, cacheMiss: 0.22, output: 0.66 },
}
// 波峰窗口(UTC):01:00–04:00 与 06:00–10:00;其余为低峰
export const PEAK_UTC = [[1, 4], [6, 10]]
const BOUNDARIES_UTC = [1, 4, 6, 10]
/** 展示用美元→人民币估算汇率 */
export const USD_CNY = 7.1

/** 某时刻属于波峰还是低峰(按 UTC 小时判定,时区无关) */
export function modeAt(ms) {
  const h = new Date(ms).getUTCHours()
  return PEAK_UTC.some(([a, b]) => h >= a && h < b) ? 'peak' : 'offpeak'
}

/** 下一个费用调整边界(UTC 整点 01/04/06/10),返回 epoch 毫秒 */
export function nextBoundary(ms) {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  for (const h of BOUNDARIES_UTC) {
    const t = Date.UTC(y, m, day, h, 0, 0, 0)
    if (t > ms) return t
  }
  return Date.UTC(y, m, day + 1, BOUNDARIES_UTC[0], 0, 0, 0)
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
