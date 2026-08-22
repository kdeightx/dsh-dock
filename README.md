# dsh-dock

DeepSeek Harness 插件工具库（monorepo）——为 DSH Web 添加各种扩展功能。

> 📖 想自己写 DSH 插件？看 **[DSH 插件编写指南](./docs/dsh-plugin-guide.md)**——基于本工具集实战经验整理：工程结构、Host/Client 双面契约、Slot 注入、DOM 注入、热插拔原理、调试与踩坑记录。

## 插件清单

> **状态说明**：标注「测试中」的插件以实际表现为准；其余已实测可用。

### ✅ 已实测可用

| 插件 | 功能 | 安装 |
|---|---|---|
| [dsh-session-delete](./dsh-session-delete/) | 侧栏会话 ⋯ 菜单注入「删除会话」：红字菜单项、DSH 风格确认框、彻底删除任意会话（同名候选选择、模式/目录/时间信息展示、运行中会话保护） | `dsh plugin --profile web add dsh-session-delete` |
| [dsh-system-restart](./dsh-system-restart/) | 侧边栏底部「重启 DSH」按钮（与设置按钮同款排版）：确认后自动拉起新进程完成热重启，会话数据不丢失 | `dsh plugin --profile web add dsh-system-restart` |
| [dsh-system-shutdown](./dsh-system-shutdown/) | 侧边栏底部「关闭 DSH」按钮：确认后优雅退出 DSH Web 进程 | `dsh plugin --profile web add dsh-system-shutdown` |
| [dsh-sidebar-cost](./dsh-sidebar-cost/) | 侧边栏成本卡片：余额/波峰低峰/切换倒计时/近 24h 话费，隐藏 cost-crystal 悬浮卡 | `dsh plugin --profile web add dsh-sidebar-cost` |
| [dsh-safe-mode](./dsh-safe-mode/) | **安全模式面板**：配合 dsh-safe 脚本，插件被改坏导致 dsh 打不开时，以安全模式进入并在页面顶部横幅救援（解除隔离/移除） | `dsh plugin --profile web add dsh-safe-mode` |

### 🧪 测试中

| 插件 | 功能 | 安装 |
|---|---|---|
| [dsh-whiteboard](./dsh-whiteboard/) | 右侧窗口白板（接入 Excalidraw）：会话头部右上角按钮、分割线拖拽调宽、多画布、自动保存、刷新后自动恢复 | `dsh plugin --profile web add dsh-whiteboard` |

## 常用第三方插件（自动安装清单）

> 第三方插件**不入库**：通过 `plugins.third-party.txt` 清单 + npm registry 安装，
> `install.sh` 自动读取清单逐个安装。**加一行 = 新机器自动多装一个常用插件。**

| 插件 | 功能 | 安装 |
|---|---|---|
| [dsh-skills-manager](https://github.com/MichengAI/dsh-skills-manager)（DSH 技能管理器） | 安全管理本地 Agent skills、安全查看共享 skills（独立项目，Apache-2.0） | `dsh plugin --profile web add @michengai/dsh-skills-manager` |
| [dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams)（AgentTeams 多代理团队） | 一句话把当前会话变成多代理团队：队长/成员/依赖任务/消息协作，Web 树状监视器 | `dsh plugin --profile web add @nanmicoder/dsh-agent-teams` |
| [dsh-context](https://github.com/bowenliang123/dsh-context)（上下文仪表盘） | 上下文组成/演变/事件可视化 + `/context` 命令，洞察 Agent 上下文 | `dsh plugin --profile web add dsh-context` |
| [dsh-pocket](https://github.com/shaobeichen/dsh-pocket)（DSH 口袋） | 手机扫码即同步访问电脑上的 DSH：局域网 + 公网，实时同屏 | `dsh plugin --profile web add dsh-pocket` |
| [dshmarket](https://github.com/dsh-market/dsh-market)（DSH 社区插件市场） | 浏览/搜索/一键安装 1550+ 社区插件：分类筛选、主题、更新、备份恢复、热禁用。独立社区项目，与 DSH 官方无隶属关系 | `dsh plugin --profile web add dshmarket` |

以上均为当前机器实测安装的常用插件（dsh-pocket 为 GPL-2.0，其余 MIT/Apache）。安装后重启，打开 **设置 → 插件市场**（dshmarket）即可浏览/搜索社区插件。

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

## 安装

**另一台新机器（推荐）**：拿到本仓库后直接跑一键脚本（自动装自研插件 +
第三方清单插件 + dsh-safe）：

```bash
bash install.sh                                            # 默认 profile: web
bash install.sh other-profile                              # 或指定 profile
# 远程一条命令（自动克隆仓库到 ~/.dsh/dock-plugins 再安装）：
curl -fsSL <install.sh 的 raw URL> | DSH_DOCK_REPO=<GitHub 仓库地址> bash
```

**单独安装任意插件**：

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