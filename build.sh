#!/bin/bash
#
# HOAI 一键完整发布流水线（修改 admin / chat / service 后请始终执行本脚本）
# - 编译：admin（Fantastic-admin v6 apps/core）、chat、service（Nest）
# - 复制：构建产物 -> service/public（Nest 同进程托管 SPA，必填）
# - 复制：构建产物 -> AIWebQuickDeploy（独立部署包）
#
# 用法：在 HOAI 仓库根目录执行  bash build.sh  或  pnpm run build:all
#
set -e


# 管理端为 Fantastic-admin v6 monorepo，可构建应用为 apps/core（@fantastic-admin/core）
cd admin/
pnpm install
pnpm --filter @fantastic-admin/core run build
cd ..

cd chat/
pnpm install
pnpm build
cd ..

cd service/
pnpm install
pnpm build
cd ..

# Nest 从 service/public 托管前后端静态文件（缺失会导致「SPA入口文件不存在」、后台无法加载）
mkdir -p service/public/file
rm -rf service/public/admin service/public/chat
mkdir -p service/public/admin service/public/chat
cp -a admin/apps/core/dist/. service/public/admin/
cp -a chat/dist/. service/public/chat/

rm -rf ./AIWebQuickDeploy/dist/* ./AIWebQuickDeploy/public/admin/* ./AIWebQuickDeploy/public/chat/*
mkdir -p ./AIWebQuickDeploy/dist ./AIWebQuickDeploy/public/admin ./AIWebQuickDeploy/public/chat

cp service/pm2.conf.json ./AIWebQuickDeploy/pm2.conf.json
cp service/package.json ./AIWebQuickDeploy/package.json

cp service/.env.example ./AIWebQuickDeploy/.env.example
cp service/.env.docker ./AIWebQuickDeploy/.env.docker
cp service/Dockerfile ./AIWebQuickDeploy/Dockerfile
cp service/docker-compose.yml ./AIWebQuickDeploy/docker-compose.yml
cp service/.dockerignore ./AIWebQuickDeploy/.dockerignore

cp -a service/dist/* ./AIWebQuickDeploy/dist
cp -r admin/apps/core/dist/* ./AIWebQuickDeploy/public/admin
cp -r chat/dist/* ./AIWebQuickDeploy/public/chat

echo "打包完成"