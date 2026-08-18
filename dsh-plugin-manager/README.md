# dsh-plugin-manager

插件管理器：设置页「自定义插件」tab，列出所有已安装的自定义插件，每个插件带独立开关（启用/禁用即时生效、状态持久化）。管理器自身不能被禁用（防止失去恢复入口）。

```bash
dsh plugin --profile web add /path/to/dsh-plugin-manager
```

端点：`GET /dsh-plugin-manager/plugins`、`POST /dsh-plugin-manager/plugins/toggle`
