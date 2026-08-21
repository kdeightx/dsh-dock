#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dsh-dock 打包脚本:把插件源码打成单个 tarball,便于拷贝到其它设备。
#
# 用法:
#   bash pack.sh                 # 生成 dsh-dock-bundle-<日期>.tar.gz
#
# 目标设备上解压后一条命令安装:
#   tar xzf dsh-dock-bundle-*.tar.gz && bash dsh-dock/install.sh
#
# 若目标设备无法访问 npm registry(离线),可先把 dsh-cost-crystal 的
# tarball 一并放入同目录,install.sh 会优先从本地安装:
#   npm pack dsh-cost-crystal    # 生成 dsh-cost-crystal-*.tgz
#   tar xzf dsh-dock-bundle-*.tar.gz -C ~/ && \
#     cd ~/dsh-dock && npm pack dsh-cost-crystal && bash install.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="dsh-dock-bundle-$(date +%Y%m%d).tar.gz"

cd "$HERE"

# 插件目录(排除 node_modules / 日志 / 临时文件)
PLUGINS=(
  dsh-system-restart
  dsh-system-shutdown
  dsh-plugin-manager
  dsh-session-delete
  dsh-sidebar-cost
  dsh-safe-mode
  dsh-safe
)

ARGS=(INSTALL.md install.sh pack.sh)
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
