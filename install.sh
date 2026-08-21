#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dsh-dock 一键安装脚本
#
# 用法(任选一种):
#   本地拷贝:  bash install.sh [profile]
#   远程一条命令:
#     curl -fsSL <install.sh 的 raw URL> | \
#       DSH_DOCK_REPO=<git 仓库地址> bash
#     (脚本会自动把仓库克隆到 ~/.dsh/dock-plugins 再安装)
#
# 安装内容(按依赖顺序):
#   1. dsh-cost-crystal        (npm 包,提供 /ds-balance /ds-activity 数据路由)
#   2. dsh-system-restart      (侧边栏「重启 DSH」按钮,在线状态图标)
#   3. dsh-system-shutdown     (侧边栏「关闭 DSH」按钮,电源图标)
#   4. dsh-plugin-manager      (设置页插件管理器)
#   5. dsh-session-delete      (会话 ⋯ 菜单「删除会话」)
#   6. dsh-sidebar-cost        (侧边栏成本卡片,依赖 dsh-cost-crystal)
#
# 依赖: 目标设备需已安装 dsh CLI 且初始化过对应 profile。
# 重复运行幂等(pnpm 会跳过已安装版本)。
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROFILE="${1:-web}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v dsh >/dev/null 2>&1; then
  echo "✗ 未找到 dsh 命令,请先安装 DeepSeek Harness" >&2
  exit 1
fi

# 远程模式:脚本经 curl|bash 执行时自身不在插件目录,若设置了 DSH_DOCK_REPO 则自动克隆
if [ ! -d "$HERE/dsh-system-restart" ] && [ -n "${DSH_DOCK_REPO:-}" ]; then
  TARGET="${DSH_DOCK_DIR:-$HOME/.dsh/dock-plugins}"
  echo "==> 远程模式:克隆 $DSH_DOCK_REPO -> $TARGET"
  git clone --depth 1 "$DSH_DOCK_REPO" "$TARGET"
  cd "$TARGET"
  exec bash install.sh "$PROFILE"
fi

if [ ! -d "$HERE/dsh-system-restart" ]; then
  echo "✗ 未找到插件目录($HERE/dsh-system-restart),请检查脚本位置或设置 DSH_DOCK_REPO" >&2
  exit 1
fi

echo "==> 目标 profile: $PROFILE"
echo "==> 插件源目录: $HERE"

# 1. npm 插件(必须先装,提供数据路由)
echo "==> [1/6] dsh-cost-crystal (npm)"
dsh plugin --profile "$PROFILE" add dsh-cost-crystal

# 2. 本地 link 插件
INSTALL_LIST=(
  "dsh-system-restart:侧边栏「重启 DSH」按钮"
  "dsh-system-shutdown:侧边栏「关闭 DSH」按钮"
  "dsh-plugin-manager:设置页插件管理器"
  "dsh-session-delete:会话删除菜单"
  "dsh-sidebar-cost:侧边栏成本卡片(需 dsh-cost-crystal)"
)

STEP=2
for entry in "${INSTALL_LIST[@]}"; do
  pkg="${entry%%:*}"
  desc="${entry#*:}"
  if [ -d "$HERE/$pkg" ]; then
    echo "==> [$STEP/6] $pkg (link) — $desc"
    dsh plugin --profile "$PROFILE" add "link:$HERE/$pkg"
  else
    echo "!! 跳过 $pkg(目录不存在):$HERE/$pkg"
  fi
  STEP=$((STEP + 1))
done

echo
echo "──────────────────────────────────────────────────────────"
echo "✅ 全部安装完成!最后一步:"
echo "   1. 启动 dsh $PROFILE"
echo "   2. 点击侧边栏底部「重启 DSH」按钮(或手动重启)"
echo "   3. 浏览器硬刷新(Cmd+Shift+R / Ctrl+Shift+R)"
echo "──────────────────────────────────────────────────────────"
