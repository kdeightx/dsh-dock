# dsh-whiteboard — DSH 全屏白板（Excalidraw 接入）

会话头部右上角「白板」按钮 → 右侧**滑出独立白板窗口**（默认占窗口 2/3，滑入动画），与对话区并排；窗口与对话区之间的**分隔线可左右拖动**（split pane），宽度记忆在 localStorage。画布引擎为 [Excalidraw](https://github.com/excalidraw/excalidraw)（MIT），插件只做接入：入口、窗口、持久化。

## 功能

- 完整 Excalidraw 体验：画笔 / 形状 / 文字 / 箭头 / 图片 / 激光笔 / 无限画布 / 撤销重做 / 暗色主题跟随系统
- 独立窗口形态：按钮在会话头部右上角（与 Session log 同排右对齐）；白板窗口 fixed 于右侧、对话区同步收缩；**分隔线拖拽调宽**（360px ~ 85% 窗口，默认 2/3，宽度记忆）；关闭即恢复原布局
- 多画布管理：顶部栏切换 / 新建 / 删除（当前画布记忆在 localStorage）
- 自动保存：停笔 800ms 防抖写入 `~/.dsh/profiles/<profile>/whiteboard/`（原子写，防崩溃损坏）
- 导出：Excalidraw 自带 PNG / SVG 下载（菜单 → 导出图片）；SVG 是 LLM 最易读写的格式，为 AI 联动预留
- 主题：跟随系统 prefers-color-scheme，实时切换
- 关闭：窗口顶栏 ✕ 或 Esc（excalidraw 内部编辑时不拦截；关闭前强制落盘）
- **状态持久化**：白板开/关状态与分割线宽度都存 localStorage——刷新页面后白板自动恢复打开、宽度保持你调的比例（`dsh-whiteboard.open` / `dsh-whiteboard.width`）

## 安装

```bash
dsh plugin --profile web add /path/to/dsh-dock/dsh-whiteboard   # 或 cd 到插件目录: dsh plugin --profile web add .
# 重启 DSH Web + 硬刷新浏览器（⌘⇧R）
```

## 架构（双 bundle）

- `lib/client.js`（~16KB）：入口/按钮/窗口/持久化逻辑，页面加载即执行
- `lib/vendor/excalidraw-lib.js`（~6.3MB）：Excalidraw 全量，`<script>` 延迟加载 + 空闲预加载；React 由主 bundle 经 `window.__WB_REACT` 注入，保证同一实例

## 架构（原说明）

```
dsh-whiteboard/
├── package.json          # dsh.bundle.patch + dsh.client 声明
├── cordis.patch.yml      # insert: whiteboard 行
├── build.mjs             # 构建：esbuild 打包 + CSS/字体复制 + ModuleLoader 包装
├── src/app.js            # 浏览器面源码（改这里，然后 npm run build）
├── lib/index.js          # Host 面：画布 CRUD 端点 + vendor 静态资源
├── lib/client.js         # 【构建产物】勿手改
├── lib/vendor/           # 【构建产物】excalidraw.css + 字体
└── smoke.mjs             # 冒烟测试（node smoke.mjs）
```

### 双面分工

- **Client 面**（`conversation.session.header.utilities` 按钮 + 右侧窗口）：excalidraw 渲染、防抖保存、画布切换、分隔条拖拽。对话区收缩通过给官方 center 列（AppFrame grid 第 2 个子元素，特征匹配）设 margin-right 实现；找不到时窗口悬浮覆盖（不收缩对话区）。`getSceneElements()` 的矢量 JSON 是持久化格式——每个元素 `{type, points, strokeColor, ...}`，LLM 可直接理解。
- **Host 面**：REST 端点（list/create/get/update/delete）+ 静态资源（CSS/字体）。存储为 `boards.json` 索引 + `<id>.json` 画布，原子写（tmp + rename）。

### 端点

```
GET    /dsh-whiteboard/api/boards          画布列表
POST   /dsh-whiteboard/api/boards          新建 {name}
GET    /dsh-whiteboard/api/boards/:id      读画布（elements + appState）
PUT    /dsh-whiteboard/api/boards/:id      原子写
DELETE /dsh-whiteboard/api/boards/:id      删除
GET    /dsh-whiteboard/vendor/*            静态资源
```

## 开发

```bash
npm install                    # 装 esbuild + @excalidraw/excalidraw（仅构建期需要）
node build.mjs                 # 构建 lib/client.js + vendor（--watch 监听 src）
node smoke.mjs                 # 冒烟：模拟 ModuleLoader 加载 bundle，验证 apply/inject 导出
node test-host.mjs              # host 单元测试：mock webServer，CRUD 全流程 + 异常路径（21 项）
```

Client 改动：`node build.mjs` 后 DSH 的 client-hmr 会自动重载（硬刷新兜底）。Host 改动（`lib/index.js`）：重启 DSH。

## 已知限制

- 主 bundle 仅 ~16KB；Excalidraw 拆为独立 `excalidraw-lib.js`（~6.3MB）**延迟加载**——页面空闲时预加载，首次打开白板时才真正执行（本地服务器毫秒级），不影响页面加载速度
- 画布数据含图片元素时只存引用（excalidraw 的 files 未持久化），粘贴图片建议另存
- 语言包已裁剪为 en + zh-CN，切换其他语言无效果

## 路线图

- [ ] 「导出 SVG/PNG 到工作区」：一键落盘供 agent `read_image` / 编辑 SVG
- [ ] agent → 白板命令通道：host 端点 + client 轮询，agent 可打开白板 / 追加元素（人机共绘）
- [ ] 画布文件与工作区目录同步（`workspaceRegistry`）
- [ ] 多端协作（excalidraw 自带 collab 能力，接 WebSocket 服务即可）

## 许可证

MIT（Excalidraw 亦为 MIT）