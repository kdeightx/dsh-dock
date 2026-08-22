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
#   A. 自研本地插件(link 安装, 源码在本仓库): 零 npm 运行时依赖
#      1. dsh-system-restart    (侧边栏「重启 DSH」按钮,在线状态图标)
#      2. dsh-system-shutdown   (侧边栏「关闭 DSH」按钮,电源图标)
#      3. dsh-session-delete    (会话 ⋯ 菜单「删除会话」)
#      4. dsh-sidebar-cost      (侧边栏成本卡片:余额/波峰/近24h/预测,自研数据路由)
#      5. dsh-safe-mode         (安全模式面板:插件被改坏时便签救援入口)
#      6. dsh-whiteboard        (右侧全屏白板:Excalidraw 延迟加载,画布持久化)
#   B. 第三方/常用插件(来自 npm registry, 清单 plugins.third-party.txt):
#      @michengai/dsh-skills-manager   (DSH 技能管理器: 本地/共享 Agent skills)
#      @nanmicoder/dsh-agent-teams     (AgentTeams: 多代理团队协作 + 树状监视器)
#      dsh-context                     (上下文仪表盘: 组成/演变/事件 + /context 命令)
#      dsh-pocket                      (DSH 口袋: 手机扫码同步访问电脑上的 DSH)
#      dshmarket                       (DSH 社区插件市场: 浏览/搜索/一键安装)
#   C. dsh-safe 安全模式脚本(独立于 dsh, 装到 ~/.local/bin)
#
# 依赖: 目标设备需已安装 dsh CLI 且初始化过对应 profile; 第三方插件需要网络。
# 重复运行幂等(pnpm 会跳过已安装版本)。
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROFILE="${1:-web}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_MANIFEST="$HERE/plugins.third-party.txt"

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

# ---- A. 自研本地 link 插件 --------------------------------------------------
LOCAL_LIST=(
  "dsh-system-restart:侧边栏「重启 DSH」按钮"
  "dsh-system-shutdown:侧边栏「关闭 DSH」按钮"
  "dsh-session-delete:会话删除菜单"
  "dsh-sidebar-cost:侧边栏成本卡片(余额/波峰/近24h/预测,自研数据路由)"
  "dsh-safe-mode:安全模式便签(插件被改坏时的救援入口)"
  "dsh-whiteboard:右侧全屏白板(Excalidraw 延迟加载)"
)

# ---- B. 第三方/常用插件清单(plugins.third-party.txt) ------------------------
EXT_LIST=()
if [ -f "$EXT_MANIFEST" ]; then
  while IFS= read -r line; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    pkg="${line%%;*}"
    desc="${line#*;}"
    [ "$desc" = "$pkg" ] && desc=""
    EXT_LIST+=("$pkg|$desc")
  done < "$EXT_MANIFEST"
else
  echo "!! 未找到第三方插件清单: $EXT_MANIFEST(跳过第三方安装)"
fi

TOTAL=$(( ${#LOCAL_LIST[@]} + ${#EXT_LIST[@]} + 1 ))
STEP=1

for entry in "${LOCAL_LIST[@]}"; do
  pkg="${entry%%:*}"
  desc="${entry#*:}"
  if [ -d "$HERE/$pkg" ]; then
    echo "==> [$STEP/$TOTAL] $pkg (link) — $desc"
    dsh plugin --profile "$PROFILE" add "link:$HERE/$pkg"
  else
    echo "!! 跳过 $pkg(目录不存在):$HERE/$pkg"
  fi
  STEP=$((STEP + 1))
done

# ---- B. 第三方插件(需要网络, 增量安装) -------------------------------------
for entry in "${EXT_LIST[@]}"; do
  pkg="${entry%%|*}"
  desc="${entry#*|}"
  echo "==> [$STEP/$TOTAL] $pkg (npm) — $desc"
  dsh plugin --profile "$PROFILE" add "$pkg"
  STEP=$((STEP + 1))
done

# ---- C. dsh-safe 安全模式(独立脚本 + 透明包装器; dsh 崩了也能跑) ------------
echo "==> [$STEP/$TOTAL] dsh-safe (安全模式: 脚本 + 透明包装器)"
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
echo "   4. 设置 → 插件市场(dshmarket)即可浏览/搜索/一键安装社区插件"
echo "──────────────────────────────────────────────────────────"
