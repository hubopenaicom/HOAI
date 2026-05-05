# HOAI 部署指南

本文说明基于本仓库 **`AIWebQuickDeploy`** 目录及根目录脚本的常见部署方式。实际端口、域名与密钥请以你的环境为准。

## 目录说明

进入部署包目录：

```bash
cd AIWebQuickDeploy
```

## Node.js 部署

### 1. 安装 Node.js 环境

推荐使用 [nvm](https://github.com/nvm-sh/nvm) 管理 Node.js 版本。

安装完成后，建议使用 **Node.js 18 及以上**（示例使用 22，可按团队规范调整）：

```shell
nvm install 22
nvm use 22
```

验证：

```shell
node -v
npm -v
```

### 2. 安装 PM2 与 pnpm

```shell
npm install pm2 -g
npm install -g pnpm
pm2 -v
pnpm -v
```

### 3. 数据库与环境变量

- 准备 **MySQL** 与 **Redis**，并在 `.env` 中填写连接信息与服务端口等。
- 初始化配置：

  ```shell
  cp .env.example .env
  ```

  按实际环境修改数据库、Redis、端口等项。

完成配置并首次启动后，一般由应用自动维护所需表结构（以当前版本行为为准）；请确保数据库账号具备建表权限，且 `.env` 中的连接信息正确。

### 4. 安装依赖并启动

```shell
pnpm install
pnpm start
```

查看日志（以 `package.json` 中脚本为准，常见为）：

```shell
pnpm logs
```

默认服务端口常见为 **9520**，可在环境变量中修改。对外可通过 `http://IP:端口` 访问，或在前端使用 **Nginx** 等反向代理绑定域名。

## 脚本部署（`deploy.sh`）

在 **仓库根目录** 执行：

```bash
./deploy.sh
```

脚本通常提供多种能力（以仓库内 `deploy.sh` 实际选项为准），例如：

- **Node.js 全新部署**：环境检测、配置、依赖安装与启动
- **Node.js 升级**：拉取代码、更新依赖并重启
- **Docker Compose 部署**：拉起 MySQL、Redis 与 **HOAI** 应用服务，可配置端口
- **Docker Compose 升级**：重建镜像并滚动重启

使用前请阅读脚本内注释与交互提示。

## Docker 部署

### 1. 安装 Docker 与 Compose

可参考 [Docker 官网](https://www.docker.com/) 文档，或使用官方安装脚本（需自行评估安全策略）：

```bash
curl -fsSL https://get.docker.com | bash -s docker
```

### 2. 常用命令

**后台启动：**

```shell
docker-compose up -d
```

**查看日志：**

```shell
docker-compose logs
```

**停止：**

```shell
docker-compose down
```

**重新构建并启动：**

```shell
docker-compose up -d --build
```

## 管理端与初始账号

部署完成后，请尽快修改默认密码并限制管理端访问来源。

- **管理端路径：** `https://你的域名/admin`（或对应前缀，以实际 Nginx 配置为准）
- **普通管理员（若存在且默认未启用）：** `admin`
- **超级管理员：** `super`
- **初始密码（示例）：** `123456`

生产环境务必启用强密码、二次验证（若支持）与最小权限原则。

## 与源码构建的关系

若你修改了 `admin` 或 `chat` 源码，请在仓库根目录执行 `bash build.sh`（或 `pnpm run build:all`），再按你的发布流程覆盖 `service/public` 与 `AIWebQuickDeploy` 中对应产物，避免浏览器仍加载旧前端。

更多开发向说明见 [开发文档](./DEVELOPMENT.md)。
