#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dsh 透明包装器安装脚本（劫持版 —— 每条启动路径都体检）
#
# 【为什么是"劫持式"】
# dsh 的启动有三种路径: ① 容器/服务监督器(绝对路径 node <bin>/dsh web)
# ② 用户 shell 敲 `dsh`(PATH 解析) ③ 「重启 DSH」按钮(dsh-system-restart)。
# 包装器若只装在 ~/.local/bin(PATH 层),监督器用绝对路径启动时会绕过体检。
# 本脚本直接把包装器装到「真 dsh 所在全局 bin 路径」,把真 dsh 改名为 dsh.real:
#   任何启动方式 → <bin>/dsh(=包装器) → 前置体检 → 健康: 3080 / 有坏插件: 9527
#   → 转交真 dsh(<bin>/dsh.real)。
#
# 【升级免疫】
# npm 升级 @deepseek-ai/dsh 时,bin/dsh 若是包生成的符号链接,升级可能把它换回
# 原样(包装器被覆盖)。此时重跑本脚本即可重新劫持(升级不破坏任何数据)。
#
# 用法:
#   bash install-wrapper.sh            安装/迁移(幂等,已装则提示)
#   bash install-wrapper.sh --force    覆盖重装(存在 dsh.real 会覆盖)
#   bash install-wrapper.sh uninstall  卸载(还原真 dsh,包装器清除)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKER="dsh-transparent-wrapper"

is_wrapper() { [ -f "$1" ] && grep -q "$MARKER" "$1" 2>/dev/null; }
have() { command -v "$1" >/dev/null 2>&1; }

# 常见真实 dsh 候选(用于 PATH 之外兜底;跳过包装器)
COMMON_CANDS=(
  "$HOME/.npm-global/bin/dsh"
  /usr/local/lib/nodejs/node-v22.16.0-linux-x64/bin/dsh
)

# ── 定位 dsh: 找「真 dsh」(跳过包装器),给安装用 ────────────────────────────────
find_real() {
  local c=""
  local p=""
  if have dsh; then
    c="$(command -v dsh)"
    if [ -e "$c" ] && ! is_wrapper "$c"; then echo "$c"; return 0; fi
  fi
  local IFS_SAVE="$IFS"
  IFS=':' read -r -a PITS <<< "${PATH:-}" || true
  IFS="$IFS_SAVE"
  for p in "${PITS[@]:-}"; do
    [ -n "$p" ] && [ -e "$p/dsh" ] && ! is_wrapper "$p/dsh" && { echo "$p/dsh"; return 0; }
  done
  if have npm; then
    c="$(npm prefix -g 2>/dev/null || true)/bin/dsh"
    if [ -n "$c" ] && [ -e "$c" ] && ! is_wrapper "$c"; then echo "$c"; return 0; fi
  fi
  for c in "${COMMON_CANDS[@]}"; do
    if [ -e "$c" ] && ! is_wrapper "$c"; then echo "$c"; return 0; fi
  done
  return 1
}

# ── 定位 dsh: 任意命中(含包装器),给卸载/已装判断用 ─────────────────────────────
find_any() {
  local c=""
  if have dsh; then
    c="$(command -v dsh)"
    if [ -e "$c" ]; then echo "$c"; return 0; fi
  fi
  if have npm; then
    c="$(npm prefix -g 2>/dev/null || true)/bin/dsh"
    if [ -e "$c" ]; then echo "$c"; return 0; fi
  fi
  for c in "${COMMON_CANDS[@]}"; do
    if [ -e "$c" ]; then echo "$c"; return 0; fi
  done
  return 1
}

# ── 卸载 ─────────────────────────────────────────────────────────────────────
uninstall() {
  local restored=0
  local any=""
  if find_any >/dev/null 2>&1; then any="$(find_any)"; fi
  if [ -n "$any" ] && is_wrapper "$any" && [ -e "$any.real" ]; then
    rm -f "$any" "$(dirname "$any")/dsh-safe-core.mjs"
    mv "$any.real" "$any"
    echo "✔ 已还原真 dsh: $any"
    restored=1
  fi
  # 旧 PATH 层包装器(如残留)
  local legacy="$HOME/.local/bin/dsh"
  if is_wrapper "$legacy"; then
    rm -f "$legacy" "$HOME/.local/bin/dsh-safe-core.mjs"
    echo "✔ 已清理旧 PATH 层包装器: $legacy"
    restored=1
  fi
  if [ "$restored" = "1" ]; then
    echo "✔ 卸载完成"
  else
    echo "✗ 未检测到包装器(或真 dsh 不在预期位置)" >&2
    exit 1
  fi
}

if [ "${1:-}" = "uninstall" ]; then
  uninstall
  exit 0
fi

FORCE=0
if [ "${1:-}" = "--force" ]; then FORCE=1; fi

# ── 定位真 dsh ────────────────────────────────────────────────────────────────
if ! REAL="$(find_real)"; then
  echo "✗ 找不到真 dsh(请确认已安装 @deepseek-ai/dsh 且 command -v dsh 可见)" >&2
  exit 1
fi
BIN_DIR="$(dirname "$REAL")"
CORE_SRC="$HERE/dsh-safe.mjs"

echo "==> 真 dsh 路径: $REAL"
echo "==> 插件目录:   $BIN_DIR"

# 已劫持则提示(顺手清理旧 PATH 层包装器)
if is_wrapper "$REAL"; then
  if [ "$FORCE" = "0" ]; then
    echo "✔ 包装器已安装(劫持式): $REAL"
    echo "  真 dsh: $REAL.real"
    echo "  每一条启动路径都会先体检(监督器 / shell / 重启按钮)。"
    echo "  卸载: bash $HERE/install-wrapper.sh uninstall"
    if is_wrapper "$HOME/.local/bin/dsh"; then
      rm -f "$HOME/.local/bin/dsh" "$HOME/.local/bin/dsh-safe-core.mjs"
      echo "  (已清理旧 PATH 层包装器 ~/.local/bin/dsh,避免双重包装)"
    fi
    exit 0
  fi
fi

# ── 劫持安装 ─────────────────────────────────────────────────────────────────
rm -f "$REAL.real"
mv "$REAL" "$REAL.real"
cp "$CORE_SRC" "$BIN_DIR/dsh-safe-core.mjs"
sed "s|__DSH_REAL_BIN__|$REAL.real|g" "$HERE/dsh-wrapper.mjs" > "$REAL"
chmod +x "$REAL"

# 清理旧 PATH 层包装器(若存在)
if is_wrapper "$HOME/.local/bin/dsh"; then
  rm -f "$HOME/.local/bin/dsh" "$HOME/.local/bin/dsh-safe-core.mjs"
  echo "==> 已清理旧 PATH 层包装器 ~/.local/bin/dsh"
fi

echo
echo "✔ 包装器已安装(劫持式): $REAL"
echo "  真 dsh:                $REAL.real"
echo "  覆盖: 监督器启动 / shell 敲 dsh / 重启按钮 ⇒ 全部先体检"
echo
echo "验证:"
echo "  dsh --version          # 应正常输出版本(透传)"
echo "  ls -l $BIN_DIR/dsh*    # 应看到: dsh(包装器) + dsh.real(真 dsh)"
echo
echo "升级提示: npm 升级 @deepseek-ai/dsh 后如 bin/dsh 被换回原样,重跑本脚本重新劫持。"
echo "卸载: bash $HERE/install-wrapper.sh uninstall"
