# dsh-sidebar-cost 💎

侧边栏底部「成本指示条」（设置按钮旁）：紧凑显示 DeepSeek 余额 / 波峰低峰状态 / 倒计时，
**点击展开**详情面板：近 24h 消耗 / 本会话费用 / 🔮 下一条消息预测。

- **数据复用**：直接调用 [dsh-cost-crystal](https://www.npmjs.com/package/dsh-cost-crystal) 的
  `/ds-balance` 与 `/ds-activity` 路由，不重复造数据、不碰官方代码。
- **隐藏浮层**：注入 CSS 隐藏原右上角悬浮卡片（`.ds-balance-card`），界面更干净。
- **官方机制**：注册到 `sidebar.footer.action` **LIST 槽**（可添加、不冲突），
  位于侧边栏底部、设置按钮旁边；`wide` 态渲染紧凑条 + 点击展开，rail 态降级为 36px 圆钮。
- **兼容性说明**：曾注册 `sidebar.workspaces`（SINGLE 槽），在 rc.7 的 load-time
  校验下冲突（该槽由 ui-workspace 独占，禁止第二注册者），故迁移至 footer 动作槽。

## 安装

```sh
dsh plugin --profile web add dsh-sidebar-cost
# 然后重启 dsh web，浏览器硬刷新
```

依赖：需先安装 `dsh-cost-crystal`（提供数据路由）。

## 结构

```
lib/index.js    Host 端（空 apply，满足 cordis 契约）
lib/client.js   浏览器端：slots 注册 + 紧凑条组件 + 展开面板 + 轮询 + 浮层隐藏 CSS
cordis.patch.yml bundle 挂载层
```

## 轮询节奏

- `/ds-balance`：10s
- `/ds-activity`（实时速率）：2s
- 倒计时/时效刷新：30s

## License 与来源声明

- 本插件以 **Apache-2.0** 发布（见 `LICENSE`）。
- **数据路由完全自研、零第三方依赖**：`lib/cost-data-local.js`（usage24h/来源/活动/预测/余额,
  v0.1.1 起替换原 dsh-cost-crystal 提供的 `/ds-balance`、`/ds-activity` 路由）、
  `lib/pricing-local.js`（计价引擎）均内联自
  [dsh-cost-crystal](https://github.com/xxvk/dsh-cost-crystal)（© xxvk, Apache-2.0），
  已按其许可要求保留版权声明并注明修改（CJS 转 ESM、仅保留数据路由、
  去除右上角浮层注入）。
- 折叠条 UI 与 helper（格式化等）为本插件自研;图标来自
  [lucide](https://lucide.dev)（ISC License, lucide-static v1.33.0）。