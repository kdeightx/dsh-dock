// dsh-sidebar-cost host half.
// 通过 tapIndex 在 index.html 做两件事:
//   1. 彻底删除 cost-crystal 注入的浮层脚本段 —— 用其唯一开头
//      `(function () { if (window.__dsBalanceInstalled) return; ...` 精准匹配删除,
//      让 HTML 里连那段未执行的脚本文本都不存在(比「设标志拦截」更干净)。
//      要求: 本 tap 注册晚于 cost-crystal 的注入 tap(bundle 顺序 cost-crystal 在前,
//      故本插件后 apply、后注册,能删到它注入的内容)。
//   2. 隐藏浮层 CSS(兜底): 若 cost-crystal 未来改了脚本开头、正则匹配不到,
//      也一并把 .ds-balance-card 隐藏,消除右上角闪现。
// 背景: 浮层即便被 CSS 隐藏,其 setInterval 轮询仍在后台执行,每次缓存过期就
//       readSession 解压会话文件,与「发消息写会话」抢 CPU/IO —— 是卡顿主因。
//       故从源头移除浮层脚本,而非仅视觉隐藏或设标志拦截。
//
// 注:本插件曾提供 /ds-today(当天 0 点起消耗)路由,用户需求改为折叠条显示近24h
// 后已移除;计价模块 pricing-local.js(内联自 dsh-cost-crystal,Apache-2.0)保留,
// 如需恢复「今日」口径可重新挂载。
const FLOAT_SCRIPT_RE = /<script>\s*\(function \(\) \{\s*if \(window\.__dsBalanceInstalled\)[\s\S]*?<\/script>/

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return
  const dispose = webServer.tapIndex((html) => {
    // ① 删除 cost-crystal 注入的浮层脚本段(彻底干掉)
    const out = html.replace(FLOAT_SCRIPT_RE, '')
    // ② 隐藏浮层 CSS(兜底)
    const style = '<style data-dsh-sidebar-cost="hide-float">.ds-balance-card{display:none!important}</style>'
    // 注入到 </head> 之前(替换串不含 $,无正则展开风险)
    return out.includes('</head>') ? out.replace('</head>', style + '</head>') : style + out
  })
  ctx.effect(() => dispose, 'dsh-sidebar-cost: hide-float-css')
}

export const inject = ['webServer']
