# MalouChat

[在线体验 Demo](https://web-production-553de.up.railway.app/)

一个可自部署的全栈 **AI Chat / Chatbot / 对话机器人 / 智能助手**。MalouChat 不只是基础聊天界面，还集成了流式对话、深度思考、联网搜索、图片理解与生成、文件解析、RAG 知识库、长期记忆、语音输入和工具调用等能力。

项目采用 React 19 + Express + Prisma + PostgreSQL 构建，适合用来学习或二次开发个人 AI 助手、企业知识库问答、智能客服和 Agent 应用。

## 功能亮点

- **流式 AI 对话**：支持 SSE 流式输出、停止生成、断流恢复、编辑重发和重新生成。
- **多模型管理**：管理员可维护对话、视觉、语音、Embedding 和文生图模型，用户可选择偏好模型。
- **多模态能力**：上传图片后可让 AI 理解图片内容，也支持通过文字生成图片。
- **文件与 RAG**：支持文本、PDF、DOCX、XLSX 等文件解析、向量化和语义检索。
- **知识库问答**：支持个人及团队知识库、成员邀请和基于 pgvector 的检索增强生成。
- **长期记忆**：自动提取值得保留的信息，并提供可视化的记忆管理页面。
- **联网与位置工具**：支持 Web Search；在用户授权后可获取浏览器位置并通过高德逆地理编码查询天气或周边信息。
- **语音输入**：支持录音、语音转文字和有效语音校验。
- **附件资料库**：统一管理上传文件、图片和 AI 生成图片，并可在后续对话中复用。
- **会话项目化**：支持会话搜索、置顶、分组、拖拽归档，以及项目级系统提示词。
- **现代前端体验**：Markdown、代码高亮、深浅主题、响应式布局、移动端适配和浏览器通知。

## 界面与使用场景

MalouChat 可以作为以下项目的基础：

- 个人 AI 助手、ChatGPT 类聊天应用
- 企业内部文档问答和 RAG 知识库
- 支持图片、文件和语音的多模态 Chatbot
- 带联网搜索、位置能力和自定义工具的 AI Agent
- 可私有部署的智能客服或团队问答系统

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite、React Router、Zustand、Ant Design |
| 后端 | Node.js 20、TypeScript、Express、Zod、JWT |
| AI 编排 | LangChain、LangGraph、MCP、OpenAI-compatible API |
| 数据库 | PostgreSQL、Prisma、pgvector |
| 文件存储 | Cloudflare R2 / S3-compatible Object Storage |
| 默认 AI 服务 | 阿里云百炼 DashScope、Qwen、高德地图 Web 服务 |
| 部署 | Docker、Nginx、Railway |

## 系统架构

```mermaid
flowchart LR
    Browser["React Web"] -->|"REST / SSE"| API["Express API"]
    API --> Auth["JWT Auth"]
    API --> AI["LangChain / Tools / MCP"]
    API --> DB["PostgreSQL + pgvector"]
    API --> Storage["Cloudflare R2 / S3"]
    AI --> Models["DashScope / OpenAI-compatible"]
    AI --> Search["Web Search"]
    AI --> Location["Browser Location + AMap"]
```

## 项目结构

```text
my-agent/
├── server/                 # Express API、Prisma、AI 编排和工具
│   ├── prisma/             # 数据模型和数据库迁移
│   └── src/
│       ├── config/         # 环境变量校验
│       ├── lib/            # AI、模型注册、MCP、RAG、视觉和工具
│       └── modules/        # 认证、会话、消息、文件、知识库等业务模块
├── web/                    # React 19 前端
│   └── src/
│       ├── api/            # HTTP 与 SSE 请求封装
│       ├── components/     # 通用组件和聊天组件
│       ├── stores/         # Zustand 状态管理
│       └── views/          # 页面
├── docker-compose.yml
└── AGENTS.md               # 项目约定和模块索引
```

`server/` 与 `web/` 是两个独立应用，没有 workspace runner，需要分别安装依赖和执行命令。

## 快速开始

### 1. 准备环境

开始前请安装：

- Node.js 20+
- Yarn
- PostgreSQL，并启用 [pgvector](https://github.com/pgvector/pgvector) 扩展；推荐直接使用 Neon PostgreSQL
- 一个 DashScope API Key，用于默认聊天模型和主要 AI 能力
- Cloudflare R2 或其他 S3-compatible 对象存储
- 一个高德地图 Web 服务 Key

只验证基础文本聊天时，可以暂时不配置对象存储和高德地图；要正常使用当前项目提供的图片、附件、知识库、文生图、位置和周边查询等完整能力，则必须配置它们。

### 2. 克隆项目

```bash
git clone https://github.com/lyh0032/malu-chat.git
cd malu-chat
```

### 3. 配置后端

```bash
cp server/.env.example server/.env
```

编辑 `server/.env`。以下是使用当前主要功能所需的核心配置：

```dotenv
NODE_ENV=development
PORT=5172

DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require&connect_timeout=15
JWT_SECRET=replace-with-a-long-random-string
CORS_ORIGINS=http://localhost:5173

DASHSCOPE_API_KEY=sk-your-dashscope-api-key

AMAP_API_KEY=your-amap-web-service-key

STORAGE_BUCKET=your-bucket
STORAGE_ACCESS_KEY_ID=your-access-key-id
STORAGE_SECRET_ACCESS_KEY=your-secret-access-key
STORAGE_ENDPOINT=https://your-s3-compatible-endpoint
```

`server/.env` 已被 Git 忽略，请勿提交真实数据库密码、JWT Secret 或 API Key。

### 4. 安装依赖并初始化数据库

```bash
cd server
yarn
yarn prisma:generate
yarn prisma migrate deploy

cd ../web
yarn
```

已提交的迁移会创建业务表、启用 pgvector，并写入默认模型配置。数据库中的第一个注册用户会自动成为管理员，可在 `/admin` 页面维护模型。

### 5. 启动开发服务

打开两个终端：

```bash
# 终端 1：后端，默认 http://localhost:5172
cd server
yarn dev
```

```bash
# 终端 2：前端，默认 http://localhost:5173
cd web
yarn dev
```

浏览器访问 [http://localhost:5173](http://localhost:5173)，注册第一个账号后即可开始使用。后端健康检查地址为 [http://localhost:5172/health](http://localhost:5172/health)。

## 环境变量

后端环境变量模板位于 `server/.env.example`，运行时由 `server/src/config/env.ts` 统一校验。空字符串会按未配置处理。

这里需要区分“服务进程能否启动”和“产品功能能否正常使用”：部分变量在配置校验中允许为空，是为了让服务按需启用能力，但对应功能被调用时仍会失败。下表按实际业务运行要求标注：

- **必填**：应用基础依赖，没有有效配置时无法正常运行。
- **完整功能必填**：缺失后服务可能仍能启动，但聊天、文件、文生图或位置等现有功能会不可用。
- **生产必填**：本地有默认值，生产部署必须显式配置。
- **条件必填**：启用对应能力或选择该提供方时必须配置。
- **可选**：代码已有可直接使用的默认值，通常无需修改。

### 基础服务与认证

| 变量 | 必要性 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `NODE_ENV` | 生产必填 | `development` | 生产环境必须设置为 `production`，它会影响 Refresh Cookie 的 `Secure` 属性 |
| `PORT` | 可选 | `5172` | 后端监听端口；Railway 通常会自动注入 |
| `DATABASE_URL` | 必填 | - | PostgreSQL 连接串；没有有效数据库连接时认证、会话、消息和模型配置均无法工作；Neon 建议保留 `sslmode=require&connect_timeout=15` |
| `JWT_SECRET` | 生产必填 | 仅开发环境有临时默认值 | JWT 和文件访问令牌的签名密钥，生产环境应使用高强度随机值 |
| `JWT_ACCESS_TOKEN_TTL_SECONDS` | 可选 | `3600` | Access Token 有效期，单位为秒 |
| `JWT_REFRESH_TOKEN_TTL_SECONDS` | 可选 | `86400` | Refresh Token 有效期，单位为秒 |
| `CORS_ORIGINS` | 生产必填 | 本地前端地址 | 必须包含实际前端 Origin，多个地址用英文逗号分隔，否则浏览器跨域请求会失败 |

### AI 模型、文生图与联网搜索

| 变量 | 必要性 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `DASHSCOPE_API_KEY` | 完整功能必填 | - | 当前默认模型、视觉、Embedding、语音和联网搜索使用的 Key；缺失时聊天会报模型未配置 |
| `DASHSCOPE_BASE_URL` | 可选 | DashScope compatible-mode 地址 | DashScope OpenAI-compatible API Base URL |
| `DASHSCOPE_IMAGE_API_KEY` | 可选 | 复用 `DASHSCOPE_API_KEY` | 文生图专用 Key |
| `DASHSCOPE_IMAGE_GENERATION_URL` | 可选 | DashScope 图片生成地址 | 文生图完整 API 地址 |
| `DASHSCOPE_WEBSEARCH_MCP_URL` | 可选 | DashScope WebSearch MCP 地址 | 内置联网搜索 MCP 服务地址 |
| `DASHSCOPE_WEBSEARCH_ENABLED` | 可选 | `true` | 是否启用内置联网搜索，仅接受 `true` 或 `false` |

模型名称、排序、是否启用和默认模型不通过环境变量配置，而是统一保存在 `AiModel` 表中，由管理员页面维护。

### 浏览器位置与高德地图

| 变量 | 必要性 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `AMAP_API_KEY` | 完整功能必填 | - | 高德地图 Web 服务 Key；缺失时位置、天气和周边类工具无法解析用户所在地区 |
| `AMAP_REGEOCODE_URL` | 可选 | 高德逆地理编码 v3 地址 | 高德逆地理编码完整接口地址 |

浏览器只会在模型调用位置工具后向用户请求授权，不会根据用户文本在前端自行判断或自动获取位置。

### Cloudflare R2 / S3 对象存储

| 变量 | 必要性 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `STORAGE_BUCKET` | 完整功能必填 | - | Bucket 名称；缺失时附件无法持久化到对象存储 |
| `STORAGE_ACCESS_KEY_ID` | 完整功能必填 | - | S3-compatible Access Key ID |
| `STORAGE_SECRET_ACCESS_KEY` | 完整功能必填 | - | S3-compatible Secret Access Key |
| `STORAGE_ENDPOINT` | 二选一必填 | - | S3-compatible API Endpoint；建议显式配置 |
| `STORAGE_DOMAIN` | 二选一必填 | - | 未配置 `STORAGE_ENDPOINT` 时，后端从该 URL 提取协议和 Host 作为 Endpoint |

`STORAGE_ENDPOINT` 与 `STORAGE_DOMAIN` 至少配置一个。缺少对象存储配置时，普通上传虽然存在本地文件回退逻辑，但当前预览、下载、视觉分析和文生图持久化仍依赖 S3 接口，因此完整运行不能把对象存储视为可选项。

数据库及普通业务接口只保存和传递 `storageKey`。前端需要展示或下载文件时，再通过统一文件接口批量兑换短期 URL。

### OpenAI-compatible 备用通道

| 变量 | 必要性 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | 条件必填 | - | 不使用 DashScope 作为聊天模型提供方时，需要和 `OPENAI_BASE_URL` 一起配置 |
| `OPENAI_BASE_URL` | 条件必填 | - | 备用 OpenAI-compatible API Base URL |

OpenAI-compatible 通道只替代通用模型请求。当前内置 WebSearch MCP 仍直接依赖 `DASHSCOPE_API_KEY`，文生图也仍使用 DashScope 图片接口；要保留 README 中描述的全部能力，仍需配置 DashScope。

### 前端变量

本地开发可在 `web/.env` 中配置：

```dotenv
VITE_API_BASE_URL=http://localhost:5172
```

Vite 会把 `/api` 和 `/health` 代理到该地址。生产构建将其留空时，前端请求同源路径，并由 Nginx 反向代理到后端。

## 常用命令

```bash
# 后端
cd server && yarn dev
cd server && yarn build
cd server && yarn start
cd server && yarn prisma:generate
cd server && yarn prisma:migrate --name <migration-name>

# 前端
cd web && yarn dev
cd web && yarn build
cd web && yarn preview
```

提交代码前，至少确保 `server` 和 `web` 的 `yarn build` 均通过。

## Docker 部署

项目根目录提供了 `docker-compose.yml`：

```bash
docker compose up -d --build
```

Compose 只向宿主机暴露 `80` 端口。当前 `web/nginx.conf` 默认代理到项目的 Railway 后端；如果希望通过 Docker 在本机完整运行前后端，请先将其中 `/api` 与 `/health` 的 `proxy_pass` 改为 `http://server:5172`，并将对应 `Host` 设置为 `server`。

## Railway 部署

前后端在 Railway 中作为两个独立服务部署。建议从仓库根目录执行：

```bash
# 后端
railway up ./server --path-as-root --service server --detach --message "deploy server"

# 前端
railway up ./web --path-as-root --service web --detach --message "deploy web"
```

部署前请完成两端构建，并将 `server/.env` 中实际使用的变量配置到 Railway 的 `server` 服务。后端域名变化后，还需要同步更新 `web/nginx.conf` 中 `/api` 和 `/health` 的代理地址，再重新部署前端。

更完整的 Railway 命令、环境变量和故障排查说明见 [AGENTS.md](AGENTS.md)。

## 数据与文件处理

```text
上传文件
  -> 提取文本或表格内容
  -> 后台分块
  -> 生成 Embedding
  -> 写入 PostgreSQL / pgvector
  -> 用户提问
  -> 语义检索相关片段
  -> LLM 结合上下文生成回答
```

- 图片会通过视觉模型分析，并将与当前问题相关的描述加入模型上下文。
- 小型文本文件可直接作为上下文，大文件通过 RAG 检索相关片段。
- PDF、DOCX、XLSX 等文件会先提取可读内容，再进入后续处理流程。
- 原始文件存放在对象存储，数据库只保存稳定且唯一的 `storageKey`。

## 参与开发

欢迎提交 Issue 和 Pull Request。开始修改前建议先阅读 [AGENTS.md](AGENTS.md)，其中记录了仓库结构、模块职责、前后端约定、部署步骤和容易踩到的边界。

正式提交前请运行：

```bash
cd server && yarn build
cd ../web && yarn build
```

## 相关关键词

AI Chat、Chatbot、聊天机器人、对话机器人、AI 助手、智能助手、ChatGPT Clone、React Chat、Node.js Chatbot、LLM、AI Agent、MCP、RAG、知识库问答、长期记忆、多模态、图片理解、文生图、语音识别、Web Search、自托管、私有部署。
