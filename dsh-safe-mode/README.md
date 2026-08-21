# dsh-safe-mode

**安全模式面板** —— dsh 插件被改坏、启动失败时的最后一道防线。

## 它是干什么的

AI（或人）修改插件时一旦把 host 代码（`lib/index.js`）改坏，dsh 的 Loader 会
整体回滚启动：**一个坏插件 = dsh 打不开**，连修复的入口都没有。

dsh-safe-mode 配合 [dsh-safe](../dsh-safe/) 脚本工作：

1. `dsh-safe start` 启动前体检所有插件，把坏插件写入
   `~/.dsh/profiles/web/safe-mode.overlay.yml`（patch 覆盖层，`disabled: true`
   的条目 Loader 连模块都不会 import）；
2. dsh 以 `dsh web --patch <overlay>` 正常启动 —— **安全模式**；
3. 本插件通过 `tapIndex` 在页面顶部注入横幅：显示被隔离的插件和原因，
   提供「解除隔离并重启」（带语法体检，仍坏则拒绝）和「移除此插件」。

## 使用

```bash
# 启动（自动体检 → 自动隔离 → 自动进入安全模式）
./dsh-safe/dsh-safe.mjs start

# 查看体检报告 / 隔离状态
./dsh-safe/dsh-safe.mjs status

# 手动操作
./dsh-safe/dsh-safe.mjs heal dsh-sidebar-cost
./dsh-safe/dsh-safe.mjs quarantine dsh-sidebar-cost
./dsh-safe/dsh-safe.mjs remove dsh-sidebar-cost
```

详见 [INSTALL.md](../INSTALL.md) 的「安全模式」章节。

## ⚠️ 重要

本插件是**全仓库最不该被修改的文件之一**：它自身若损坏，安全模式就失去界面。
代码刻意保持简单、防御式（所有路由 try/catch、注入脚本独立于 slot 系统），
请勿让 AI 对它做大改。

## 接口

| 路由 | 方法 | 说明 |
|---|---|---|
| `/dsh-safe/status` | GET | 隔离状态 JSON |
| `/dsh-safe/heal` | POST | `{all:true}` 或 `{id}`：语法体检后解除隔离并重启 |
| `/dsh-safe/remove` | POST | `{pkg}`：`dsh plugin remove` 后重启 |

## License

Apache-2.0
