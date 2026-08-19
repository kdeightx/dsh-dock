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
