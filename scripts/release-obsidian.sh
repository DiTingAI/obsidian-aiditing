#!/usr/bin/env bash
#
# 把插件发布到 Obsidian 社区市场用的独立仓库。
#
# 为什么是本地脚本而不是 GitHub Actions：
# 产品主仓库托管在阿里云 codeup（私有），`.github/workflows/` 在那里不会触发。
# 仓库里那份 obsidian-plugin.yml 只有当主仓库镜像到 GitHub 时才生效，当前请用这个脚本。
#
# 用法：
#   GITHUB_TOKEN=ghp_xxx ./scripts/release-obsidian.sh            # 构建 + 发布
#   ./scripts/release-obsidian.sh --dry-run                      # 只构建校验，不碰远端
#   ./scripts/release-obsidian.sh --skip-build                   # 复用已有 main.js
#
# 前置条件（缺一不可，脚本会逐个检查并给出人话提示）：
#   1. GITHUB_TOKEN 有 DiTingAI/obsidian-aiditing 的 contents:write 权限；
#   2. 发布仓库必须是 **Public**——社区市场的客户端要匿名下载 Release 资产，
#      Private 仓库的资产下载需要认证，用户装不上（市场审核也会因此驳回）；
#   3. 本机已 npm install（脚本不替你装依赖，装错了产物也不对）。
#
set -euo pipefail

cd "$(dirname "$0")/.."

REPO="DiTingAI/obsidian-aiditing"
API="https://api.github.com/repos/${REPO}"
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
DRY_RUN=0
SKIP_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "未知参数：$arg"; exit 1 ;;
  esac
done

say() { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m错误：\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- 1. 版本 ----------
VERSION=$(node -p "require('./manifest.json').version")
say "manifest 版本：${VERSION}"

node -e "
  const v = require('./versions.json');
  if (!v['${VERSION}']) {
    console.error('versions.json 缺少 ${VERSION}：老客户端不会收到更新提示');
    process.exit(1);
  }
"

# ---------- 2. 测试与构建 ----------
if [ "$SKIP_BUILD" -eq 1 ]; then
  say "跳过构建，复用现有产物"
else
  say "单测"
  npm test
  say "构建（不压缩，审核要能读）"
  npm run build
fi

# ---------- 3. 产物校验 ----------
for f in main.js manifest.json styles.css; do
  [ -s "$f" ] || die "缺少 $f 或内容为空"
done
SIZE=$(wc -c < main.js | tr -d ' ')
say "main.js ${SIZE} 字节"
[ "$SIZE" -lt 3000000 ] || die "main.js 超过 3MB，检查是否把依赖误打进来"

# 产物里不该出现内网地址或调试开关
if grep -q "localhost\|127.0.0.1" main.js; then
  die "main.js 里出现了 localhost，检查 apiBase 默认值"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  say "dry-run 结束：产物就绪，未推送任何东西"
  exit 0
fi

# ---------- 4. 远端前置检查 ----------
# 直接 `GITHUB_TOKEN=xxx ./scripts/...` 会把 token 写进 shell 历史；
# 没设环境变量时这里就地要一次，输入不回显、不落盘，比让用户回去重开终端省事。
if [ -z "$TOKEN" ]; then
  if [ -t 0 ]; then
    printf '请输入 GitHub PAT（需要 %s 的 contents:write，输入不回显）：' "$REPO"
    read -rs TOKEN
    printf '\n'
  fi
  [ -n "$TOKEN" ] || die "缺少 GITHUB_TOKEN（需要 ${REPO} 的 contents:write 权限）"
fi

# 不带 token 探测：能拿到 200 说明仓库是公开的
if ! curl -sf "https://api.github.com/repos/${REPO}" >/dev/null; then
  die "${REPO} 不是公开仓库或不存在。社区市场要求插件仓库 Public，否则客户端下载不到 Release 资产"
fi

# ---------- 5. 推送产物 ----------
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

say "同步产物到 ${REPO}"
if ! git clone --quiet --depth 1 "https://x-access-token:${TOKEN}@github.com/${REPO}.git" "$WORK/repo" 2>/dev/null; then
  say "发布仓库是空的，初始化"
  mkdir -p "$WORK/repo"
  git -C "$WORK/repo" init -q
  git -C "$WORK/repo" remote add origin "https://x-access-token:${TOKEN}@github.com/${REPO}.git"
  git -C "$WORK/repo" checkout -q -b main
fi

# 构建产物：Release 附件从这里传，仓库根也留一份（审核打开仓库就能读，不用去翻 Release）
cp main.js manifest.json styles.css versions.json README.md LICENSE "$WORK/repo/"

# 源码：必须公开在仓库里。
# 社区目录的审核文档原话是「we need to access to the source code on GitHub」，
# 审核是自动跑的，不会来问我们要不要私有仓库授权——看不到源码这条就卡住。
# MIT 协议本来也要求能拿到源码，这里一并同步，顺手把可复现构建的材料凑齐。
mkdir -p "$WORK/repo/src" "$WORK/repo/tests" "$WORK/repo/scripts"
cp src/*.ts "$WORK/repo/src/"
cp tests/*.ts "$WORK/repo/tests/"
cp scripts/*.sh "$WORK/repo/scripts/"
cp scripts/*.ts "$WORK/repo/scripts/"
cp package.json package-lock.json esbuild.config.mjs tsconfig.json "$WORK/repo/"

# 发布仓库自己的忽略规则：只挡依赖和临时产物。
# 不能沿用 .gitignore —— 它忽略了 main.js，而这里恰恰要让 main.js 入库。
cat > "$WORK/repo/.gitignore" <<'IGNORE'
node_modules/
dist/
*.log
.DS_Store
IGNORE

git -C "$WORK/repo" config user.name "aiditing-bot"
git -C "$WORK/repo" config user.email "bot@aiditing.cn"
git -C "$WORK/repo" add -A
if git -C "$WORK/repo" diff --cached --quiet; then
  say "产物与上次一致，跳过提交"
else
  git -C "$WORK/repo" commit -q -m "release ${VERSION}"
  git -C "$WORK/repo" push -q origin HEAD:main
  say "已推送"
fi

# ---------- 6. 创建或更新 Release ----------
# tag 必须等于 manifest.version，不带 v 前缀：Obsidian 用 tag 判断「已装版本 vs 最新版本」，
# 写成 v0.1.0 会出现「有更新提示但装不上」（tags 与 manifest 对不上）。
say "创建 Release ${VERSION}"
RELEASE_JSON=$(curl -s -H "Authorization: token ${TOKEN}" "${API}/releases/tags/${VERSION}" || true)
RELEASE_ID=$(printf '%s' "$RELEASE_JSON" | python3 -c "
import json,sys
try:
    print(json.load(sys.stdin).get('id',''))
except Exception:
    print('')
")

if [ -z "$RELEASE_ID" ]; then
  BODY='{"tag_name":"'"${VERSION}"'","name":"爱谛听 '"${VERSION}"'","body":"安装见 README。插件会把你选中的音视频上传到 api.diting.cc 处理，详见 README 的隐私章节。","draft":false,"prerelease":false}'
  RELEASE_ID=$(curl -s -X POST \
    -H "Authorization: token ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$BODY" "${API}/releases" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'id' not in d:
    print('', end='')
    sys.stderr.write(str(d))
else:
    print(d['id'])
")
  [ -n "$RELEASE_ID" ] || die "创建 Release 失败（看上面的 API 返回）"
  say "Release 已创建 id=${RELEASE_ID}"
else
  say "Release 已存在 id=${RELEASE_ID}，覆盖同名附件"
  # 重复发布同一个版本时，GitHub 不允许同名附件覆盖，只能先删后传
  curl -s -H "Authorization: token ${TOKEN}" "${API}/releases/${RELEASE_ID}/assets" \
    | python3 -c "
import json,sys
for a in json.load(sys.stdin):
    if a['name'] in ('main.js','manifest.json','styles.css'):
        print(a['id'], a['name'])
" | while read -r AID ANAME; do
      [ -n "${AID:-}" ] || continue
      curl -s -X DELETE -H "Authorization: token ${TOKEN}" "${API}/releases/assets/${AID}" >/dev/null
      say "已删除旧附件 ${ANAME}"
    done
fi

upload() {
  local file="$1" ctype="$2"
  curl -s --fail -X POST \
    -H "Authorization: token ${TOKEN}" \
    -H "Content-Type: ${ctype}" \
    --data-binary "@${file}" \
    "https://uploads.github.com/repos/${REPO}/releases/${RELEASE_ID}/assets?name=${file}" >/dev/null \
    || die "上传 ${file} 失败"
  say "已上传 ${file}"
}

upload main.js "application/javascript"
upload manifest.json "application/json"
upload styles.css "text/css"

cat <<EOF

发布完成：
  https://github.com/${REPO}/releases/tag/${VERSION}

接下来（只需做一次，以后发新版本不用再提交）：
  1. 用 **Obsidian 账号**登录 https://community.obsidian.md（不是 GitHub 账号）
  2. 在个人资料里关联 GitHub 账号——目录靠它验证你是这个仓库的 owner
  3. 点「Add your plugin」，填仓库地址 ${REPO}

  目录会读取默认分支 HEAD 的 manifest.json 并自动跑审核，结果直接显示在页面上；
  每条不通过的项目会给出具体原因，改完要发一个**递增版本**的新 Release，再回来重新检查。

  注意：向 obsidianmd/obsidian-releases 提 PR 的老流程已经关闭（该仓库已禁用 PR），
  community-plugins.json 现在由目录系统自己维护，不要再去改那个文件。

EOF
