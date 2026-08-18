# dsh-system-shutdown

侧边栏底部「关闭 DSH」按钮（与设置按钮同款排版、DSH 风格确认弹窗）。确认后 DSH Web 进程优雅退出，需要手动重新启动。

```bash
dsh plugin --profile web add /path/to/dsh-system-shutdown
```

端点：`POST /dsh-system-shutdown/action`
