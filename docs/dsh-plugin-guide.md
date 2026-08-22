# DSH 插件编写指南

基于 dsh-dock 工具集（`dsh-session-delete` / `dsh-whiteboard` / `dsh-system-restart` / `dsh-system-shutdown`）的实战经验整理。面向 DeepSeek Harness Web（`dsh web` profile）的静态插件开发。

---

## 1. 核心概念

### 1.1 插件 = 一个 npm 包（bundle）

DSH 的插件是一个普通 npm 包，通过两处声明接入系统：

| 声明 | 位置 | 作用 |
|---|---|---|
| `dsh.bundle.patch` | `package.json` | 指向 `cordis.patch.yml`——插件的**组合配置层**，声明向系统插入哪些"行"（插件实例） |
| `dsh.client` | `package.json` | 声明**浏览器面**（`platform: "web"`），DSH 启动时扫描并注入 `window.__DSH_BOOT__` |

包同时包含两个面：

- **Host 面**（`main` → `lib/index.js`）：跑在 DSH 的 node 进程里，有完整 node 能力（`node:fs`、子进程、HTTP…）
- **Client 面**（`exports["./client"]` → `lib/client.js`）：跑在浏览器里，**有完整 DOM 权限**（`document`/`window`/`fetch`/`MutationObserver` 随便用）

### 1.2 静态插件 vs 动态插件

| | 静态插件（本指南） | 动态插件（会话内 cordis 工具） |
|---|---|---|
| 形态 | npm 包 + `cordis.patch.yml`，`dsh plugin add` 安装 | 会话内 `cordis_define` 定义，进程内存运行 |
| 权限 | 完整 node + 完整 DOM + 可改组合配置 | Client 沙箱（无 document）、只能进官方 slot |
| 生效 | 重启 + 硬刷新；Client 代码可热更新 | 批准后即时 |
| 用途 | 正式功能、UI 增强、行内菜单注入 | 实验、临时工具 |

> **关键差异**：动态插件的 Client 沙箱没有 `document`，无法操作产品 DOM；静态插件的 Client 是完整 bundle，想碰哪碰哪。要做"修改官方 UI 内部"这类事，必须静态插件。

---

## 2. 最小工程模板

```
dsh-my-plugin/
├── package.json
├── cordis.patch.yml
└── lib/
    ├── index.js          # Host 面（node ESM）
    └── client.js         # 浏览器面（__ModuleLoader__ bundle）
```

### package.json

```jsonc
{
  "name": "dsh-my-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": { "default": "./lib/index.js" },
    "./client": { "default": "./lib/client.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "README.md"],
  "license": "MIT",
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },   // 成为 profile layer 的必要声明！
    "client": {
      "inject": ["@deepseek-ai/dsh-client-runtime"], // 浏览器面依赖（加载顺序）
      "platform": "web"
    }
  }
}
```

> **没有 `dsh.bundle.patch` 时**：`dsh plugin add` 只把它装成普通依赖，**不会**进入组合配置（CLI 会警告 "declares no dsh.bundle"）。

### cordis.patch.yml

```yaml
# 纯增量行：向系统插入一个插件实例。
- insert:
    - id: my-plugin          # 行 id（全局唯一）
      name: 'dsh-my-plugin'  # 包名
```

也可以**禁用官方行**（社区插件常用）：

```yaml
- id: ui-workspace          # 官方行 id（来自官方 bundle 的 patch）
  disabled: true
- insert:
    - id: my-ui
      name: 'dsh-my-plugin'
```

### Host 面（lib/index.js）

```js
import { appendFileSync } from 'node:fs'

// 硬依赖声明：不声明，ctx.get() 返回 undefined！这是最常见的坑。
const inject = ['webServer']

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return
  const dispose = webServer.register({
    kind: 'exact',
    path: '/dsh-my-plugin/ping',
    handler: (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
    }
  })
  // 生命周期：插件被卸载时自动清理路由
  ctx.effect(() => dispose, 'dsh-my-plugin: route')
}

export { inject }
```

### Client 面（lib/client.js）

```js
window.__ModuleLoader__.load({
  id: 'dsh-my-plugin',                  // 与包名一致
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    let react = require('react')        // 官方 bundle 都这么拿 React

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      return slots.inject('sidebar.footer.action', () => slots.register(
        { name: 'sidebar.footer.action', id: 'my-action', order: 10 },
        (props) => react.createElement('div', null, '你好')
      ))
    }

    const inject = ['slots']
    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
})
```

---

## 3. Host 面编写

### 3.1 服务注入（最重要的坑）

**必须导出 `inject` 数组声明硬依赖**，否则 `ctx.get('service')` 返回 `undefined`：

```js
const inject = ['webServer', 'sessionQuery', 'sessionPersistence', 'workspaceRegistry', 'agents', 'sessions', 'loader', 'clientModules']
export { inject }
```

常见服务（来自 Host Service 目录，`ctx.get` 前先确认键名）：

| 服务 | 用途 |
|---|---|
| `webServer` | 注册 HTTP 路由（`register({kind, path, handler})`） |
| `sessionQuery` | `listSessions()` / `readTitleSnapshots()` 查会话与标题 |
| `sessionPersistence` | `locate(header)` 定位会话日志路径 |
| `workspaceRegistry` | `list()` 工作区、`archiveSession`、实体 `detachSession` |
| `sessions` | 内存会话 store（`flush`、`liveEntryFor`、`detachEntered`） |
| `agents` | 运行中 agent（`get(id)`，检查 `agent.status === 'running'`） |
| `loader` | 组合加载器（热插拔的核心，见 §6） |
| `clientModules` | `graph()` 浏览器 bundle 图 |

### 3.2 HTTP 端点

```js
webServer.register({
  kind: 'exact',                       // exact | prefix
  path: '/dsh-my-plugin/ping',         // 绝对路径，无尾斜杠
  handler: async (req, res) => { /* node http 的 (IncomingMessage, ServerResponse) */ }
})
```

- 路由重复注册（同 kind+path）会抛错——路径用插件名做前缀避免冲突
- 浏览器端 `fetch('/dsh-my-plugin/ping')` 同源调用，无需鉴权
- **注意**：未注册的路径会落到 SPA fallback，对非 GET/HEAD 返回 405——如果 POST 收到 405，先查路由是否真的注册了（见 §7 调试）

### 3.3 进程控制（重启/关闭）

```js
import { spawn } from 'node:child_process'

// 重启：以当前命令行参数拉起新进程，旧进程退出
const child = spawn(process.execPath, process.argv.slice(1), {
  detached: true, stdio: 'inherit', env: process.env, cwd: process.cwd()
})
child.unref()
process.exit(0)   // 建议延迟 800ms 让响应先到达浏览器
```

---

## 4. Client 面编写

### 4.1 bundle 格式

必须用 `window.__ModuleLoader__.load({ id, factory })` 注册。factory 接收 `require`（能加载官方包：`react`、`@deepseek-ai/dsh-client-ui-primitives` 等），导出 `apply` 和 `inject`。

### 4.2 Slot 系统（UI 注入）

插件 UI 通过 slot 注册，不直接操作 React 树。常用 slot（以当前版本为准，可用工具查询）：

| Slot | 类型 | 用途 |
|---|---|---|
| `sidebar.footer.action` | list | 侧边栏底部操作按钮（设置旁边） |
| `settings.section` | list | 设置面板的一个 tab 页 |
| `conversation.session.header.actions` | list | 会话头部操作按钮（插件化会话操作唯一入口） |
| `shell.overlay` | list | 全屏浮层 |

注册示例（设置 tab）：

```js
slots.inject('settings.section', () => slots.register(
  { name: 'settings.section', id: 'my-page', order: 30, label: () => '我的页面' },
  () => react.createElement(MyTab, null)
))
```

> **行内菜单是锁死的**：会话行 ⋯ 菜单（重命名/分叉/归档）是官方硬编码，没有 slot 可注入。要做到社区插件那样的行内菜单项，只能 DOM 注入（MutationObserver 监听菜单打开后插入元素，见 `dsh-session-delete` 的实现）。

### 4.3 DOM 注入（修改官方 UI 内部）

静态插件有完整 DOM，可以用 MutationObserver 往官方 UI 里注入内容：

```js
const observer = new MutationObserver(() => {
  for (const menuEl of document.querySelectorAll('div[role="menu"]')) {
    // 找到目标菜单项（用 aria/text 特征，不要依赖哈希类名）
    // 插入自己的按钮
  }
})
observer.observe(document.body, { childList: true, subtree: true })
```

- **选择器稳定性**：优先 `role`/`aria-label`/文本匹配，避免官方哈希类名（`hHd-Xa_xxx` 这类会随构建变化）
- 生命周期：apply 返回清理函数时 `observer.disconnect()` + 移除注入的 style 标签

### 4.4 样式

- 主题变量：`var(--dsw-alias-bg-base)`、`var(--dsw-alias-label-primary)`、`var(--dsw-alias-state-error-primary)` 等（亮/暗主题自动适配），不确定的变量给 fallback：`var(--dsw-alias-border-l1, #e2e2e2)`
- 布局注入：`document.head.appendChild(<style>)`，清理时移除

---

## 5. 安装与生效

```bash
# 本地目录（开发模式）：pnpm 以 symlink 链接，改源码即时反映
dsh plugin --profile web add /path/to/dsh-my-plugin

# npm 包 / tgz（分发模式）：内容进入 pnpm store（对使用者是固化副本）
dsh plugin --profile web add dsh-my-plugin@latest

# 验证组合
dsh --profile web --dump-config | grep my-plugin

# 生效：重启 DSH Web + 硬刷新
```

**Client 代码热更新**：组合里 `client-hmr` 行默认启用（500ms 轮询 bundle 文件 → SSE 推送 rebuilt → 浏览器自动重载）。改 `lib/client.js` 通常无需重启，硬刷新兜底。**Host 代码必须重启**（node 模块已加载）。**安装/卸载必须重启**（组合配置启动时生成）。

---

## 6. 进阶：运行时热插拔（Loader API）

`ctx.get('loader')` 拿到组合加载器，可运行时启用/禁用插件行：

```js
// 收集所有 entry（注意跨树递归：顶层 Loader 树 + Include 子树）
function collectEntries(root) {
  const out = []
  const seen = new Set()
  const walk = (tree) => {
    for (const entry of tree.entries()) {
      if (seen.has(entry)) continue
      seen.add(entry)
      out.push(entry)
      const plugin = entry.fiber?.runtime?.callback
      if (plugin && plugin !== tree && typeof plugin.entries === 'function') walk(plugin)
    }
  }
  walk(root)
  return out
}

// 禁用：先记录状态，再手动卸载 fiber
await entry.update({ disabled: true })
if (entry.fiber !== undefined) await entry._dispose()

// 启用：update 触发重新 init
await entry.update({ disabled: false })
```

**坑**：
- entry id 带命名空间前缀（如 `include:test-blink`）——查找时用 `endsWith(':' + 短id)` 兜底
- 仅 `entry.update({disabled:true})` 有时不会真正卸载（内部 group 判断路径），**手动 `_dispose()` 兜底**才可靠
- 禁用**自身**会导致没有恢复入口——管理器要防自锁
- 持久化：运行时操作是临时的，重启后按组合配置还原；要跨重启保持开关，写 profile 的 `cordis.patch.yml`（用 `loader.resolve('include').fiber.runtime.callback.filename` 找到 profile 目录）

---

## 7. 调试与验证

### 7.1 诊断日志

Host 面写文件日志（进程 stdout 用户看不到）：

```js
const diag = (line) => {
  try { appendFileSync('/tmp/dsh-my-plugin.log', `${new Date().toISOString()} ${line}\n`, 'utf8') } catch {}
}
```

### 7.2 端点验证

```bash
curl -s -X POST http://127.0.0.1:3080/dsh-my-plugin/ping -H 'Content-Type: application/json' -d '{"k":"v"}'
curl -s http://127.0.0.1:3080/ | grep 'dsh-my-plugin'   # 检查 __DSH_BOOT__ 是否含 client 面
```

### 7.3 常见故障速查

| 现象 | 原因 |
|---|---|
| 插件行在 dump-config 里但无效果 | Host 面没导出 `inject`，服务全是 undefined |
| POST 端点 405 | 路由没注册（请求落 SPA fallback），先查诊断日志 |
| Client 改了没生效 | 缓存/HMR 未接管，硬刷新；Host 改动必须重启 |
| 禁用后功能还在 | `entry.update` 未真正卸载，需要手动 `_dispose()` |
| 列表里出现 `cordis:group`/`cordis:include` | loader 内部行，npm 包名不含 `:`，用它过滤 |
| 按钮并排挤一行 | 官方容器是 flex，子项 `flex:1` 的 flex-basis 覆盖 width；用 `flex: 0 0 auto` + `width:100%` + 容器 `flex-wrap` |

---

## 8. 最佳实践清单

1. **路径前缀**：端点、entry id、slot id 全部用插件名做前缀，避免冲突
2. **生命周期完整**：apply 返回清理函数（disposer 收集）；`ctx.effect` 注册副作用
3. **选择器稳定**：优先 aria/role/文本，不依赖官方哈希类名；必须用时注释说明降级行为
4. **开发用 link 安装**（`add <本地目录>`），改 Client 免重启
5. **敏感信息**：`.gitignore` 排除 `*.tgz`、`node_modules/`、`.DS_Store`；发布前扫描绝对路径/token
6. **状态诚实**：未验收的功能在 README 标注测试版
7. **每个插件独立职责**：工具库按功能拆分（删除/重启/关闭/管理器各自成包），管理器可独立开关

---

## 9. 参考实现

本仓库即完整示例：

- `dsh-session-delete/`：DOM 注入（行内菜单）+ HTTP 端点 + 会话删除（live 会话 flush/detach）
- `dsh-whiteboard/`：客户端 bundle 构建（esbuild 延迟加载 + `lib/vendor`）+ 右侧窗口 UI + 画布持久化
- `dsh-system-restart/`、`dsh-system-shutdown/`：进程控制 + 侧边栏按钮（与设置按钮同款排版）
