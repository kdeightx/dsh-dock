# dsh-dock 插件安装说明（AI 可执行版）

> 本文档写给**目标设备上的 AI 助手**：请按本说明完成插件安装，并在每一步之后验证结果。
> 本设备上所有插件源码已在本目录（`dsh-dock/`）下，无需联网下载插件本体；
> 仅 `dsh-cost-crystal` 需要从 npm registry 安装（需要网络）。

---

## 0. 环境检查（先做）

```bash
# 确认 dsh CLI 可用
dsh --version

# 确认目标 profile 已初始化（默认 web）
ls ~/.dsh/profiles/web/package.json
```

- 若 `dsh` 命令不存在：先安装 DeepSeek Harness，再继续。
- 若 profile 目录不存在：先运行一次 `dsh web`（或 `dsh --profile web`）完成初始化。
- 当前工作目录应包含以下插件目录（请用 `ls` 确认）：
  `dsh-system-restart`、`dsh-system-shutdown`、`dsh-plugin-manager`、
  `dsh-session-delete`、`dsh-sidebar-cost`、`dsh-safe-mode`、`dsh-safe`

---

## 1. 安装依赖插件（必须先装）

`dsh-sidebar-cost` 依赖 `dsh-cost-crystal` 提供的 `/ds-balance`、`/ds-activity`
数据路由，**必须先安装**：

```bash
dsh plugin --profile web add dsh-cost-crystal
```

验证：命令应输出类似 `+ dsh-cost-crystal ^0.1.0`，且
`~/.dsh/profiles/web/package.json` 的 `dependencies` 和 `dsh.profile.bundles`
中都出现 `dsh-cost-crystal`。

> **浮层已移除**：`install.sh` 会在安装后自动执行
> `dsh-sidebar-cost/patch-cost-crystal.sh`，去掉 cost-crystal 的右上角浮层
> （折叠条已取代它；浮层轮询频繁 `readSession` 解压会话，是卡顿主因）。
> 若 cost-crystal 升级（pnpm 重装覆盖）导致浮层复活，重跑 `install.sh` 或该 patch 脚本即可。

---

## 2. 安装本地 link 插件

对以下每个插件，用**绝对路径**执行（`<ABS>` 替换为当前目录的绝对路径，
可用 `pwd` 获取）。按下列顺序安装：

```bash
dsh plugin --profile web add "link:<ABS>/dsh-system-restart"
dsh plugin --profile web add "link:<ABS>/dsh-system-shutdown"
dsh plugin --profile web add "link:<ABS>/dsh-plugin-manager"
dsh plugin --profile web add "link:<ABS>/dsh-session-delete"
dsh plugin --profile web add "link:<ABS>/dsh-sidebar-cost"
dsh plugin --profile web add "link:<ABS>/dsh-safe-mode"
```

每个插件安装后，`dsh plugin` 会自动把它追加进
`~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles`（声明了
`dsh.bundle` 的包会自动挂载，无需手动改 `cordis.patch.yml`）。

验证：安装完 6 个后，`package.json` 的 `dsh.profile.bundles` 应包含（顺序无关）：
`dsh-system-restart`、`dsh-system-shutdown`、`dsh-plugin-manager`、
`dsh-session-delete`、`dsh-sidebar-cost`、`dsh-safe-mode`、`dsh-cost-crystal`。

---

## 3. 安装安全模式脚本（dsh-safe）

`dsh-safe` 是**独立脚本**（不是插件），dsh 崩了也能跑，用于体检插件、
自动隔离坏插件并以安全模式启动。建议装到 PATH：

```bash
mkdir -p "$HOME/.local/bin"
cp "<ABS>/dsh-safe/dsh-safe.mjs" "$HOME/.local/bin/dsh-safe"
chmod +x "$HOME/.local/bin/dsh-safe"
# 确认可运行（应打印体检报告）
dsh-safe status
```

若 `~/.local/bin` 不在 PATH，直接用绝对路径调用即可。

---

## 4. 重启并验证

插件是 bundle 层，**必须重启 dsh web 进程**才能加载：

1. 若 dsh web 正在运行：请用户点击侧边栏底部「重启 DSH」按钮（或手动重启进程）。
2. 重启完成后，浏览器**硬刷新**（Cmd+Shift+R / Ctrl+Shift+R）。

验证清单（重启后逐项检查）：

| 检查项 | 预期 |
|---|---|
| 侧边栏底部按钮区 | 从上到下：**设置 → 成本条 → 重启 DSH → 关闭 DSH** |
| 重启 DSH 按钮图标 | 绿色心电图呼吸动画（lucide Activity）；后台断开时变红静止 |
| 关闭 DSH 按钮图标 | 电源键符号（lucide Power） |
| 成本条 | 显示余额（如 ¥xx.xx）、波峰/低峰徽章、切换倒计时 |
| 成本条点击 ▸ | 展开详情面板（模型/速率/余额明细/预测） |
| 会话列表 ⋯ 菜单 | 出现「删除会话」 |
| 设置页 | 出现「自定义插件」管理器 |
| 右上角 | **不再出现** dsh-cost-crystal 的悬浮余额卡片 |
| 页面顶部 | **不出现**安全模式横幅（有横幅 = 有插件被隔离，见第 7 节） |

---

## 5. 常见问题（遇到时排查）

- **`dsh plugin ... add` 报 pnpm EPERM/权限错误**：确认当前用户对
  `~/.dsh/profiles/web` 有写权限；不要用 sudo 运行 dsh。
- **link 路径错误**：`link:` 后必须是**绝对路径**，且目录内有 `package.json`
  和 `dsh.bundle` 声明。
- **重启后按钮/卡片没出现**：检查浏览器 Console 是否有
  `dsh-sidebar-cost` / `dsh-system-restart` 相关报错；确认
  `package.json` 的 bundles 列表包含对应包名。
- **成本条显示「查询失败」**：确认 `dsh-cost-crystal` 已安装且
  `DEEPSEEK_API_KEY` 已在 dsh 环境配置（余额查询走官方 `/user/balance`）。
- **重复安装**：本安装幂等，重复执行同一命令无害（pnpm 跳过已装版本）。

---

## 6. 卸载

```bash
dsh plugin --profile web remove dsh-cost-crystal
dsh plugin --profile web remove dsh-system-restart
dsh plugin --profile web remove dsh-system-shutdown
dsh plugin --profile web remove dsh-plugin-manager
dsh plugin --profile web remove dsh-session-delete
dsh plugin --profile web remove dsh-sidebar-cost
dsh plugin --profile web remove dsh-safe-mode
rm -f "$HOME/.local/bin/dsh-safe"
```

之后同样需要重启 dsh web。

---

## 7. 安全模式：插件被改坏、dsh 打不开时自救

> 适用场景：AI 或人修改插件源码时出错（最常见：`lib/index.js` 语法错误），
> 导致 dsh 启动即失败、Web 界面完全进不去。此时**不需要第二个 Agent 救场**。

### 原理（一句话）

dsh 的 patch 覆盖层里 `- id: <行id>` + `disabled: true` 的条目，
Loader **连模块都不会 import**。安全模式把坏插件的行写进
`~/.dsh/profiles/web/safe-mode.overlay.yml`，再以
`dsh web --patch <overlay> --port 9527` 启动 —— 坏插件被跳过，dsh 正常进入。

**端口即模式指示灯**：正常模式 `3080`，安全模式 `9527`；插件修好解除隔离后自动回 `3080`。

### 自动进入安全模式（推荐：透明包装器）

安装一次，之后**任何启动方式**（首次启动 / 手动重启 / 点重启按钮）都会自动：
插件有问题 → 隔离 → 9527 安全模式；插件健康 → 3080 正常模式。

```bash
bash dsh-safe/install-wrapper.sh        # 安装到 ~/.local/bin/dsh(升级免疫)
which dsh                               # 应显示 ~/.local/bin/dsh
```

- **升级免疫**：包装器在用户目录（npm 不碰），写死调用真 dsh；
  npm 升级 `@deepseek-ai/dsh` 不影响自动降级能力。
- 需要 PATH 里 `~/.local/bin` 排在 npm-global 之前（脚本会自动检查）。
- 卸载：`bash dsh-safe/install-wrapper.sh uninstall`。

### 手动入口（dsh-safe CLI，兜底）

```bash
dsh-safe start            # 体检所有插件 → 自动隔离损坏者 → 启动(正常3080/安全9527)
dsh-safe status           # 体检报告 + 当前隔离清单
dsh-safe heal <pkg|id>    # 修好源码后解除隔离（--all 全部解除；仍损坏会拒绝，除非 --force）
dsh-safe quarantine <pkg> # 手动隔离一个插件（--force 跳过健康检查）
dsh-safe remove <pkg>     # 彻底移除插件（等价 dsh plugin remove）
```

### 安全模式里怎么修

1. 进入安全模式（9527）后，**右下角出现 🛟 便签**（贴纸式，一直悬挂）：
   显示当前模式、问题插件、原因；按钮 **📋 复制诊断**（复制完整报告到剪贴板）、
   **解除隔离并重启**；✕ 关闭后可点右下角小圆钮重新打开。
2. 让 AI 修复插件源码（改的是 `dsh-dock/` 下对应插件目录，link 安装即时生效）。
3. 点便签「解除隔离并重启」—— 先做语法体检，仍坏会拒绝并显示原因；
   修好后重启即回正常模式（3080）。

### 注意

- `dsh-safe-mode` 插件**不要改**：安全模式便签全靠它，它坏了就没有界面了。
- overlay 文件空时内容是 `[]`（不是删除）—— 进程若以 `--patch <它>` 启动，
  重启按钮会沿用该参数，文件必须存在。
- 若坏的是 `cordis.patch.yml` / `package.json` 本身（合成期损坏），overlay 救不了，
  `dsh-safe start` 会明确提示：修文件，或 `dsh plugin --profile web remove <pkg>`。
- 自动降级判定依赖 dsh 的错误信息格式；dsh 大版本升级后建议模拟一次插件故障验证。
