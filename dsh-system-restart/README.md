# dsh-system-restart

侧边栏底部「重启 DSH」按钮（与设置按钮同款排版、DSH 风格确认弹窗）。确认后 Host 端以当前命令行参数拉起新进程并退出旧进程，实现热重启；会话数据已持久化，不会丢失。

```bash
dsh plugin --profile web add /path/to/dsh-system-restart
```

端点：`POST /dsh-system-restart/action`
