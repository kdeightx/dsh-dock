# dsh-dock

DeepSeek Harness 插件工具库（monorepo）——为 DSH Web 添加各种扩展功能。

> 📖 想自己写 DSH 插件？看 **[DSH 插件编写指南](./docs/dsh-plugin-guide.md)**——基于本工具集实战经验整理：工程结构、Host/Client 双面契约、Slot 注入、DOM 注入、热插拔原理、调试与踩坑记录。

## 插件清单

> **状态说明**：`dsh-plugin-manager` 目前为 **测试版**——热插拔开关的完整闭环（禁用后 host 端点真正下线、启用后恢复、开关状态跨重启持久化）尚未全部验收，可能存在行为不完整。其余插件已实测可用。

| 插件 | 状态 | 功能 | 安装 |
|---|---|---|---|
| [dsh-session-delete](./dsh-session-delete/) | ✅ 已实测 | 侧栏会话 ⋯ 菜单注入「删除会话」：红字菜单项、DSH 风格确认框、彻底删除任意会话（同名候选选择、模式/目录/时间信息展示、运行中会话保护） | `dsh plugin --profile web add dsh-session-delete` |
| [dsh-plugin-manager](./dsh-plugin-manager/) | 🧪 **测试版** | 插件管理器：设置页「自定义插件」tab，列出所有已安装自定义插件，支持**热插拔开关**（禁用/启用即时生效、状态持久化，管理器自身防禁用） | `dsh plugin --profile web add dsh-plugin-manager` |
| [dsh-system-restart](./dsh-system-restart/) | ✅ 已实测 | 侧边栏底部「重启 DSH」按钮（与设置按钮同款排版）：确认后自动拉起新进程完成热重启，会话数据不丢失 | `dsh plugin --profile web add dsh-system-restart` |
| [dsh-system-shutdown](./dsh-system-shutdown/) | ✅ 已实测 | 侧边栏底部「关闭 DSH」按钮：确认后优雅退出 DSH Web 进程 | `dsh plugin --profile web add dsh-system-shutdown` |
| [dsh-sidebar-cost](./dsh-sidebar-cost/) | ✅ 已实测 | 侧边栏成本卡片：余额/波峰低峰/切换倒计时/近 24h 话费，隐藏 cost-crystal 悬浮卡 | `dsh plugin --profile web add dsh-sidebar-cost` |
| [dsh-safe-mode](./dsh-safe-mode/) | ✅ 已实测 | **安全模式面板**：配合 dsh-safe 脚本，插件被改坏导致 dsh 打不开时，以安全模式进入并在页面顶部横幅救援（解除隔离/移除） | `dsh plugin --profile web add dsh-safe-mode` |
| [dsh-whiteboard](./dsh-whiteboard/) | 🧪 新 | 右侧侧边栏白板（接入 Excalidraw）：会话头部右上角按钮展开右侧列、多画布、自动保存到 profile、PNG/SVG 导出 | `dsh plugin --profile web add dsh-whiteboard` |

## 安全模式（dsh-safe + 透明包装器）

> 🛟 插件被 AI 改坏、dsh 打不开时，**不需要第二个 Agent 救场**。
> **端口即模式指示灯**：正常 3080 / 安全模式 9527，插件健康自动回 3080。

**自动进入**（推荐）：安装一次透明包装器，任何启动方式（首次/手动/重启按钮）都会
插件坏 → 自动隔离 → 9527 安全模式 + 右下角 🛟 便签（问题插件/原因/📋复制诊断/解除隔离并重启）；
插件健康 → 3080 正常模式。装在 `~/.local/bin/dsh`（**升级免疫**：npm 更新 dsh 不影响）。

```bash
bash dsh-safe/install-wrapper.sh   # 安装（自动检查 PATH 顺序）
dsh-safe status                    # 体检报告 + 隔离清单
dsh-safe heal --all                # 修好后解除隔离
```

- `dsh-safe` 是独立脚本（非插件），dsh 崩了也能跑；安装：`cp dsh-safe/dsh-safe.mjs ~/.local/bin/dsh-safe`
- 原理：dsh 的 patch 覆盖层 `- id: <行id>` + `disabled: true` 的条目 Loader 连模块都不 import，
  坏插件被跳过即可正常启动；详见 [INSTALL.md 第 7 节](./INSTALL.md)。

## 安装任意插件

```bash
cd <插件目录>          # 例如 cd dsh-session-delete
dsh plugin --profile web add .
```

或从仓库根直接安装：

```bash
dsh plugin --profile web add dsh-session-delete
```

安装后**重启 DSH Web 并硬刷新浏览器**。

## 布局说明

- 「重启 DSH」「关闭 DSH」注册在侧边栏底部 `sidebar.footer.action`；产品 DOM 顺序为 footer 区在设置上方，插件注入一条布局 CSS（`.hHd-Xa_footArea{flex-direction:column-reverse}` + footer 容器 `flex-wrap`）使阅读顺序为 **设置 → 重启 DSH → 关闭 DSH**。该 CSS 依赖产品哈希类名，升级后若类名变化按钮退回默认位置（不影响功能）。
- 插件热插拔通过 Loader 的 `entry.update({disabled})` + `_dispose()`/`init()` 实现，开关状态持久化到 profile 的 `cordis.patch.yml`。

## 开发新插件

在仓库根新建子目录，保持结构：

```
dsh-<name>/
├── package.json          # dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml      # 组合配置行
└── lib/
    ├── index.js          # Host 面（node ESM）
    └── client.js         # 浏览器面（__ModuleLoader__ bundle）
```

详见 [dsh-session-delete](./dsh-session-delete/README.md) 作为完整示例。

## 许可证

MIT