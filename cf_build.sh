#!/usr/bin/env bash
# ============================================================================
# cf_build.sh — Cloudflare Pages 自动构建入口
#
# 在 Cloudflare Pages 的构建环境中执行：
#   1. 检查部署环境（Node.js >= 20、npm）；
#   2. 确认游戏目录（MRP_GAME_DIR，默认仓库内 ./mrpfile）与资源目录
#      （MRP_RESOURCE_DIR，默认仓库内 ./assets）可用，允许用环境变量覆盖；
#   3. 调用 ./build.sh 安装依赖并生成静态产物 dist/。
#
# Cloudflare Pages 配置（项目 → Settings → Builds & deployments）：
#   - Framework preset : None（无框架）
#   - Build command    : bash cf_build.sh
#   - Build output     : dist
#   - Environment variables（可选）:
#       NODE_VERSION=22            # Node >= 20 即可
#       MRP_GAME_DIR=./mrpfile     # 游戏目录（仓库内提交的 MRP）
#       MRP_RESOURCE_DIR=./assets  # mythroad 系统/资源目录
# 注意：静态产物中不再内嵌“在线商店”远程数据；在线商店列表运行时从
# https://mrpstore.gddhy.net 拉取并缓存到浏览器。
# ============================================================================
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

log() { printf '[cf-build] %s\n' "$*"; }
die() { printf '[cf-build] 错误：%s\n' "$*" >&2; exit 1; }

# ---------- 1. Node.js / npm ----------
command -v node >/dev/null || die '未找到 node。请在 Cloudflare Pages 环境变量中设置 NODE_VERSION（如 22）后重试。'
if ! node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)'; then
  die "Node 版本过低（$(node -v 2>/dev/null || echo unknown)），需要 >= 20；请在 Cloudflare Pages 环境变量中设置 NODE_VERSION（如 22）。"
fi
command -v npm >/dev/null || die '未找到 npm。'

# ---------- 2. 游戏 / 资源目录 ----------
# MRP_GAME_DIR：来自 Pages 环境变量，或仓库自带的 ./mrpfile（build.sh 同款默认）
if [[ -n "${MRP_GAME_DIR:-}" ]]; then
  [[ -d "$MRP_GAME_DIR" ]] || die "环境变量 MRP_GAME_DIR 指向的目录不存在：$MRP_GAME_DIR"
else
  export MRP_GAME_DIR=./mrpfile
  [[ -d "$MRP_GAME_DIR" ]] || die '仓库缺少 ./mrpfile（精选游戏目录）。请将 MRP 游戏提交进仓库，或在 Pages 环境变量设置 MRP_GAME_DIR。'
fi
# MRP_RESOURCE_DIR：来自 Pages 环境变量，或仓库自带的 ./assets
if [[ -n "${MRP_RESOURCE_DIR:-}" ]]; then
  [[ -d "$MRP_RESOURCE_DIR" ]] || die "环境变量 MRP_RESOURCE_DIR 指向的目录不存在：$MRP_RESOURCE_DIR"
else
  export MRP_RESOURCE_DIR=./assets
  [[ -d "$MRP_RESOURCE_DIR" ]] || die '仓库缺少 ./assets（系统资源目录）。请将资源提交进仓库，或在 Pages 环境变量设置 MRP_RESOURCE_DIR。'
fi

log "构建环境：node $(node -v 2>/dev/null || echo '?'), npm $(npm -v 2>/dev/null || echo '?')"
log "游戏目录：$MRP_GAME_DIR"
log "资源目录：$MRP_RESOURCE_DIR"

# ---------- 3. 安装依赖并生成静态产物（build.sh 内含 npm ci / 清单生成 / 类型检查 / 构建） ----------
log '开始构建：bash ./build.sh'
chmod +x ./build.sh
exec ./build.sh
