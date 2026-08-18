# dsh-dock

DeepSeek Harness 插件集（monorepo）——为 DSH Web 添加各种扩展功能。

## 插件清单

| 插件 | 功能 | 安装 |
|---|---|---|
| [dsh-session-delete](./dsh-session-delete/) | 在侧栏会话 ⋯ 菜单注入「删除会话」：红字菜单项、DSH 风格确认框、彻底删除任意会话（含同名候选选择、模式/目录/时间信息展示） | `dsh plugin --profile web add dsh-session-delete` |

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
