// dsh-sidebar-cost host half.
// 通过 tapIndex 在 index.html 注入隐藏浮层卡片的 CSS:
// cost-crystal 的浮层由服务器注入 HTML(页面加载即有),而本插件的隐藏样式若只在
// client 端注入,每次页面重载(重启/断线重连)的瞬间浮层会闪现到右上角。
// CSS 规则对动态创建的 .ds-balance-card 立即生效,故注入 <style> 即可彻底消除闪现。
//
// 注:本插件曾提供 /ds-today(当天 0 点起消耗)路由,用户需求改为折叠条显示近24h
// 后已移除;计价模块 pricing-local.js(内联自 dsh-cost-crystal,Apache-2.0)保留,
// 如需恢复「今日」口径可重新挂载。
export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return
  const dispose = webServer.tapIndex((html) => {
    const style = '<style data-dsh-sidebar-cost="hide-float">.ds-balance-card{display:none!important}</style>'
    // 注入到 </head> 之前(替换串不含 $,无正则展开风险)
    return html.includes('</head>') ? html.replace('</head>', style + '</head>') : style + html
  })
  ctx.effect(() => dispose, 'dsh-sidebar-cost: hide-float-css')
}

export const inject = ['webServer']
