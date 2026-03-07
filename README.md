# cowhouse (CW)

一个面向个人使用的 AI Assistant Agent 工作台。当前内置模块为 `对话`，支持多 Endpoint、多模型、流式回复、会话管理、MCP 工具接入和统一 `/v1` 代理。

## 功能概览

- `Dashboard` 首页：欢迎语、模块入口、用量统计。
- `对话` 模块：流式聊天、模型切换、会话搜索、重命名、删除、消息编辑与重新生成。
- `Endpoint` 管理：支持 OpenAI Compatible、OpenAI、Gemini、OpenRouter。
- `模型管理`：支持同步 Endpoint 模型列表，也支持手动维护。
- `MCP` 集成：支持本地 `stdio` 和远程 `sse` 工具接入。
- `统一网关`：提供 `/v1/*` OpenAI 兼容代理，便于外部工具接入。
- `本地数据存储`：默认 SQLite，支持切换 MySQL。

相关文档：

- [产品演进说明](/Users/zts1993/work/work/docs/timo_evolution_spec.md)
- [架构拆解](/Users/zts1993/work/work/docs/project.md)
- [CW 升级 spec](/Users/zts1993/work/work/docs/cw_upgrade_spec.md)

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Umi Max + React 18 |
| UI | Ant Design 5 + Pro Components |
| 后端 | Node.js + Express |
| 数据库 | SQLite / MySQL |
| AI 接口 | OpenAI SDK + OpenAI Compatible APIs |
| 样式 | Tailwind CSS + 自定义 CSS |

## 快速启动

### 前提

- Node.js >= 18
- npm >= 9

### 开发模式

开发模式为前后端分端口：

```bash
npm install
npm run dev
```

访问地址：

- 前端：`http://localhost:8000`
- 后端：`http://localhost:8080`

常用命令：

```bash
npm run stop
npm run restart
```

说明：

- 前端页面：`/dashboard`、`/chat`、`/login`
- 后端接口：`/api/*`
- OpenAI 兼容代理：`/v1/*`

### 生产模式

生产模式由 Express 托管前端静态资源并统一监听 `8000`：

```bash
npm install
npm run build
npm run start
```

或：

```bash
npm run start:prod
```

访问地址：

- `http://localhost:8000`

## 数据库配置

默认使用 SQLite，无需额外配置。

如需切换 MySQL，请先安装 `mysql2`：

```bash
npm i mysql2
```

然后配置环境变量：

```bash
DB_CLIENT=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=cowhouse
```

SQLite 可通过 `DB_PATH` 指定数据库文件位置。

## Endpoint 配置

启动后在界面中打开 `设置`，配置上游 Endpoint：

1. 添加 Endpoint
2. 填写名称、Base URL、API Key
3. 设置默认 Endpoint
4. 在模型管理中同步或维护模型列表

常见示例：

- OpenAI：`https://api.openai.com/v1`
- Gemini OpenAI Compatible：`https://generativelanguage.googleapis.com/v1beta/openai`
- OpenRouter：`https://openrouter.ai/api/v1`

## Docker 部署

```bash
docker compose up -d --build
```

默认访问：

- `http://localhost:8000`

常用命令：

```bash
docker compose logs -f
docker compose down
docker compose up -d --build
docker compose ps
```

如需调整暴露端口，修改 [docker-compose.yml](/Users/zts1993/work/work/docker-compose.yml) 的 `ports` 配置。

## 项目结构

```text
work/
├── server/
│   ├── app.js
│   ├── routes/
│   ├── middleware/
│   └── models/
├── src/
│   ├── pages/
│   │   ├── Dashboard/
│   │   ├── Chat/
│   │   └── Login/
│   ├── components/
│   ├── services/
│   └── models/
├── docs/
├── data/
└── dist/
```

## 安全说明

- 本地数据库默认位于 `data/`，且不会提交到仓库。
- API Key 存储在本地数据库中，不写入前端代码。
- 登录采用 JWT + Refresh Token。

## 测试

```bash
npm test
```

CI 模式：

```bash
npm run test:ci
```

## License

MIT
