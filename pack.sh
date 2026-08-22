#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dsh-dock 打包脚本:把自研插件源码+安装脚本打成单个 tarball,便于拷贝到其它设备。
#
# 用法:
#   bash pack.sh                 # 生成 dsh-dock-bundle-<日期>.tar.gz
#
# 目标设备上解压后一条命令安装:
#   tar xzf dsh-dock-bundle-*.tar.gz && bash dsh-dock/install.sh
#
# 注: 第三方插件(plugins.third-party.txt 清单, 如 dshmarket)从 npm registry
# 安装, 目标设备需要网络; 离线时 install.sh 会跳过(或先注释掉清单对应行)。
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="dsh-dock-bundle-$(date +%Y%m%d).tar.gz"

cd "$HERE"

# 自研插件目录(排除 node_modules / 日志 / 临时文件)
PLUGINS=(
  dsh-system-restart
  dsh-system-shutdown
  dsh-session-delete
  dsh-sidebar-cost
  dsh-safe-mode
  dsh-whiteboard
  dsh-safe
)

ARGS=(INSTALL.md install.sh pack.sh plugins.third-party.txt)
for pkg in "${PLUGINS[@]}"; do
  if [ -d "$pkg" ]; then
    ARGS+=("$pkg")
  else
    echo "!! 跳过不存在的插件目录: $pkg" >&2
  fi
done

echo "==> 打包中: ${ARGS[*]}"
tar --exclude='node_modules' --exclude='*.log' --exclude='.DS_Store' \
  -czf "$OUT" "${ARGS[@]}"

echo "✅ 已生成: $HERE/$OUT"
echo
echo "拷贝到目标设备后安装(二选一):"
echo "  人工/脚本:  tar xzf $OUT && bash dsh-dock/install.sh"
echo "  AI 安装:    解压后把 INSTALL.md 交给目标设备的 AI 助手按文档执行"
