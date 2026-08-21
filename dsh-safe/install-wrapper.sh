#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dsh 透明包装器安装脚本 (插入点①, 升级免疫版)
#
# 原理: 包装器装在 ~/.local/bin/dsh(用户目录, npm 永远不碰),写死调用真 dsh
#       (~/.npm-global/bin/dsh)。用户 PATH 里 ~/.local/bin 排在 npm-global 之前,
#       所以敲 `dsh` 走包装器;npm 升级 @deepseek-ai/dsh 只更新真 dsh,包装器
#       不受影响 —— 升级免疫。
#
# 覆盖路径: 首次启动 / 手动重启 / 点重启按钮(dsh-system-restart 会拉起
#           当前 bin 路径 = 包装器)。
#
# 用法:
#   bash install-wrapper.sh            安装/迁移(幂等,已装则提示)
#   bash install-wrapper.sh --force    覆盖重装
#   bash install-wrapper.sh uninstall  卸载(删除包装器,不影响真 dsh)
#
# 环境变量:
#   DSH_WRAPPER_DIR   包装器安装目录(默认 ~/.local/bin)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKER="dsh-transparent-wrapper"
WRAP_DIR="${DSH_WRAPPER_DIR:-$HOME/.local/bin}"
NPM_BIN_DIR="$HOME/.npm-global/bin"

is_wrapper() { [ -f "$1" ] && grep -q "$MARKER" "$1" 2>/dev/null; }

# ── 卸载 ─────────────────────────────────────────────────────────────────────
uninstall() {
  local removed=0
  # 新方案位置
  if is_wrapper "$WRAP_DIR/dsh"; then
    rm -f "$WRAP_DIR/dsh" "$WRAP_DIR/dsh-safe-core.mjs"
    echo "✔ 已删除包装器: $WRAP_DIR/dsh"
    removed=1
  fi
  # 旧劫持式位置(如有残留)
  if is_wrapper "$NPM_BIN_DIR/dsh" && [ -e "$NPM_BIN_DIR/dsh.real" ]; then
    rm -f "$NPM_BIN_DIR/dsh" "$NPM_BIN_DIR/dsh-safe-core.mjs"
    mv "$NPM_BIN_DIR/dsh.real" "$NPM_BIN_DIR/dsh"
    echo "✔ 已还原真 dsh: $NPM_BIN_DIR/dsh (旧劫持式已清理)"
    removed=1
  fi
  if [ "$removed" = "1" ]; then
    echo "✔ 卸载完成,真 dsh 不受影响"
  else
    echo "✗ 未检测到已安装的包装器"
    exit 1
  fi
}

if [ "${1:-}" = "uninstall" ]; then
  uninstall
  exit 0
fi

FORCE=0
if [ "${1:-}" = "--force" ]; then FORCE=1; fi

# ── 自动迁移: 旧劫持式(在 npm bin 里) → 先卸载 ─────────────────────────────
if is_wrapper "$NPM_BIN_DIR/dsh"; then
  echo "==> 检测到旧劫持式安装,自动迁移…"
  uninstall
fi

# ── PATH 检查 ────────────────────────────────────────────────────────────────
PATH_OK=0
if [ -n "${PATH:-}" ]; then
  # ~/.local/bin 在 PATH 中,且出现在 ~/.npm-global/bin 之前(或 npm-global 不在 PATH)
  local_pos="$(printf '%s\n' "$PATH" | tr ':' '\n' | grep -nx "$WRAP_DIR" | head -1 | cut -d: -f1 || true)"
  npm_pos="$(printf '%s\n' "$PATH" | tr ':' '\n' | grep -nx "$NPM_BIN_DIR" | head -1 | cut -d: -f1 || true)"
  if [ -n "$local_pos" ] && { [ -z "$npm_pos" ] || [ "$local_pos" -lt "$npm_pos" ]; }; then
    PATH_OK=1
  fi
fi

if [ "$PATH_OK" = "0" ]; then
  echo "⚠ PATH 顺序不满足: 需要 $WRAP_DIR 排在 $NPM_BIN_DIR 之前(现在敲 dsh 会命中真 dsh)。"
  echo "  请在你的 shell 配置(~/.zshrc / ~/.bashrc)中加入并重新加载:"
  echo "    export PATH=\"$WRAP_DIR:\$PATH\""
  echo "  然后重跑本脚本。"
  exit 1
fi

# 已装则提示(除非 --force)
if [ "$FORCE" = "0" ] && is_wrapper "$WRAP_DIR/dsh"; then
  echo "✔ 包装器已安装: $WRAP_DIR/dsh"
  echo "  真 dsh: $(command -v dsh 2>/dev/null || echo "$NPM_BIN_DIR/dsh")"
  echo "  升级 wrapper 请加 --force;卸载: bash $HERE/install-wrapper.sh uninstall"
  exit 0
fi

# ── 定位真 dsh ───────────────────────────────────────────────────────────────
REAL_DETECTED="$(command -v dsh 2>/dev/null || true)"
if [ -z "$REAL_DETECTED" ] || is_wrapper "$REAL_DETECTED"; then
  REAL_DETECTED="$NPM_BIN_DIR/dsh"
fi
if [ ! -e "$REAL_DETECTED" ]; then
  echo "✗ 找不到真 dsh(已检查 $REAL_DETECTED)" >&2
  exit 1
fi

mkdir -p "$WRAP_DIR"
echo "==> 真 dsh:     $REAL_DETECTED"
echo "==> 安装目录:   $WRAP_DIR"

# 复制 dsh-safe 核心(供包装器 import)
cp "$HERE/dsh-safe.mjs" "$WRAP_DIR/dsh-safe-core.mjs"

# 生成包装器(替换真 dsh 路径占位符)
sed "s|__DSH_REAL_BIN__|$REAL_DETECTED|g" "$HERE/dsh-wrapper.mjs" > "$WRAP_DIR/dsh"
chmod +x "$WRAP_DIR/dsh"

echo
echo "✔ 包装器已安装: $WRAP_DIR/dsh"
echo
echo "验证:"
echo "  which dsh          # 应显示 $WRAP_DIR/dsh"
echo "  dsh --version      # 应正常输出版本(透传)"
echo "  dsh web            # 插件坏时自动进入安全模式(9527);健康回 3080"
echo
echo "卸载: bash $HERE/install-wrapper.sh uninstall"
echo "✅ 升级免疫: npm 升级 @deepseek-ai/dsh 不影响本包装器(它在用户目录,写死调用真 dsh)"
