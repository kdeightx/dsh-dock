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
#   7. dsh-safe-mode           (安全模式面板:插件被改坏时横幅救援入口)
#   8. dsh-safe                (安全模式脚本:体检/自动隔离/安全启动,装到 ~/.local/bin)
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
echo "==> [1/8] dsh-cost-crystal (npm)"
dsh plugin --profile "$PROFILE" add dsh-cost-crystal
# 1b. 移除 cost-crystal 右上角浮层(其折叠条已由 dsh-sidebar-cost 取代;浮层轮询
#     频繁 readSession 解压会话,是卡顿主因)。幂等,cost-crystal 升级后重装即自动重打。
bash "$HERE/dsh-sidebar-cost/patch-cost-crystal.sh" "$PROFILE" || echo "    !! 浮层 patch 失败(可稍后手动: bash $HERE/dsh-sidebar-cost/patch-cost-crystal.sh $PROFILE)"

# 2. 本地 link 插件
INSTALL_LIST=(
  "dsh-system-restart:侧边栏「重启 DSH」按钮"
  "dsh-system-shutdown:侧边栏「关闭 DSH」按钮"
  "dsh-plugin-manager:设置页插件管理器"
  "dsh-session-delete:会话删除菜单"
  "dsh-sidebar-cost:侧边栏成本卡片(需 dsh-cost-crystal)"
  "dsh-safe-mode:安全模式横幅(插件被改坏时的救援入口)"
)

STEP=2
for entry in "${INSTALL_LIST[@]}"; do
  pkg="${entry%%:*}"
  desc="${entry#*:}"
  if [ -d "$HERE/$pkg" ]; then
    echo "==> [$STEP/8] $pkg (link) — $desc"
    dsh plugin --profile "$PROFILE" add "link:$HERE/$pkg"
  else
    echo "!! 跳过 $pkg(目录不存在):$HERE/$pkg"
  fi
  STEP=$((STEP + 1))
done

# 3. dsh-safe 安全模式(独立脚本 + 透明包装器;dsh 崩了也能跑)
echo "==> [8/8] dsh-safe (安全模式: 脚本 + 透明包装器)"
if [ -f "$HERE/dsh-safe/dsh-safe.mjs" ]; then
  mkdir -p "$HOME/.local/bin"
  cp "$HERE/dsh-safe/dsh-safe.mjs" "$HOME/.local/bin/dsh-safe"
  chmod +x "$HOME/.local/bin/dsh-safe"
  echo "    ✔ 脚本已安装到 $HOME/.local/bin/dsh-safe"
  if [ -f "$HERE/dsh-safe/install-wrapper.sh" ]; then
    echo "    == 安装透明包装器(插件坏时自动进入安全模式9527,升级免疫)…"
    bash "$HERE/dsh-safe/install-wrapper.sh" || echo "    !! wrapper 安装失败/跳过(PATH 顺序等,可稍后手动: bash $HERE/dsh-safe/install-wrapper.sh)"
  fi
else
  echo "!! 跳过 dsh-safe(文件不存在):$HERE/dsh-safe/dsh-safe.mjs"
fi

echo
echo "──────────────────────────────────────────────────────────"
echo "✅ 全部安装完成!最后一步:"
echo "   1. 启动 dsh $PROFILE(建议用: dsh-safe start,自带体检+安全模式)"
echo "   2. 点击侧边栏底部「重启 DSH」按钮(或手动重启)"
echo "   3. 浏览器硬刷新(Cmd+Shift+R / Ctrl+Shift+R)"
echo "──────────────────────────────────────────────────────────"
