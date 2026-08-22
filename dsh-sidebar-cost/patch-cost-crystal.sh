#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dsh-cost-crystal 浮层移除补丁
#
# 背景: dsh-sidebar-cost 的侧边栏折叠条已取代 cost-crystal 的右上角浮层。
# 浮层即便被 CSS 隐藏,其 setInterval 轮询仍每 1.5s 请求 /ds-activity,
# 每次缓存过期就 readSession 解压会话文件,与「发消息写会话」抢 CPU/IO ——
# 是 dsh 卡顿的主因。故从源头 patch: 让 cost-crystal 不再注入浮层脚本。
#
# 幂等: 已 patch 则跳过。cost-crystal 升级(pnpm 重装会覆盖 node_modules)后
#       重跑本脚本即可。
#
# 用法:
#   bash patch-cost-crystal.sh [profile]    默认 web
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROFILE="${1:-web}"
DST="$HOME/.dsh/profiles/$PROFILE/node_modules/dsh-cost-crystal/lib/index.js"
MAGIC="不注入右上角浮层"

if [ ! -f "$DST" ]; then
  echo "!! 未找到 $DST —— 请先安装 dsh-cost-crystal (dsh plugin --profile $PROFILE add dsh-cost-crystal)" >&2
  exit 1
fi

if grep -q "$MAGIC" "$DST"; then
  echo "✔ 已 patch(跳过): $DST"
  exit 0
fi

cp "$DST" "$DST.bak-$(date +%s)"
echo "==> 备份: $DST.bak-$(date +%s)"

# 精准替换浮层注入行为空操作(替换串含中文注释,用 python 避免 bash 引号问题)
python3 - "$DST" "$MAGIC" <<'PY'
import sys
p, magic = sys.argv[1], sys.argv[2]
t = open(p).read()
target = 'const disposeCardTap = webServer.tapIndex((html) => (0, types_1.injectScript)(html, scripts_1.CARD_SCRIPT));'
repl = 'const disposeCardTap = () => () => {}; // dsh-sidebar-cost patch: %s(折叠条已取代)' % magic
if target not in t:
    print('✗ 未找到浮层注入行,可能 cost-crystal 版本已变,请手动处理', file=sys.stderr)
    sys.exit(1)
open(p, 'w').write(t.replace(target, repl))
PY

echo "✔ 已移除 cost-crystal 浮层注入(数据路由 /ds-balance /ds-activity 保留)"
