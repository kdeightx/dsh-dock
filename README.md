# dsh-session-delete

在 DeepSeek Harness Web 侧栏的会话 ⋯ 菜单中，向「归档会话」项下方注入「删除会话」：

- 红色菜单项 + 垃圾桶图标，跟随菜单语言（中文/英文）
- 点击后先按标题解析唯一会话，再弹确认框（不可恢复警告）
- 确认后物理删除会话日志目录、清理 workspace 归属记录，并刷新页面
- 正在运行的会话拒绝删除

## 安装

```bash
dsh plugin --profile web add /path/to/dsh-session-delete
```

重启 DSH Web 并硬刷新浏览器。

## 端点

- `POST /dsh-session-delete/resolve` `{ title }` → 唯一匹配的 sessionId
- `POST /dsh-session-delete/delete` `{ sessionId }` → 永久删除
