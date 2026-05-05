# HOAI 开发文档

## 项目概述

**HOAI**（**HubOpenAI**）是一套全场景 AI 服务与运营系统：用户侧对话（`chat`）、管理后台（`admin`）与后端 API（`service`）分层协作。本文档帮助开发者快速理解仓库结构与日常开发流程。

## 核心模块

### 1. 用户对话端（`chat/`）

- **技术栈：** Vue 3、Vite 等（以仓库内 `package.json` 为准）
- **职责：** 对话界面、会话交互、与后端 API 对接
- **说明：** 具体路由与能力以当前分支实现为准

### 2. 管理后台（`admin/`）

- **技术栈：** [Fantastic-admin](https://github.com/fantastic-admin/basic) 体系（Vue 3、Vite、Element Plus 等）
- **典型能力：**
  - 管理员与权限
  - 用户、套餐、积分与订单等运营数据
  - 模型与渠道、敏感词与风控相关配置

### 3. 后端服务（`service/`）

- **技术栈：** NestJS
- **默认开发地址：** `http://localhost:9520`（可在环境变量中调整）
- **职责：**
  - 对外 RESTful / 业务 API
  - 数据库与缓存等持久化与中间件对接
  - 生产环境下通常同时托管构建后的 `public/admin`、`public/chat` 静态资源

### 4. 一键部署包（`AIWebQuickDeploy/`）

- 面向独立部署场景的目录与脚本；与根目录 `build.sh` 产物配合使用，详见 [部署指南](./DEPLOYMENT.md)。

## 依赖与工具

- **包管理：** 仓库内推荐使用 **pnpm**（根目录与各子项目以各自说明为准）
- **Node.js：** 建议使用 LTS 或与团队约定版本（部署文档中常见为 18+）

## 构建与联调

### 全量构建（推荐）

在 **仓库根目录** 执行：

```bash
bash build.sh
```

或使用：

```bash
pnpm run build:all
```

脚本会构建 `admin`、`chat`、`service`，并将前端产物同步到 `service/public` 与 `AIWebQuickDeploy/`，避免仅改前端却未更新线上静态资源。

### 单模块开发

- 各子目录内通常提供 `pnpm dev` 或等价脚本；具体命令见对应 `package.json` 的 `scripts` 字段。

## 开发建议

1. 遵循仓库内既有的代码风格与提交约定（若有 ESLint / Prettier，以配置为准）
2. 涉及接口或数据结构变更时，同步更新调用方与文档
3. 提交前在本地完成必要的手动验证；有测试脚本时尽量执行
4. 文档与注释保持与行为一致，避免「文档与代码两张皮」

## 问题反馈与贡献

- **Issue：** [github.com/hubopenaicom/HOAI/issues](https://github.com/hubopenaicom/HOAI/issues)
- **代码：** 欢迎 Pull Request；请说明变更范围与验证方式

我们欢迎功能改进、缺陷修复、文档与性能优化等贡献，请尽量保持单次 PR 目标单一、便于评审。
