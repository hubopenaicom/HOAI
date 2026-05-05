# HOAI

*HOAI（HubOpenAI）全场景 AI 服务与运营平台 · Full-scenario AI service & ops: chat & multimodal, admin, payments & risk · Self-hosted, multi-user & multi-model · Node.js full stack · Docker / PM2 · one-click build · Issues & PRs welcome.*

<div align="center">

[![GitHub stars](https://img.shields.io/github/stars/hubopenaicom/HOAI?style=social)](https://github.com/hubopenaicom/HOAI/stargazers)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![开发指南](https://img.shields.io/badge/开发指南-文档-orange.svg)](./docs/DEVELOPMENT.md)
[![功能说明](https://img.shields.io/badge/功能说明-文档-green.svg)](./docs/FEATURES.md)
[![部署指南](https://img.shields.io/badge/部署指南-文档-blue.svg)](./docs/DEPLOYMENT.md)

</div>

---

## 简介

HOAI 面向对话、多模态与后台运营等 **全场景** 需求，提供可私有化部署的 **AI 服务与运营** 能力：多用户、多模型接入、支付与风控等企业向能力均可按需启用。项目在开源 **[99AI](https://github.com/vastxie/99AI)** 基础上持续演进，适合团队在此基础上做二次开发与商业化落地。

## 仓库结构

| 目录 | 说明 |
| --- | --- |
| [`admin/`](./admin/) | 管理后台（Vue 3、[Fantastic-admin](https://github.com/fantastic-admin/basic) 体系） |
| [`chat/`](./chat/) | 用户侧对话与交互前端 |
| [`service/`](./service/) | 后端 API（NestJS），并托管构建后的静态资源 |
| [`AIWebQuickDeploy/`](./AIWebQuickDeploy/) | 一体化部署相关产物与配置 |
| [`docs/`](./docs/) | 开发说明与补充文档 |

## 核心能力

- **模型与对话**：多模型路由、可配置参数与应用预设  
- **深度思考**：支持思考链 / 全局思考模型与普通模型组合使用  
- **联网与知识**：联网搜索、知识库与文件等扩展能力（以当前分支实现为准）  
- **可视化**：基于 Mermaid 等的流程图、思维导图等智能图表能力  
- **运营与风控**：后台管理、敏感词、支付与套餐等多用户运营能力  

## 快速开始（构建）

在 **仓库根目录** 执行一键流水线（会构建 admin / chat / service，并同步到 `service/public` 与 `AIWebQuickDeploy/`）：

```bash
bash build.sh
```

或使用：

```bash
pnpm run build:all
```

更细的模块说明与开发习惯见 **[开发文档](./docs/DEVELOPMENT.md)**。部署步骤见 **[部署指南](./docs/DEPLOYMENT.md)**；功能列表见 **[功能说明](./docs/FEATURES.md)**。

## 参与贡献

- 反馈问题、建议与代码：请使用 [Issues](https://github.com/hubopenaicom/HOAI/issues) 或 Pull Request  
- 若改动涉及 `admin` / `chat` / `service` 运行时代码，提交前建议在本地跑通 `build.sh`，避免静态资源未同步导致线上 404  

## 许可证与致谢

- 本项目采用 **[Apache 2.0](LICENSE)** 许可，使用与分发时请遵守协议并保留适当署名与许可文件  
- 能力演进参考上游 **[99AI](https://github.com/vastxie/99AI)**；管理端界面脚手架来自 **[Fantastic-admin](https://github.com/fantastic-admin/basic)**（MIT），使用前请同时遵守各依赖的许可条款  

---

<div align="center">

若本项目对你有帮助，欢迎 **Star** 支持持续维护。

</div>
