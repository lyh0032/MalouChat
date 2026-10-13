# AGENTS.md

## 仓库结构

- `server/` 和 `web/` 是两个独立应用，无 workspace runner
- `server/`: Express + Prisma + PostgreSQL (Neon 云数据库)
- `web/`: React 19 + Vite + React Router + Zustand + Ant Design

## 常用命令

- 安装：`cd server && yarn`，再 `cd web && yarn`
- 开发/构建：`cd server && yarn dev/build`，`cd web && yarn dev/build`
- 生产启动：`cd server && yarn build && yarn start`
- Prisma：`cd server && yarn prisma:generate`，`cd server && yarn prisma:migrate --name <name>`
- Prisma：`cd server && yarn prisma:generate`，`cd server && yarn prisma:migrate --name <name>`
- 验证：两端的 `build` 通过即可
- Docker 部署（需在项目根目录）：`docker compose up -d --build`，仅暴露 80 端口，服务端端口不对外暴露

## Railway 部署注意事项

- 本项目在 Railway 上按两个独立服务部署：`server`（后端 API）和 `web`（前端 Nginx 静态站点）。部署前先在项目根目录确认 Railway 登录和服务名：`railway status --json`、`railway service list --json`；如果实际服务名不是 `server` / `web`，下面命令里的 `--service` 必须替换为真实服务名。
- 部署前本地验证：`cd server && yarn build`，再 `cd ../web && yarn build`。没有 workspace runner，不要在根目录直接跑 `yarn build`。
- 前端 `yarn build` 会先从仓库根目录的 `AGENTS.md` 生成 `web/src/generated/architecture-graph.json`；Railway 上传前端时以 `web/` 为独立构建根目录，容器内没有根目录的 `AGENTS.md` 和 `scripts/`，因此 `web/Dockerfile` 必须执行不带生成步骤的 `yarn build:app`。部署前先在本地执行完整 `yarn build` 以更新并校验生成文件，不要把 Dockerfile 改回 `RUN yarn build`。
- 推荐从项目根目录部署，显式指定路径和服务，避免把前端部署到后端服务或反过来：
  - 后端：`railway up ./server --path-as-root --service server --detach --message "deploy server"`
  - 前端：`railway up ./web --path-as-root --service web --detach --message "deploy web"`
  - 也可以进入目录部署：`cd server && railway up --service server --detach`，`cd web && railway up --service web --detach`。
- 后端 Railway 环境变量至少需要：`NODE_ENV=production`、`DATABASE_URL`、`JWT_SECRET`、`CORS_ORIGINS`、`DASHSCOPE_API_KEY`、`AMAP_API_KEY`、`STORAGE_BUCKET`、`STORAGE_ACCESS_KEY_ID`、`STORAGE_SECRET_ACCESS_KEY`、`STORAGE_DOMAIN`；`JWT_ACCESS_TOKEN_TTL_SECONDS`、`JWT_REFRESH_TOKEN_TTL_SECONDS`、`AMAP_REGEOCODE_URL`、`DASHSCOPE_IMAGE_API_KEY`、`DASHSCOPE_IMAGE_GENERATION_URL`、`DASHSCOPE_WEBSEARCH_MCP_URL`、`STORAGE_ENDPOINT`、`OPENAI_API_KEY`、`OPENAI_BASE_URL` 按需配置。Token TTL 不配置时分别默认 3600 秒和 86400 秒，正式用户与访客共用相同有效期。模型标识和运行参数统一来自 `AiModel` 表，不要再配置 `DASHSCOPE_MODEL` 或 `DASHSCOPE_IMAGE_MODEL/SIZE/PROMPT_EXTEND/WATERMARK`。
- 设置 Railway 变量可用 `railway variable set KEY=value --service server`。批量改变量时建议先加 `--skip-deploys`，变量全部设置完后再手动 `railway up` 部署一次；不要把 `railway variable list --kv/json` 的输出贴到对话里，里面含明文密钥。
- 当前前端生产镜像由 `web/Dockerfile` 构建，并用 `web/nginx.conf` 把 `/api` 和 `/health` 反向代理到后端 Railway 域名。后端 Railway 域名变化时，必须同时修改 `web/nginx.conf` 里的两处 `proxy_pass` 和对应 `Host`，再重新部署 `web`。
- 前端 `VITE_API_BASE_URL` 为空时会请求同源 `/api`，由 Nginx 代理到后端；如果改成直连后端域名，则后端 `server/src/app.ts` 的 CORS allowlist 必须包含当前前端 Railway 域名。
- 部署后检查：
  - 后端健康检查：访问 `https://<server-domain>/health`
  - 前端健康检查：访问 `https://<web-domain>/health`
  - 登录接口若一直 pending，优先查 `web/nginx.conf` 是否代理到当前后端域名，以及 `server/src/app.ts` CORS 是否包含当前前端域名。
  - 日志：`railway logs --service server --lines 100`、`railway logs --service web --lines 100`；HTTP 错误可用 `railway logs --service server --http --status ">=400" --lines 50`。

## 服务端注意事项

- API 挂在 `/api`，健康检查 `/health`，服务绑定 `0.0.0.0`
- 数据库采用 Neon PostgreSQL 云数据库，连接串在 `.env` 的 `DATABASE_URL`；schema 在 `server/prisma/schema.prisma`（含 pgvector 扩展用于向量检索）。连接串应保留 `sslmode=require` 并建议设置 `connect_timeout=15`，避免休眠端点冷启动超过 Prisma 默认连接超时。
- `server/.env` 只保留本地真实密钥，禁止提交；仓库只提交 `server/.env.example` 空值模板和注释说明。若 `.env` 曾经被跟踪，使用 `git rm --cached server/.env` 移出索引但保留本地文件。
- CORS 配置在 `server/src/app.ts`，新 host/port 需添加
- `DASHSCOPE_API_KEY` 启用默认 LLM 能力和内置 web search MCP；`OPENAI_API_KEY` / `OPENAI_BASE_URL` 仅作为 OpenAI-compatible 备用通道
- `STORAGE_*` 系列环境变量配置 Cloudflare R2 对象存储（兼容 S3 API），`STORAGE_ENDPOINT` 可选（默认从 `STORAGE_DOMAIN` 自动推导）

## 前端注意事项

- Vite 端口 `5173`，`/api` 和 `/health` 代理到 `VITE_API_BASE_URL`（默认 `http://localhost:5172`）
- 浏览器入口是 `web/src/main.tsx`，Vite 只启用 React 插件；业务页面和组件统一使用 `.tsx`，不得重新引入 Vue、Pinia、Element Plus 或 `.vue` 双实现
- 前端技术栈固定为 React 19、React Router、Zustand 和 Ant Design；API、types、utils 等框架无关模块继续复用。HTTP 全局提示通过 `web/src/utils/toast.ts` 注入，不要在 API 层直接依赖 Ant Design
- React 已是唯一前端实现，源码路径统一使用中性业务命名（如 `components/chat/`、`stores/chat.ts`、`router/index.tsx`、`hooks/useMobile.ts`）；不得重新添加 `chat-react/`、`*-react.ts`、`useMobileReact.ts` 等迁移期文件或目录后缀
- React 19 下 Zustand selector 必须返回稳定快照：不要在 `useXxxStore(selector)` 的 selector 内直接 `map/filter` 或创建对象/数组；先订阅稳定字段，再用 `useMemo` 派生，或使用浅比较。否则 `useSyncExternalStore` 会触发 `getSnapshot should be cached` 和无限更新白屏
- 侧栏布局分为：顶部操作区（新建对话/搜索对话/管理记忆/资料库/知识库入口，以及仅管理员可见的后台管理）、页面专属中间区、底部用户面板
- `web/src/components/navigation/AppSidebarShell.tsx` 是聊天页、记忆管理、资料库、知识库和后台模型管理唯一共用的应用侧栏外壳；品牌区、顶部导航、知识库数量、移动端抽屉遮罩和底部账户/设置区只能在这里维护。页面专属内容通过中间 `children` 区域注入，禁止各管理页面复制另一套侧栏结构
- `chat-layout-sidebar-content` 使用原生滚动容器并隐藏滚动条；`chat-layout-collapse-header` 采用 sticky 吸顶，背景必须使用不透明实色，避免滚动内容透出
- 侧栏列表密度要偏紧凑：项目/会话 item 默认约 36px 高，分组和列表 padding 不宜过大；项目内会话左侧要缩进到和项目标题对齐

## 界面国际化

- `web/src/i18n/index.ts` 使用 i18next + react-i18next；语言仅支持 `zh-CN` / `en-US`，默认中文。翻译资源位于 `web/src/i18n/locales/`，使用稳定语义 key 和插值，不拼接句子；React 组件订阅 `useTranslation()`，派生文案缓存需把语言加入依赖。
- `web/src/components/LanguageSelect.tsx` 是共享语言入口：未登录时在登录/注册页右上角与主题并排，已登录时在共用设置弹窗中展示。Ant Design 的 `ConfigProvider.locale`、HTML lang 和日期格式随语言更新。
- 未登录语言存 localStorage；已有用户登录和 `/auth/me` 恢复时以 `User.language` 为准。注册和首次访客创建继承登录页语言，已有访客恢复不覆盖账号偏好。`PATCH /api/users/me/language` 保存当前账号偏好，前端即时切换、保存期间防重复、失败回退，并忽略跨账号的迟到结果。
- 本次语言仅影响界面，不传入 AI 调用；模型配置名称/描述、已有消息、用户内容和项目提示词保留原文。后端错误按 errorCode 在前端翻译；技术架构页始终保持中文，直接读取 AGENTS.md 生成的原文，不使用翻译字典或展示翻译层、不手改生成产物；其导航入口仍跟随界面语言。
- 验证：`node --test scripts/i18n.test.cjs`；需要真实数据库验证时，在本地 server 运行后执行 `node scripts/i18n-api.test.cjs`（临时测试账号在 finally 清理），再执行两端 `yarn build`。

## 功能模块文件索引

### 1. 注册 / 登录

- `server/src/modules/auth/auth.routes.ts` — 路由注册
- `server/src/modules/auth/auth.controller.ts` — 注册、登录、Token 刷新、退出和当前用户请求处理
- `server/src/modules/auth/auth.service.ts` — 认证业务逻辑（注册、登录、刷新会话、查询用户）
- `server/prisma/schema.prisma` → `User.type` 区分 `registered|guest`；访客恢复密钥只保存 SHA-256 哈希，访客展示名由数据库 sequence 原子生成 `Visitor_0001` 递增格式
- `server/src/modules/auth/auth.cookies.ts` — Refresh Token Cookie 的读取、设置和清除
- `server/src/lib/jwt.ts` — Access/Refresh JWT 签发、类型隔离与验证；对外保留 `verifyToken()` 作为 Access Token 验证入口
- `server/src/middlewares/auth.ts` — Bearer token 鉴权中间件
- `web/src/views/LoginView.tsx` — 登录/注册合一页面；`/login` 与 `/register` 共用该组件，使用 Ant Design Form 并按路由切换表单
- `web/src/components/MalouBrand.tsx` — MalouChat 共享品牌标识；浏览器 favicon 使用 `web/public/logo.svg`
- `web/src/router/index.tsx` — React Router 路由表与认证/管理员守卫；业务页面使用 `React.lazy` 路由级拆包
- `web/src/stores/auth.ts` / `web/src/stores/theme.ts` — React Zustand 认证与主题状态；认证恢复通过单一 Promise 合并 React StrictMode 下的重复 Effect
- `web/src/stores/auth.ts` — 用户认证状态管理（含 session restore）；退出时立即清理本地状态并异步通知后端清除 Refresh Cookie
- `web/src/api/auth.ts` — 注册、登录、当前用户和退出 API 调用；Token 自动刷新由 `web/src/api/http.ts` 统一处理
- `web/src/router/index.tsx` — 路由守卫，未登录重定向
- `web/src/utils/token.ts` — token 本地持久化
- `web/src/utils/hash.ts` — 密码传输安全：前端 SHA-256 哈希后发送，服务端直接 bcrypt 存储/比对，明文密码不出浏览器
- `web/src/utils/guest-identity.ts` — 本浏览器保存访客展示名和高熵恢复密钥；访客会话过期后再次点击“访客登录”可恢复原账号，后端不凭可猜测的用户名恢复身份

#### React 管理页面迁移状态

- `web/src/views/MemoryView.tsx` / `web/src/stores/memory.ts` — 记忆管理 React 实现已接入 `/memories`；保持只允许编辑和删除、不允许新建，Ant Design Modal 承担编辑和删除确认，加载请求在 StrictMode 下合并
- `web/src/components/navigation/AppSidebarShell.tsx` / `web/src/components/management/ManagementSidebar.tsx` — React 管理页面与聊天页共用同一个应用侧栏外壳；管理页只向中间区域注入概览、统计或分区导航。`/memories`、`/library-assets`、`/knowledge-bases`、`/admin` 必须高亮对应顶部入口，其中后台管理只向管理员展示且仍受路由守卫保护。管理页面不提供左下角或页头重复返回按钮，Logo 仍可回到 Chat
- `web/src/views/LibraryAssetView.tsx` / `web/src/stores/library-asset.ts` — 资料库 React 实现；保留分类筛选、图片预览、文件下载、关联会话跳转和后端删除限制。同一资产可通过 `FileConversationReference` 关联多个会话，页面必须完整展示所有会话引用；普通 `/chat` 草稿引用显示并跳转“新建会话”
- `web/src/views/KnowledgeBaseView.tsx` / `web/src/stores/knowledge-base.ts` — 知识库 React 实现；保留创建更新、详情、处理状态轮询、团队权限、邀请与成员管理，列表请求合并以避免 StrictMode 重复获取
- `web/src/views/AdminView.tsx` / `web/src/stores/admin-model.ts` — 模型管理 React 实现；页头不提供重复返回，添加对话模型仍在内容区；Sortable 触屏 fallback 与无 transform 过渡规则继续保留
- 记忆管理、资料库、知识库和后台模型管理不做路由常驻缓存；每次从其他页面重新进入时，页面挂载 Effect 必须调用各自 store 的强制刷新参数（记忆 `loadMemories({}, true)`、资料 `loadAssets(true)`、知识库 `loadKnowledgeBases(false, true)`、模型 `loadModels(true)`）。只有 Chat 允许由 `AuthenticatedShell` 常驻缓存

#### React 对话页面迁移状态

- `web/src/views/ChatView.tsx` / `web/src/stores/chat.ts` — React 对话编排与 Zustand 状态已接入全部 `/chat` 路由；保留新建会话延迟创建、项目路由校验、SSE 逐帧聚合、断流恢复、停止生成、消息编辑重生和系统通知。`AuthenticatedShell` 在用户首次打开 Chat 后常驻该组件，从记忆、资料库、知识库或模型管理返回时不得卸载或重新初始化 Chat；离开时只断开 SSE 订阅，返回时按当前消息状态恢复订阅。
- `web/src/components/chat/ChatSidebar.tsx` — React 侧栏已接入项目、会话菜单与跨项目拖动；移动端使用 1 秒长按的 Sortable fallback，并保留原生纵向滚动。拖动回调使用 ref 保持稳定，普通状态更新不得反复销毁拖动实例。
- `web/src/components/chat/MessageComposer.tsx` — React 输入区保留单附件、粘贴上传、语音转写、知识库引用、深度思考和普通 `/chat` 云端草稿恢复；加号菜单还提供“从资料库添加”，通过 `LibraryAssetPickerDialog.tsx` 搜索并单选用户文件、图片或文生图，知识库附件必须由前后端同时排除。草稿 loading 必须携带当前 `routeKey` 隔离旧请求。草稿请求只按会话/路由变化触发，知识库列表轮询或刷新只能用独立 Effect 做本地回显，禁止把整个列表放进草稿请求 Effect 的依赖而重复调用 `/conversation-draft`。首次发送创建正式会话时，生成/停止期间不得查询正式会话 pending 附件，避免草稿附件迁移后、绑定用户消息前被重新恢复到输入框；生成状态结束后再恢复 pending 附件。输入区光束运行约 1.96 秒后停顿 3 秒，并遵循减少动态效果设置。
- `web/src/components/chat/MessageList.tsx` / `QuestionDots.tsx` — React 消息区使用消息骨架屏代替居中 Loading；本次在浏览器上传的图片通过 `web/src/utils/local-file-preview.ts` 按附件 ID / `storageKey` 复用有数量上限的内存 `blob:` 预览，有本地预览时直接展示且不再兑换远端地址，刷新后或未命中本地预览时继续走现有 `/files/url` 解析链路。问题目录不再按屏幕宽度切换圆点模式，所有设备默认显示贴右边的紧凑入口，桌面端 hover、触屏点击后展开标题列表。首条消息需要避开悬浮标题栏，但仍可随内容向上滚动。

#### 可恢复访客登录流程

`LoginView` 点击访客登录 → `auth store` 读取本地访客恢复密钥 → `POST /api/auth/guest` → 后端按密钥哈希恢复已有访客或用数据库 sequence 创建新的 `Visitor_0001` 递增账号 → 返回正常 Access Token 并写入 Refresh Cookie → 前端保存访客名和恢复密钥。数据库只保存恢复密钥的 SHA-256 哈希；访客与正式用户共用 Token 有效期。访客不进入知识库邀请搜索或直接邀请候选，点击新建知识库时由前端友好拦截。

#### Token 刷新流程

- Access Token 默认有效期 1 小时（`JWT_ACCESS_TOKEN_TTL_SECONDS=3600`）；Refresh Token 默认有效期 24 小时（`JWT_REFRESH_TOKEN_TTL_SECONDS=86400`）。两者均带 `tokenType`，Refresh Token 不能用于 Bearer 鉴权。
- 正式用户与访客共用相同的 Access/Refresh Token 有效期和滑动续期逻辑；访客 Refresh Cookie 过期后仍可用浏览器本地高熵恢复密钥重新登录原访客，密钥本身不写入数据库明文。
- 注册/登录响应仍使用原有 `token` 字段返回 Access Token，避免侵入现有业务调用；Refresh Token 只写入 `my_agent_refresh_token` Cookie，属性为 `HttpOnly`、`SameSite=Lax`、生产环境 `Secure`、`Path=/api/auth`，不返回给前端 JavaScript。
- 后端公开 `POST /api/auth/refresh` 和 `POST /api/auth/logout`。刷新时验证 Refresh Token 及用户是否仍存在，然后重新签发 Access/Refresh Token；因此当前是滑动 24 小时会话，连续使用可续期，闲置超过 24 小时后需重新登录。
- `web/src/api/http.ts` 给请求统一加 `credentials: 'include'`。普通请求收到 401 时，使用全局单一 `refreshPromise` 合并并发刷新，成功后用新 Access Token 重试原请求；登录、注册、刷新和退出接口不参与自动刷新，避免循环。刷新失败时清理本地 Access Token 并跳转登录页。
- 文件上传使用独立 `XMLHttpRequest` 以保留进度回调，发起前只调用 HTTP 层 `ensureFreshAccessToken()` 预检 Token，业务文件中不复制刷新/重试逻辑。
- 刷新机制的边界应保持在后端 JWT/认证模块和前端 HTTP 层，不要改动原有 `token` 响应契约或在业务模块里重复刷新逻辑。当前 Refresh Token 是无状态 JWT，退出只清除浏览器 Cookie；如需设备级强制下线、立即撤销或盗用检测，需另增服务端会话记录/撤销列表。

### 2. 会话管理 / 项目化会话

- `server/prisma/schema.prisma` → `Conversation` 模型（含 `isPinned` 置顶字段、`knowledgeBaseId` 知识库绑定字段和 `projectId` 项目绑定字段）；`Project` 模型（icon/iconColor/title/prompt/userId）
- `server/prisma/migrations/20260703000000_add_projects/migration.sql` — 项目表和会话 `projectId` 字段迁移；已在本地 Neon 数据库执行过 `cd server && yarn prisma migrate deploy`
- `server/src/modules/conversations/conversation.{routes,controller,service}.ts` — 会话 CRUD（列表、创建、详情、重命名、置顶、删除、知识库绑定、项目绑定/移出）；会话摘要通过最近一轮消息状态返回 `isGenerating`，供侧栏标记仍在执行的会话
- `server/src/modules/projects/project.{routes,controller,service,schema}.ts` — 项目 CRUD；创建/更新 icon、iconColor、title（20 字以内）、prompt（500 字以内）；删除项目会级联删除项目下会话
- `web/src/views/ChatView.tsx` — 主页面编排层，协调路由、会话加载、滚动、发送消息、知识库弹窗等业务事件；具体 UI 拆到 `components/chat`
- `web/src/components/navigation/AppSidebarShell.tsx` / `web/src/components/chat/ChatSidebar.tsx` — 前者统一提供品牌、顶部导航、移动抽屉和账户区，后者只提供聊天页中间的项目与普通会话列表
- `web/src/components/chat/ChatMainPanel.tsx` — 聊天主区（标题栏、消息列表、问题定位点、输入区），封装滚动容器并向父层暴露滚底方法；输入区作为面板 flex 布局的固定底部项，不得绝对定位覆盖滚动区，附件等内容改变输入区高度时必须由滚动区自动让出真实空间；有消息的会话向上滚动、距底部超过 100px 时，在输入区上方显示毛玻璃圆形向下按钮，点击后平滑滚到底部，切换会话或消息清空时必须隐藏；输入框外层使用原生 CSS conic-gradient 边框光束，按当前实际明暗主题渲染，每次约 1.96 秒绕行一圈、淡出后完整停顿 3 秒再运行，不得恢复成持续循环
- `web/src/components/chat/ProjectHome.tsx` — 项目新会话路由的专属主页；展示项目图标、标题、项目历史会话以及“聊天 / 提示”页签，支持直接查看和编辑项目提示词。进入 `/chat/:projectId` 时不得复用普通 `/chat` 的推荐问题空状态，底部输入框仍用于创建该项目下的新会话
- 输入框间歇光束由 `MessageComposer.tsx` 内部 Effect 管理，并在 Chat 隐藏、页面进入后台或用户启用 `prefers-reduced-motion` 时停止计时和动画
- `web/src/components/chat/ChatMainPanel.tsx` — 普通 `/chat` 恢复 `ConversationDraft` 期间覆盖右侧主面板的局部骨架屏；标题栏保留，空状态和输入区在请求结束前不可交互
- `web/src/components/chat/ConversationSearchDialog.tsx` — 会话搜索弹窗
- `web/src/components/chat/ChatSettingsDialog.tsx` — 设置弹窗（主题、默认模型、回答风格、退出登录）
- `web/src/components/chat/ChatSidebar.tsx` — 侧栏会话列表（含三点菜单：置顶/重命名/删除/移出项目/加入项目）；支持拖拽移动会话到项目或普通会话列表；`isGenerating` 会话在 `conversation-item-left` 左侧显示固定尺寸的旋转 Loading 图标
- `web/src/components/chat/ChatSidebar.tsx` — 侧栏项目列表；展示 icon、颜色、标题；点击项目行展开/收起项目下会话；项目更多菜单第一项为“新建对话”，再是编辑/删除
- `web/src/components/chat/ProjectDialog.tsx` — 项目创建/更新弹窗；图标网格只展示 icon，不展示文字；颜色提供常用色和 Ant Design 取色器
- `web/src/stores/chat.ts` — 会话与消息状态管理；维护 `activeProjectId`、项目新会话草稿态、会话移动项目后的本地列表同步
- `web/src/stores/project.ts` — 项目列表状态和 CRUD；维护项目会话数量
- `web/src/api/chat.ts` — 会话与消息 API（含 `projectId` 创建字段和会话移动项目接口）
- `server/src/modules/conversation-drafts/conversation-draft.{routes,controller,service,schema}.ts` — 普通 `/chat` 云端草稿 API；每个用户唯一一条 `ConversationDraft`，保存可空的 `knowledgeBaseId` 和单个 `fileUploadId`
- `web/src/api/conversation-draft.ts` — 普通新会话草稿读取与知识库更新 API
- `web/src/api/project.ts` / `web/src/types/project.ts` — 项目 API 和类型
- `web/src/utils/project-dnd.ts` / `web/src/utils/project-dnd.test.ts` — 项目拖拽移动会话的通用判断和测试

#### 新建对话流程

- 点击 `ChatSidebar.tsx` 顶部“新建对话”或会话分组右侧加号时，由 `ChatView.tsx` 调用 `chatStore.startNewConversation()` 进入新会话草稿态：`activeConversationId=''`、消息列表清空、URL 保持 `/chat` 无 `conversationId` query。进入该页面会读取后端云端草稿用于回显，但不得提前创建正式 `Conversation`。
- 访问 `/chat` 时不自动定位到第一个历史会话，默认展示新会话空页面；只有 URL 带有效 `conversationId` 时才加载对应历史会话，无效 `conversationId` 会回落到新会话态。
- 新会话态只高亮 `chat-layout-sidebar-top` 里的“新建对话”按钮；`chat-layout-collapse-header` 右侧的小加号只负责触发新建，不做高亮态。
- `ConversationDraft.userId` 唯一且注册时即创建；迁移会为已有用户回填。普通 `/chat` 选择知识库或上传附件时写入该草稿，跨浏览器、跨设备进入 `/chat` 都能恢复；项目新会话 `/chat/:projectId` 不使用这条全局草稿。
- 新会话空页面发送第一条消息时，沿用 `web/src/stores/chat.ts` 的 `sendMessageAction()`：检测到没有 `activeConversationId` 后用 `consumeDraft=true` 创建后端会话；后端在同一事务里创建真实 `Conversation`、迁移草稿知识库和附件、清空草稿字段，再继续发送/流式生成消息。
- 后端 `server/src/modules/conversations/conversation.service.ts#createConversation()` 不再复用“最新空会话”，每次被调用都创建新的真实会话；前端负责避免点击新建时产生空会话记录。
- 删除当前选中的会话后，不自动定位到相邻历史会话；统一调用 `startNewConversation()` 清空当前项目/会话状态并回到 `/chat` 新建会话页。删除非当前会话不得影响当前会话和路由。

#### 项目化会话流程

- 一个项目可以包含多个会话；一个会话最多只能属于一个项目。普通会话是 `projectId = null` 的会话，移出项目后回到普通“对话”列表。
- 项目路由约定：普通新会话为 `/chat`；普通历史会话兼容 `/chat?conversationId=xxxxx`；项目新会话为 `/chat/:projectId`；项目下历史会话为 `/chat/:projectId/:conversationId`。如果 URL 中项目和会话绑定不匹配，`ChatView.tsx` 要回落到项目新会话态并修正路由。
- 从项目中新建会话时，前端先进入 `chatStore.startNewProjectConversation(projectId)` 草稿态；发送第一条消息时 `createConversationAction(content, knowledgeBaseId, activeProjectId)` 把 `projectId` 写入后端。
- 项目提示词由 `server/src/modules/projects/project.service.ts#buildProjectPromptContext()` 根据 `conversation.projectId` 加载，并在同步发送、流式发送、重新生成时传入 `server/src/lib/ai.ts#buildLangChainMessages()` 的 system prompt。项目提示词中的语言、格式、角色和风格要求优先于默认助手语言、用户当前输入语言和普通历史习惯。
- 排查项目提示词链路时看两条日志：`[project-prompt] context-loaded` 中 `projectId` 非空、`hasProject: true`、`promptLength > 0`；`[deep-thinking] stream-assistant-reply-start` 中 `hasProjectContext: true`、`projectContextLength > 0`。`streamAssistantReply()` 必须解构并继续传递 `projectContext`，否则流式主路径会丢项目提示词。
- 会话移动项目支持三种入口：拖拽普通会话到项目、拖拽项目会话到另一个项目/普通会话列表、会话更多菜单里的“加入项目/移出项目”。“加入项目”不要在菜单中展开所有项目，点击后打开 dialog 选择目标项目，并过滤掉当前已所属项目。
- 拖拽使用 `sortablejs`：桌面端按下即可拖动；移动端粗指针设备强制使用 touch fallback，长按 1 秒进入拖动态，再按手指位置识别整个项目块或普通对话区并在松手时移动。普通对话拖到普通对话、项目会话拖回原项目等无变化场景不要调用接口；拖到项目标题或项目下会话区域时，要把整个项目块作为一个高亮投放区域，不要标题和列表分开高亮。Sortable fallback 副本由插件逐帧写入 `transform`，禁止给 fallback/dragging 元素添加 transform transition 或缩放，否则移动端会出现拖动重影和抖动；长按选中反馈只使用颜色、边框和阴影。
- 项目列表展开/收起：点击 `project-item` 展开/收起项目下会话；项目内会话列表左侧缩进与项目标题对齐。项目下会话按项目预先 computed 分组，避免每个项目反复 `filter` 全量会话。项目内部展开动画不要使用会导致高度测量和重排的重型 `el-collapse-transition`，使用轻量 opacity/translate 过渡，并在折叠后卸载子列表以释放隐藏 Sortable 实例。
- 项目删除需友好二次确认，明确提示会删除项目下所有会话；后端删除项目依赖数据库级级联清理项目下会话。

### 3. 对话管理（流式输出 / 消息操作 / 语音输入 / 文件附件 / 代码高亮 / 上下文记忆）

- `server/src/modules/messages/message.{routes,controller,service}.ts` — 消息流式生成、恢复、取消、编辑、删除、重新生成；支持 `fileIds` 参数携带附件；支持通用 client tool 协议（SSE 下发 `client-tool-request`，前端执行浏览器能力后 POST `client-tool-result`，后端工具暂停等待结果）；`buildFileContext()` 构建文件上下文注入 system prompt（图片→多模态分析并列出附件清单，视觉分析失败时也明确提示“本轮有图片附件”；文本文件→直接提取内容、其他文件→readFileTool 提示）；Message 模型含 `type` 字段（`text|image`）、`deepThinkingEnabled`、`reasoningContent`，AI 调用 `drawImageTool` 后自动设为 `image` 并终止 LLM 后续输出
- `server/src/utils/sse.ts` — SSE 响应初始化、事件写入与 15 秒心跳工具；消息 controller 启动心跳后必须在 `finally` 中清理定时器
- `server/src/utils/abort.ts` — 通用取消辅助：识别 abort 异常、主动检查信号，以及用 promise/abort 竞速避免不响应取消的工具阻塞流任务结束
- `server/src/modules/audio/audio.{routes,controller}.ts` — 独立 ASR HTTP 能力；`POST /api/audio/transcribe` 只要求登录鉴权和音频文件，不接收或校验会话 ID
- `server/src/lib/audio.ts` — ASR 模型调用与有效语音校验；`qwen3-asr-flash` 使用 OpenAI 兼容接口，`qwen-audio-3.x-asr-flash` 使用 DashScope 原生多模态 HTTP 接口（`input.messages`、`parameters.format`，从 `output.text` 读取结果），原生接口域名由 `DASHSCOPE_BASE_URL` 推导
- `server/src/lib/ai.ts` — LangChain 模型调用、工具绑定、消息组装（`projectContext` / `fileContext` 参数注入 system prompt）；`streamAssistantReplyWithTools` 中 `drawImageTool` 执行完毕后直接返回图片结果，跳过 LLM 后续输出；工具执行统一接收 `AbortSignal`，即使具体工具暂未响应取消，也通过通用 promise/abort 竞速及时结束当前生成任务；深度思考通过 `modelKwargs.enable_thinking` 调用阿里云模型原生能力，并从 raw stream 的 `reasoning_content` 抽取思考内容
- `server/src/lib/tools/image-generation-error.ts` — 文生图供应商错误归一化；把限流、鉴权和服务端异常转换为简洁中文提示，避免向用户暴露原始错误详情与帮助链接
- `server/src/lib/vision.ts` — 多模态图片分析（调用多模态模型，返回图片描述用于注入 LLM 上下文）；视觉模型读取图片时使用不带浏览器缓存响应覆盖参数的干净预签名 URL；`scheduleVisionAnalysis()` 上传时异步缓存通用 `visionDescription`，避免重复分析；发送消息时可结合用户本轮问题做 request-aware 图片分析，但该结果只进入本轮 `fileContext`，不要写回全局 `visionDescription`
- 历史附件边界：当前只把本轮消息新携带的图片或文件注入 `fileContext`，不会在后续轮次自动检索历史附件。用户追问之前上传的附件时，助手应说明目前只能读取当前这条消息附带的附件并请用户重新上传；不得声称用户从未上传或当前会话没有记录，也不得猜测刷新、传输中断或文件丢失。
- 模型时间上下文：数据库时间继续统一保存 UTC；前端通过 `web/src/utils/time-zone.ts#getBrowserTimeZone()` 在普通发送、编辑重发和重新生成请求中携带浏览器 IANA 时区，不发送客户端当前时间。后端通过 `server/src/utils/time-zone.ts` 校验时区，缺失或无效时统一回退 `Asia/Shanghai`，并使用服务端时间作为本次请求时间。
- `buildLangChainMessages()` 只给用户历史消息和当前用户消息添加分钟级 `[发送时间：YYYY-MM-DD HH:mm]` 前缀，助手消息不重复添加；历史 UTC `createdAt` 和当前请求时间都按本次浏览器时区转换。时间前缀只存在于模型上下文，不写回 Message 正文或数据库。
- `web/src/api/sse.ts` — SSE 底层解析：增量 UTF-8 解码、LF/CRLF/CR 事件分帧、注释心跳忽略、响应 Content-Type 校验和 reader 异常清理
- `web/src/api/chat.ts` — SSE 业务事件运行时校验与分发、音频上传、消息 CRUD；处理 `client-tool-request` 事件并提供 `client-tool-result` 回传 API；解析深度思考 SSE 事件；流结束前校验终止事件；`CreateMessageInput` 支持 `fileIds`、`knowledgeBaseId` 和 `deepThinkingEnabled`
- `web/src/stores/chat.ts` — 流状态管理、断流恢复、编辑→截断→重新生成编排；正文和 reasoning delta 使用 `requestAnimationFrame` 聚合，每帧最多写入 Zustand 一次；发送时必须立即进入发送态、插入乐观用户消息并将已有/新建会话的侧栏 `isGenerating` 乐观置为 true，让主区思考气泡和侧栏 Loading 同步出现；前端直接调用 `/messages/stream`，由该接口在持久化前完成所有权、并发任务和知识库校验，不要再增加独立 `/messages/check` 往返窗口；校验失败或任务建立前放弃发送时必须撤销乐观状态，并通过 `accepted=false` 通知输入框恢复正文和附件；`sendMessageAction` 接受 `fileIds`、`fileList`、`knowledgeBaseId` 和 `deepThinkingEnabled`，并使用模块级 in-flight 互斥避免快速重复发送；收到 client tool 请求后调用前端工具执行器并回传结果；维护消息级 `reasoningStatus` 和 `reasoningContent`；迟到的助手消息按 `createdAt` 插入，并在停止请求返回时校验当前会话，避免旧会话结果污染新会话
- `web/src/utils/message-order.ts` — 根据 `createdAt` 计算消息插入位置，确保恢复订阅或异步停止返回的迟到助手消息回到所属问答轮次
- `web/src/utils/markdown.ts` — Markdown 渲染（markdown-it）、语法高亮（highlight.js）、`markdownToPlainText()` 基于 token 提取纯文本用于复制、`renderMarkdownWithoutFileLinks()` 过滤文件链接
- `web/src/components/chat/MessageList.tsx` — 消息气泡展示（复制/编辑/删除操作栏在气泡下方 hover 显示；AI 角色使用紧凑版 Malou 品牌标识“🐵 + Malou”，不显示通用“助手”；AI 图片消息隐藏复制按钮，预览/下载按钮放在消息下方操作栏；代码块自动识别语言 + hljs 高亮 + 头部语言标签 + 独立复制按钮；`markdownToPlainText` 剥离格式后复制到剪贴板）；用户消息使用文本插值，不允许未经净化的 `v-html`；助手 Markdown 渲染结果按消息内容缓存，缓存只保留当前会话；支持文件附件卡片（非图片文件展示 Document 图标 + 文件名 + 大小），图片缩略图 140×140 卡片（使用 `el-image` 预览灯箱）；支持深度思考灰色小字折叠块，只有 `reasoningStatus=thinking` 或 `reasoningContent` 非空时展示，空 reasoning 完成后不要显示“正在整理”；工具调用状态属于内部编排，不展示具体工具 chip，避免遮挡深度思考和已流式输出内容
- `web/src/components/common/ThinkingOrb.tsx` / `web/src/utils/thinking-orb-clock.ts` — AI 活动状态的原生 Canvas 点阵动画；`thinking / reasoning / tool / shaping` 分别映射普通思考、深度推理、工具处理和图片生成。所有实例共用 30fps 动画时钟，DPR 上限为 2，离开视口或页面后台时暂停，并遵循 `prefers-reduced-motion`；绘制帧不得写入 React state 或改成高成本粒子物理效果
- `web/src/components/chat/QuestionDots.tsx` — 对话问题目录只有至少 2 轮问答时才展示；不设宽度断点，所有设备默认折叠为贴右边的小入口，桌面细指针 hover 展开、触屏点击展开，点击外部、移出、失焦或 Escape 后收起，触屏 2 秒无操作也会收起。展开后直接列出问题标题并点击定位，不再展示圆点轨道和单条回复预览；展开/收起使用 Motion for React 的 layout spring 与 `AnimatePresence` 反向退出动画，并遵循减少动态效果设置
- `web/src/components/chat/MessageComposer.tsx` / `ComposerAttachmentPreview.tsx` — 输入框 + 深度思考开关 + 录音按钮 + 发送/停止；左下角将附件与知识库合并为一个 Ant Design `Dropdown` 加号入口：桌面端提供单个“上传图片或文件”，移动端提供“相机 / 图库 / 文件”三项，分别使用 `capture="environment" + image/*`、`image/*` 和受支持文档类型的原生 `input[type=file]`，避免 iOS/Android 将三种能力混在同一个系统选择器中。已完成知识库存在时，下拉底部提供“选择知识库”的二级菜单；当前关联项只在二级菜单右侧显示勾选，不使用菜单选中背景，再次点击同一项会清除关联，选择后原知识库 chip 继续展示在加号右侧。附件从底部操作栏独立到输入框左上角，以紧凑卡片展示，图片可点击调用 Ant Design 图片预览，普通附件只展示文件图标和名称且不可预览，移动端文件名固定单行溢出省略。上传过程覆盖圆形进度环；上传完成后桌面端 hover/focus 才显示右上角删除按钮，粗指针/触屏设备始终显示。`composer-input` 聚焦时粘贴受支持的图片/文件会复用现有上传流程自动上传，纯文本粘贴不受影响，已有或正在上传附件时拒绝第二个文件并友好提示；普通 `/chat` 无正式会话 ID 时从 `ConversationDraft` 恢复附件和知识库，选择/移除知识库实时写回草稿，上传附件由后端直接绑定草稿；知识库列表只允许由 `ChatView.tsx` 的页面编排加载，Composer 必须直接读取全局 knowledge-base store，并在草稿和列表并发返回时通过 Effect 完成回显，不得为草稿额外请求列表；`/conversation-draft` 请求期间通过带 `routeKey` 的 loading 事件控制 `ChatDraftSkeleton`，防止快速切换时旧请求关闭当前骨架；移动端底部操作区必须保持单行，加号、知识库、深度思考三个槽位顺序固定，“深度思考”保留完整文案，麦克风与发送/停止按钮始终靠右；语音识别只回填输入框，新会话草稿态可直接使用且不创建会话；组件卸载时取消仍在进行的转写；深度思考开关持久化在 localStorage，发送消息时随请求传给后端；placeholder 移动端适配（640px 以下缩短为"输入问题..."）；只允许同时一个附件
- `web/src/api/audio.ts` — 独立语音转写 API，上传 Blob 到 `/api/audio/transcribe`，不接受 `conversationId`
- `web/src/constants/prompt-suggestions.ts` — 空会话页按“生活问答 / 技术问题 / 工具能力”维护 3 个独立启动建议池，每类固定 10 条；`web/src/stores/prompt-suggestions.ts` 为每类维护随机洗牌队列和游标，`MessageList.tsx` 始终各展示 1 条，“换一批”让每类各前进 1 条，本轮 10 条耗尽前不重复，下一轮重新洗牌且避免边界连续重复。该状态只保存在 Zustand 内存中，路由切换或组件重建不会重置，整页刷新后才重置。点击建议后由 `ChatView.tsx` 立即透传提交态，在首次创建会话和发送前校验期间锁定推荐区并为当前项展示 Loading，避免空页面无反馈或重复提交
- `web/src/views/ChatView.tsx` + `web/src/components/chat/ChatMainPanel.tsx` — 主页面滚动编排；`isNearBottom` 控制 auto-scroll：流式输出时自动滚底，用户主动上滚后停止，滚回底部恢复
- `web/src/api/file.ts` — 文件上传 API（`uploadFile` 使用 XMLHttpRequest 支持上传进度回调，上传前通过 HTTP 层预检 Access Token；`deleteFile`，`fetchPendingFiles`，`resolveFileUrls` 批量兑换临时预览/下载地址）
- `web/src/utils/client-tools.ts` — 前端 client tool 执行器；当前支持 `getBrowserLocation`，由后端 SSE 请求触发浏览器 geolocation，再把经纬度结果回传后端
- `web/src/utils/assistant-notification.ts` / `web/public/notification-sw.js` — AI 回答完成后的浏览器系统通知；文字回答使用去除 Markdown 后的正文摘要，文生图显示“你的图片已生成”，点击通知聚焦并返回对应对话

#### 语音输入流程

- 产品边界：麦克风是文本输入方式，流程固定为“浏览器录音 → ASR 转文字 → 回填输入框”。转写成功不创建 Conversation 或 Message；只有用户点击发送时，才由现有发送流程按需创建会话并持久化消息。
- 鉴权与路由：ASR 会产生模型调用成本，因此 `/api/audio/transcribe` 必须保留登录鉴权、文件大小限制和有效语音校验，但不得要求 `conversationId`、校验会话归属或写入会话数据。
- 路由边界：语音转写只保留 `/api/audio/transcribe`，不要在消息或会话路由下增加别名；ASR 与 Conversation、Message 生命周期无关。

#### 回答完成通知流程

- 通知权限必须在用户点击发送或编辑后重新生成的同步调用栈中申请，避免生成结束后申请被浏览器拦截；同一页面会话最多主动询问一次，权限仍为 `default` 时刷新页面后允许用户再次触发申请，拒绝后不得重复打扰。
- 只在 SSE 收到 `assistant-done` 且最终消息状态为 `completed` 时通知；取消、失败和普通流式 delta 不通知。文字通知正文使用 `markdownToPlainText()` 清理并截断，图片消息根据 `Message.type === 'image'` 使用固定生成完成提示。
- 优先通过无缓存逻辑的 `notification-sw.js` 调用 `ServiceWorkerRegistration.showNotification()`，不支持 Service Worker 时回退 `new Notification()`；通知点击后聚焦已有 MalouChat 窗口并导航回生成完成时的对话地址。
- 该能力依赖 HTTPS/localhost、用户授权及浏览器仍有可运行页面或 Service Worker，不是服务端 Web Push；浏览器完全关闭、系统禁止通知或未授权时不得声称一定能送达。

#### SSE 流式传输流程

- 分层职责：`web/src/api/sse.ts` 只负责字节解码、SSE 分帧和连接级校验；`web/src/api/chat.ts` 负责业务 payload 的运行时校验、事件分发和终止状态判断，不要把协议底层解析重新散落到业务层。
- 响应式性能：正文与深度思考 delta 必须先在普通变量中累积，再由 `requestAnimationFrame` 每帧批量更新一次 Zustand；不要按 token 直接触发 store 更新。`ChatView.tsx` 的自动滚动 Effect 只依赖最后一条消息的流式字段，不要订阅整个消息树的深层变化。
- 终止语义：每次流式请求在 EOF 前必须收到 `assistant-done`、`assistant-cancelled` 或 `assistant-failed` 之一；连接直接结束但没有终止事件时按断流处理，不能误判为成功。
- 连接保活：后端流式接口通过 `startSseHeartbeat()` 每 15 秒发送 `: ping`；所有启动心跳的 controller 都必须在 `finally` 中清理 timer，避免请求结束后仍持有资源。
- 渲染安全与缓存：用户消息始终通过 JSX 文本节点渲染；只有经过现有 Markdown 净化流程的助手内容可以使用 `dangerouslySetInnerHTML`。Markdown 缓存应随当前会话消息清理，不能无限保留跨会话历史内容。

#### 流任务生命周期与中断恢复

- 任务与订阅分离：浏览器刷新、关闭页面、切换会话或离开 Chat 时，只能断开当前 SSE 订阅，不能因此调用后端任务的 `AbortController`。只要后端进程仍在运行，`activeStreamTasks` 中的生成任务应继续执行并持续持久化消息。
- 任务建立顺序：`streamMessage()` 必须先在事务中持久化用户消息、空的 `generating` 助手消息和附件绑定，再把任务登记到 `activeStreamTasks` 并回传 SSE 消息事件；图片视觉分析、知识库上下文、项目提示词、历史和模型配置属于任务内部准备阶段。这样侧栏从发送开始即可展示 Loading，且准备阶段刷新/切换会话后仍可通过助手消息 ID 恢复订阅。
- 重新进入恢复：`selectConversation()` 先从数据库加载消息，再由 `resumeStreamIfNeeded()` 对仍为 `generating` 的助手消息重新订阅；后端 `subscribeMessageStream()` 命中活动任务时通过 `subscribeToTask(..., { replayAssistantMessage: true })` 重放已生成内容并继续推送。如果任务在离开期间已结束，则直接展示数据库中的最终消息。
- 手动停止语义：只有用户明确点击停止时才设置 `cancelRequested` 并触发任务 `AbortController`。`cancelMessageStream()` 必须等待 `task.completion`，确认 `cancelled` 终态已经落库后再响应；如果用户在首个 `assistant-message` 到达前停止，前端应断开订阅并短暂轮询会话详情，取得刚持久化的 `generating` 助手消息 ID 后调用同一取消接口，不能只撤销本地气泡。前端在 `isStopping` 期间继续锁定输入和发送按钮，不能在旧任务尚未结束时启动下一轮。停止接口失败时，当前会话应重新加载并恢复订阅，而不是静默丢失仍在生成的回答。
- 工具链取消：`ToolRuntimeContext.signal` 要继续传递给模型工具、MCP、第三方 `fetch` 和 R2 上传；通用工具执行器使用 promise/abort 竞速兜底。取消异常必须继续向上抛出，不能被转换成普通 `ToolMessage`，否则已停止的任务可能继续生成后续回答。
- 单问单答与消息归位：发送入口需要跨异步任务建立阶段的 in-flight 互斥，并在 `isStopping` 时拒绝发送。未知助手消息不能直接追加到数组末尾，应按 `createdAt` 插入；停止请求等异步结果写入 store 前必须核对 `activeConversationId`，避免切换会话后把旧回答插入当前对话。
- 侧栏执行状态：会话摘要的 `isGenerating` 来自最近一轮助手消息状态；前端收到生成开始/终止事件时立即更新本地摘要。切换会话会解绑旧 SSE，因此只在列表中存在 `isGenerating` 会话时启动单定时器低频轮询，全部结束后立即停止，确保非当前会话的 Loading 图标也能及时消失。
- 快速切换会话：`ChatView.applyRouteState()` 和 `chatStore.selectConversation()` 都必须遵循 latest-wins。路由应用使用递增序号和 `route.fullPath` 快照，旧流程在 `await` 后不得再 `router.replace`；会话详情加载要取消上一请求，并在写入消息、知识库选择和恢复流订阅前校验 selection 序号、请求 controller 与 `activeConversationId`，防止 A/B 请求乱序造成路由循环或消息串台。
- 服务重启边界：当前生成任务只保存在进程内存的 `activeStreamTasks` 中，因此支持浏览器刷新、页面退出和会话切换后的恢复，但不支持后端进程重启后续跑。后端重启后发现数据库中孤立的 `generating` 消息，应标记为失败；若要跨进程恢复，需要另行引入 Redis/数据库持久化任务队列。
- 文生图异常：`drawImageTool` 对供应商限流、鉴权失败和服务异常返回简洁中文提示，不把原始英文错误、供应商错误详情或帮助链接直接展示给用户。限流提示应明确本次没有生成图片，并建议稍后重试。

#### 深度思考流程

- 开关位置：前端 `MessageComposer.tsx` 提供深度思考开关，状态只持久化到 localStorage；后端不读用户表偏好，每次以消息请求里的 `deepThinkingEnabled` 为准。
- 请求字段：`web/src/types/chat.ts` / `web/src/api/chat.ts` 的 `CreateMessageInput.deepThinkingEnabled` 传到 `server/src/modules/messages/message.schema.ts`，同步和流式消息都要支持。
- 模型调用：`server/src/lib/ai.ts` 使用 LangChain `ChatOpenAI`，通过 `modelKwargs: { enable_thinking: true|false }` 传阿里云非标准参数。Qwen 混合思考模型在关闭时也要显式传 `false`，避免模型默认开启。
- 思考内容来源：只使用模型 stream raw response 里的 `choices[0].delta.reasoning_content`，不要用第二次 LLM 调用或后端自造 prompt 模拟“思考过程”。
- SSE 协议：后端可下发 `assistant-reasoning-start`、`assistant-reasoning-delta`、`assistant-reasoning-done`。`assistant-reasoning-start` 只能在收到第一段真实 `reasoning_content` 后发送；如果模型未返回 reasoning，记录 `[deep-thinking] reasoning-empty`，前端不要展示空思考块。
- 持久化：`Message.reasoningContent` 和 `Message.deepThinkingEnabled` 永久保存，历史消息可随时展开查看；但组装后续 `conversationHistory` 时仍只把最终回答 `content` 作为 assistant 历史，不把 `reasoningContent` 传回模型。
- 流式竞态：思考完成时只做普通 `persistTaskMessage(task)`；不要在正文还在流式追加时调用 `persistTaskMessage(task, true)`，否则 force 分支会用 DB 旧快照覆盖内存消息，导致最终回答开头被截断。
- 断流恢复：`subscribeToTask()` 重放思考事件时，必须先确认 `task.reasoningContent` 非空；不要仅凭 `deepThinkingEnabled` 重放 `assistant-reasoning-start`。
- 前端展示：`MessageList.tsx` 只在 `reasoningStatus === 'thinking'` 或 `reasoningContent.trim()` 非空时展示思考块；`reasoning-done` 且内容为空时自动隐藏，不能继续显示“正在整理深度思考内容...”。
- 工具/附件结合：深度思考包裹主模型的 tool calling 编排，不绕过工具。图片、文件、知识库先被整理为 `fileContext` / `knowledgeBaseContext` 注入 system prompt；模型再在开启 deep thinking 的同一次调用里基于这些上下文思考和回答。前端不展示具体工具调用 chip，工具状态只用于内部流控；如果工具调用期间还没有任何可展示内容，最多显示通用“正在处理...”占位。

### 4. 长期记忆管理（手动 + 自动提取）

- `server/prisma/schema.prisma` → `Memory` 模型（类型：`profile|preference|summary|fact`）
- `server/src/modules/memories/memory.{routes,controller,service}.ts` — 记忆手动 CRUD
- `server/src/lib/memory-graph.ts` — LangGraph 编排自动记忆提取
- `server/src/lib/ai.ts` → `generateMemoryCandidates()` — LLM 记忆候选提取
- `web/src/views/MemoryView.tsx` — 记忆管理页面；支持编辑记忆类型、key 和内容，以及删除记忆
- `web/src/stores/memory.ts` — Zustand 记忆状态管理
- `web/src/api/memory.ts` — 记忆 API
- `web/src/types/memory.ts` — 记忆类型定义

### 5. LLM 切换

- `server/prisma/schema.prisma` → `AiModel` 模型统一保存对话、向量、多模态、语音和文生图模型配置；每类能力必须保留一个启用的默认模型
- `server/src/lib/model-registry.ts` — 带短时缓存的运行时模型注册表；数据库暂不可用时提供内置安全回退
- `server/src/modules/admin-models/admin-model.{routes,controller,service,schema}.ts` — 仅管理员可用的模型配置 CRUD；默认模型不可直接停用或删除；`POST /api/admin/models/chat/apply-to-all` 可将所有用户的模型偏好批量切换到指定对话模型
- `server/prisma/schema.prisma` → `User.preferredModel` 用户偏好字段
- `server/src/modules/model-preferences/model-preference.{routes,controller,service}.ts` — 模型偏好管理
- `web/src/components/chat/ChatSettingsDialog.tsx` — 设置弹窗中的模型选择器 UI
- `web/src/views/AdminView.tsx` — `/admin` 响应式后台模型管理页；页面分为多模型的对话模型区和单模型的专用能力区；对话模型通过 Sortable 拖拽并批量保存 `sortOrder`，用户模型列表按相同顺序展示；文生图尺寸、提示词扩展和水印也在这里管理
- `web/src/api/model-preference.ts` — 模型偏好 API
- `web/src/types/chat.ts` → `ModelInfo` 类型

### 5.1 用户偏好（语调风格）

- `server/prisma/schema.prisma` → `User.speechStyle` 用户回答风格偏好字段（默认 `default`）
- `server/src/lib/speech-style.ts` — 可选语调风格列表与轻量 system prompt 片段（默认、专业可靠、亲和友善、直言不讳、天马行空、高效务实、吐槽达人）
- `server/src/modules/user-preferences/user-preference.{routes,controller,service,schema}.ts` — 用户偏好 API（风格列表、查询当前风格、更新风格）
- `server/src/lib/ai.ts` — 组装 LLM system prompt 时注入当前用户的语调风格提示，提示词占比较轻，不覆盖工具/记忆/文件上下文规则
- `web/src/components/chat/ChatSettingsDialog.tsx` — 设置弹窗中“基本风格和语调”选择器；左侧设置导航作为右侧内容锚点，随滚动高亮
- `web/src/api/user-preference.ts` — 用户风格偏好 API
- `web/src/types/auth.ts` / `web/src/stores/auth.ts` — 当前用户信息包含并同步 `speechStyle`

### 6. MCP & Tools

- `server/src/lib/mcp.ts` — MCP 客户端封装
- `server/src/lib/tools/tools.ts` — 工具注册入口（webSearch、drawImage、readFile、semanticSearch、getUserLocation）
- `server/src/lib/tools/webSearch.ts` — 联网搜索工具（DashScope MCP）
- `server/src/lib/tools/userLocation.ts` — 用户位置工具；通过通用 client tool 协议请求前端执行 `getBrowserLocation`，拿到经纬度后调用高德逆地理编码 API，返回国家/省/市/区拼接结果（如“中国上海闵行区”）
- `server/src/lib/tools/drawImage.ts` — 图片生成工具（DashScope API + Cloudflare R2 存储；`buildToolResponse` 仅返回图片 markdown，不附带文字）
- `server/src/lib/tools/readFile.ts` — 文件读取工具（LLM 按需调用读取上传文件内容；兼容 `fileId` 和 `file_path` 参数；通过 `ToolRuntimeContext` 校验当前用户与会话，禁止跨会话/跨用户读取）
- `server/src/lib/tools/semanticSearch.ts` — 语义检索工具（RAG，大文件中搜索相关片段；检索前校验当前用户/会话与文件索引状态）
- `server/src/lib/tool-context.ts` — request-scoped 工具上下文；把 `userId` / `conversationId` / `requestClientTool()` 注入后端工具执行过程，支持工具权限校验与暂停等待前端浏览器能力结果
- `server/src/lib/ai.ts` — 工具调用主逻辑（多轮 tool calling 循环；工具按顺序执行；位置相关实时问题提示模型先调 `getUserLocationTool`，再按需调 `webSearchTool`；`drawImageTool` 成功返回 storageKey 图片结果后 short-circuit，跳过 LLM 后续文字生成）
- 工具对外表达边界：工具标识、函数名、参数 schema、数量、调用轮次和内部状态只用于后端编排，不向最终用户披露。用户询问能力或可调用工具时，助手只用自然语言概括联网查询、图片生成、文件理解、位置服务等能力和授权要求，不输出内部名称清单。
- `server/src/config/env.ts` — `DASHSCOPE_API_KEY` / `AMAP_API_KEY` / `OPENAI_API_KEY` / `OPENAI_BASE_URL` 等环境变量

#### Client Tool / 浏览器能力桥接

- 适用场景：后端工具执行时需要浏览器侧能力（如地理定位），不能由前端正则猜测触发，必须由大模型在后端工具链中主动调用工具。
- 协议：后端工具通过 `requestClientTool(toolName, params)` 暂停等待；消息流 SSE 下发 `client-tool-request`；前端 `web/src/api/chat.ts` 解析事件，`web/src/stores/chat.ts` 调用 `web/src/utils/client-tools.ts` 执行浏览器能力，再 POST `/:messageId/client-tool-result` 回传结果。
- 当前实现：`getUserLocationTool` → 前端 `getBrowserLocation` 调用 `navigator.geolocation.getCurrentPosition()` → 后端 `server/src/lib/tools/userLocation.ts` 用 `AMAP_API_KEY` 调高德逆地理编码 → 返回国家/省/市/区给 LLM。
- 扩展新浏览器能力时：在 `web/src/utils/client-tools.ts` 注册新的 `toolName` handler，在后端工具中通过 `server/src/lib/tool-context.ts` 获取 `requestClientTool()`；保持 requestId 幂等，前端已有 in-flight 去重。

### 7. 公共基础设施

- `server/src/app.ts` — Express 应用配置（中间件、路由挂载）
- `server/src/main.ts` — 服务启动入口
- `server/src/modules/index.ts` — API 路由总入口，统一挂载 `/api`
- `server/src/lib/prisma.ts` — Prisma 客户端单例
- `server/src/config/env.ts` — 环境变量读取与校验
- `server/src/middlewares/error.ts` — 全局错误处理
- `server/src/middlewares/validate.ts` — Zod 参数校验中间件
- `server/src/utils/http.ts` — HTTP 响应封装
- `server/src/utils/app-error.ts` — 自定义错误类
- `server/src/utils/obs.ts` — Cloudflare R2 存储封装（基于 `@aws-sdk/client-s3`；`putObject` 下载后上传、`formUpload` 本地文件上传、`deleteObject` 删除、`getPresignedUrl` 生成预签名 URL、`buildFileApiUrl` 构建 `/api/files/url?key=` 临时访问地址；文件访问 token 按 7 天窗口稳定生成，配合浏览器私有缓存）
- `server/Dockerfile` — 生产环境 Docker 镜像（多阶段构建，最终镜像仅含 dist + node_modules）
- `web/Dockerfile` / `web/nginx.conf` — 前端 Docker 镜像（React 构建产物由 Nginx 托管，/api 反向代理到 server）
- `docker-compose.yml` — 一键部署编排（server:5172 + web:80）
- `web/src/main.tsx` — 前端入口（挂载 React、Ant Design App、React Router，并导入 highlight.js CSS 主题）
- `web/src/App.tsx` — 根组件
- `web/src/views/ChatView.tsx` 内置的 `chat-startup-skeleton` — 仅供 Chat 路由代码和首次会话/项目初始化使用的全屏骨架屏；非 Chat 路由启动使用 `App.tsx` 的中性 Spin，各业务页面继续使用自己的局部 Skeleton/Spin
- `web/src/App.tsx` 的 `AuthenticatedShell` 在用户首次进入聊天路由后常驻挂载唯一的 `ChatView` 实例，访问其他路由时只用 CSS 隐藏；只有退出登录或切换用户才卸载。返回时沿用 shell 记录的最后聊天路由，不重复执行 Chat 初始化，并保留 DOM、输入框和滚动状态
- Chat 从其他路由重新显示时静默刷新知识库、可选模型和语调风格；删除知识库、退出团队或设为私有等可能解除会话绑定的操作会将知识库 store 标记为 dirty，并在返回 Chat 时额外静默刷新会话摘要。知识库轮询由全局 store 持有，无处理项时自动停止；退出登录时由 `reset.ts` 统一重置所有用户态 store 和 timer
- `web/src/router/index.tsx` — 路由配置
- `web/src/hooks/useMobile.ts` — 响应式移动端 hook，支持自定义断点，基于 `matchMedia` 自动订阅变化
- `web/src/components/navigation/AppSidebarShell.tsx` / `web/src/components/management/ManagementSidebar.tsx` / `ManagementSidebarToggle.tsx` — Chat 与四个管理页面共用统一左侧外壳和移动抽屉；管理页面通过 props 向中间槽提供概览、统计或锚点导航，顶部三条管理入口根据当前路由高亮
- `web/src/api/http.ts` — fetch 封装（自动注入 Access Token、携带 Refresh Cookie、401 单例刷新与原请求重试、刷新失败清理会话）

### 8. 文件上传与 AI 处理

- `server/prisma/schema.prisma` → `FileUpload` 是唯一文件资产，`source` 区分上传与文生图；`FileConversationReference` 负责一个资产到多个会话/消息的引用，旧 `conversationId/messageId` 字段只保留兼容；`ConversationDraft.fileUploadId` 可一对一引用未发送附件；`FileChunk` 模型用于 RAG 分块。输入框移除附件只能解除当前 pending/draft 引用，禁止直接删除 `FileUpload` 或对象存储
- `server/src/modules/files/file.{routes,controller,service}.ts` — 文件 CRUD（上传到 Cloudflare R2、查询 pending 文件、删除同时清 R2）；普通文件接口只返回/接收 `storageKey`，`POST /files/url` 按 `storageKey + mode(preview|download)` 批量兑换临时地址，`GET /files/url?key=` 是临时地址的 302 跳转入口（7天有效期，浏览器私有缓存7天）
- `server/src/modules/files/rag.service.ts` — RAG 服务：`processFileForRAG()` 异步分块+向量化存储、`searchChunks()` cosine 相似度检索
- `server/src/modules/files/file-reference.service.ts` — 附件 pending、草稿迁移、消息落库和输入框解除引用的统一边界；复用资产不得改写或删除其他会话的历史引用。同一附件在同一会话只能有一条 pending 引用，由数据库部分唯一索引和服务端 `P2002` 幂等处理共同兜底
- `server/src/modules/files/cleanup.service.ts` — 孤文件清理（7 天前且未被消息、`ConversationDraft` 或 `FileConversationReference` 引用的文件自动删除）
- `server/src/modules/library-assets/library-asset.service.ts` / `web/src/views/LibraryAssetView.tsx` — 资料库把草稿附件的关联会话显示为“新建会话”，并展示同一资产关联的全部会话。物理删除只能从资料库显式发起，服务端必须在事务中检查草稿、兼容字段、引用表、消息快照和知识库附件，任何引用存在时均拒绝删除
- `server/src/lib/parseFile.ts` — 文本文件内容提取（50+ 种扩展名，<100KB 提取，含二进制检测）
- `server/src/lib/vision.ts` — 多模态图片分析（调用多模态模型，返回图片描述用于注入 LLM 上下文）；`scheduleVisionAnalysis()` 上传时异步缓存通用 `visionDescription`，避免重复分析；发送消息时 `buildFileContext()` 可把用户本轮问题传给 `analyzeImage(url, userPrompt)` 做 request-aware 分析，该结果只用于本轮上下文，不覆盖通用缓存
- `server/src/lib/tools/readFile.ts` — `readFileTool`，LLM 按需读取上传文件文本内容；只能访问当前用户当前会话下的文件
- `server/src/lib/tools/semanticSearch.ts` — `semanticSearchTool`，LLM 在大文件中做语义检索；只能访问当前用户当前会话下且索引完成的文件
- `server/src/lib/tools/tools.ts` — 工具注册入口
- `server/src/lib/embeddings.ts` — 使用后台配置的默认向量模型生成 1024 维向量（3 次指数退避重试，批量索引时限制并发）
- `server/src/lib/chunker.ts` — 文本分块（500 字/块、80 字重叠，按标题+表格+段落边界切分）
- `server/src/utils/message-files.ts` — `serializeMessageForClient` 优先读 DB `fileList` 字段（长期快照只存/只返回 `storageKey` 等稳定元数据），然后从 content 中扫描 markdown 图片/链接提取历史 `storageKey`；`ClientMessage` 新增 `type` 字段
- `web/src/components/chat/MessageComposer.tsx` / `ComposerAttachmentPreview.tsx` — 底部上传按钮通过下拉菜单选择文件/图片；附件卡片展示在输入框左上角，上传进度使用圆形进度环；最多一个附件
- `web/src/api/file.ts` — 文件上传（XMLHttpRequest 带进度）、删除、查询 pending 文件、批量兑换临时文件地址
- `web/src/utils/file-url-resolver.ts` — 前端统一文件 URL resolver；组件只传 `storageKey`，内部以 50ms 窗口聚合多组件请求，批量调用 `POST /api/files/url` 后分发预览/下载地址，并做内存缓存
- `web/src/types/chat.ts` → `MessageFile` 类型（含 id/name/storageKey/kind/size；不含 url）；`Message` 类型新增 `type` 字段（`text|image`）

#### 文件处理策略

- **图片**：上传后异步做通用多模态分析并缓存 `visionDescription`；发送消息时优先结合用户本轮文本做 request-aware 图片分析（如地点识别、OCR、图片优化/P 图诉求），结果注入 system prompt 但不写回 `visionDescription`；如果本轮分析失败则回退到通用缓存；即使视觉分析失败，也会向 LLM 明确说明本轮存在图片附件，避免误答“没有收到图片”
- **小文本文件**（<100KB，截至 20000 字）：上传时提取文本存 `textContent` → 发送时直接注入 system prompt
- **PDF 文件**（≤ 50MB）：上传时用 `pdf-parse` 提取文本存 `textContent`
- **DOCX 文件**（≤ 20MB）：上传时用 `mammoth` 提取文本存 `textContent`
- **XLSX 文件**（≤ 20MB）：上传时用 `xlsx` 提取所有 sheet 为 CSV 格式文本
- **大文件**（>2000 字提取文本）：上传后异步分块（500字/块）→ 限并发生成 Embedding → 存入 pgvector → LLM 通过 `semanticSearchTool` 检索相关片段；索引未完成/失败时 system prompt 只提供摘录并禁止调用语义检索
- **文件访问**：除 `POST /api/files/url` 批量兑换接口会返回临时预览/下载地址外，前后端普通业务接口只交互 `storageKey`，数据库也只把 `storageKey` 作为长期文件标识；前端渲染时通过 `file-url-resolver` 以 50ms 窗口聚合请求，批量兑换 `/api/files/url?key=` 临时地址（7天有效，访问 token 按 7 天窗口稳定生成，浏览器私有缓存7天）

#### RAG 系统架构

```
上传文件 → 提取文本(textContent)
              ↓
    scheduleRagProcessing（后台异步）
              ↓
    chunkText() → generateEmbedding() → 存入 FileChunk 表
              ↓
用户提问 → LLM 判断需要文件信息
              ↓
    调用 semanticSearchTool({"fileId", "query"})
              ↓
    searchChunks() → pgvector cosine 相似度检索 → 返回 Top-5 片段
              ↓
    LLM 结合片段和用户问题生成回答
```

### 9. 知识库管理（私有 / 团队共享 / 编辑重建索引 / 对话引用）

- `server/prisma/schema.prisma` → `KnowledgeBase` 模型（title/content/attachmentName/storageKey/storageUrl/indexingContent/processingStatus/visibility）；`KnowledgeBaseChunk` 模型（向量分片）；`KnowledgeBaseMember` 团队成员表；`KnowledgeBaseInvitation` 邀请表
- `server/src/modules/knowledge-bases/knowledge-base.{routes,controller,service}.ts` — 知识库 CRUD（列表、创建含附件上传、编辑标题/内容/重新上传附件、删除）；编辑接口为 `PATCH /api/knowledge-bases/:id`，知识库 id 保持不变，内容或附件变化后重新进入索引队列；团队接口包含成员列表、邀请成员、移除成员、退出团队知识库、邀请列表、接受/拒绝邀请；知识库附件支持 txt/docx，TXT/Word 上限 20MB，`indexingContent` 最多保留 2,000,000 字符
- `server/src/modules/knowledge-bases/knowledge-base-rag.service.ts` — `processKnowledgeBaseForRag()` 异步分块+向量化、`searchKnowledgeBaseChunks()` cosine 相似度检索；重建索引时按稳定 chunk id 对比内容，只对变化的 chunk 重新生成 embedding，删除多余旧 chunk，避免小改动时全量替换向量；`preserveCompletedStatus` 用于旧索引后台修复时不把已完成知识库切回 processing/failed
- `server/src/modules/knowledge-bases/knowledge-base.schema.ts` — Zod 校验（title 必填 max120、content 必填 max1000、visibility 为 `private|team`、邀请 userIds）
- `server/src/modules/users/user.{routes,controller,service}.ts` — 用户搜索接口 `GET /api/users/search?q=`，按用户名/邮箱模糊搜索，排除当前用户，只返回 id/username/email，用于团队知识库邀请
- `server/src/modules/conversations/conversation.{schema,service}.ts` — 创建/复用空会话时支持 `knowledgeBaseId`，私有知识库只允许 owner 绑定，团队知识库允许 owner 和已接受邀请的 member 绑定
- `server/src/modules/messages/message.service.ts` — `buildKnowledgeBaseContext()` 在发送消息时注入知识库上下文（小文本直接带全文，大文本走语义检索）；访问校验同时支持 owner 和 team member
- `server/src/modules/messages/message.{routes,controller,service}.ts` — `POST /api/conversations/:conversationId/messages/stream` 在同一入口先完成会话归属、生成中消息和知识库权限/状态校验，再持久化问答占位并启动可恢复任务；不再保留独立的 `messages/check` 预检接口，避免校验与任务持久化之间出现刷新空窗
- `server/src/modules/messages/message.schema.ts` → `createMessageBodySchema` 的 `knowledgeBaseId` 字段用于 `messages/stream`
- `web/src/router/index.tsx` — `/knowledge-bases` 知识库管理页路由，需登录
- `web/src/App.tsx` — 登录态恢复后拉取知识库邀请；如果有待处理邀请，弹出全局 dialog，展示邀请人和知识库名，支持同意/拒绝；同意后刷新知识库列表
- `web/src/views/KnowledgeBaseView.tsx` — 知识库管理页面（PC 双栏、移动端抽屉）；访客点击页头或空状态的“新建”时由前端统一拦截并友好提示注册/登录正式账号；卡片点击查看详情，footer 省略号菜单按角色展示操作：owner 可更新、设为私有/团队、邀请用户、管理成员、删除；member 只能退出团队知识库；编辑时复用弹窗提交 `PATCH`，更新成功后静默刷新列表并继续轮询处理状态
- `web/src/components/chat/ChatSidebar.tsx` — 聊天侧栏“知识库”入口，放在“管理记忆”按钮下方，只负责跳转新页面和展示数量
- `web/src/types/knowledge-base.ts` — `KnowledgeBaseRecord` / `KnowledgeBaseStatus` / `KnowledgeBaseVisibility` / `KnowledgeBaseRole` / `KnowledgeBaseMember` / `KnowledgeBaseInvitation` / `CreateKnowledgeBaseInput` / `UpdateKnowledgeBaseInput` 类型
- `web/src/types/user.ts` / `web/src/api/user.ts` — 前端用户搜索类型和 API
- `web/src/api/knowledge-base.ts` — 知识库 API（fetch/create/update/delete/updateVisibility/members/invite/removeMember/leave/invitations/accept/reject，创建和更新均用 FormData）；邀请接口返回 `createdCount`、`skippedMemberCount`、`skippedInvitationCount`，前端据此提示已在团队或已有待处理邀请
- `web/src/stores/knowledge-base.ts` — Zustand store（列表/选中/轮询状态/CRUD；状态为 `queued|processing|completed|failed` 时自动 3s 轮询；`loadKnowledgeBases()` 使用请求序号丢弃过期响应，避免手动刷新和轮询并发时旧数据回写）
- `web/src/components/knowledge/KnowledgeBaseEditorModal.tsx` — 新建/更新弹窗（标题+内容+私有/团队状态+附件 txt/docx；编辑时展示当前附件，可重新上传替换）
- `web/src/components/knowledge/KnowledgeBaseDetailModal.tsx` — 知识库详情弹窗（标题、内容、附件、状态、时间）
- `web/src/components/chat/MessageComposer.tsx` — 选中知识库后显示知识库标签+移除按钮
- `web/src/stores/chat.ts` / `web/src/api/chat.ts` — 发送时先插入临时用户消息并直接调用 `messages/stream`；stream 在持久化前校验失败时撤销临时消息，若错误码为 `KNOWLEDGE_BASE_NOT_ACCESSIBLE` 则清空当前知识库选择并刷新知识库/会话列表；SSE error 保留 `errorCode` 用于业务错误恢复

#### 知识库可见性和权限

- `private`：仅创建者能列表可见、详情可见、对话引用、更新、删除。
- `team`：创建者仍是 owner；被邀请用户同意后写入 `KnowledgeBaseMember`，成为 member。member 可以在列表看到该知识库、在对话中引用、退出团队知识库，但不能更新、删除、邀请、踢人或管理成员。
- owner 从 `team` 切回 `private` 时，后端清空该知识库成员和待处理邀请；被踢或主动退出时，后端会把该用户绑定该知识库的会话 `knowledgeBaseId` 置空，避免后续继续引用无权限知识库。
- 邀请流程使用 `KnowledgeBaseInvitation`：owner 发送邀请 → 被邀请用户登录/恢复会话后全局弹窗展示邀请 → 同意则 upsert 成员并删除邀请，拒绝则只删除邀请。
- 对话发送由 `messages/stream` 单入口在持久化前校验知识库权限和状态；校验失败时展示后端友好文案并撤销前端临时消息，校验成功则立即持久化问答占位，避免独立预检与任务建立之间的状态空窗。

#### 知识库状态流转

`queued` → `processing` → `completed` / `failed`

创建或编辑后立即返回。后端异步处理：提取附件文本 → 合并标题+介绍+附件 → 分块(每块500字，80 字 overlap；超长段落强制按窗口切分) → 对新增/变化 chunk 生成向量 → upsert 到 `KnowledgeBaseChunk` 表 → 删除已不存在的旧 chunk。前端通过轮询（3 秒间隔）更新状态；进入知识库页或聊天页会加载列表，离开页面会清理当前 store 轮询 timer，下一个页面挂载后重新调度。

#### 知识库索引和截断策略

- 新知识库/更新知识库会把 txt/docx 附件抽取为文本，合并 `标题/介绍/附件名/附件文本` 写入 `KnowledgeBase.indexingContent`；当前索引内容上限是 2,000,000 字符，不要再恢复旧的 120,000 字符限制，否则长篇知识库后半部分会完全无法检索。
- 历史上创建过的旧知识库可能已经被截断到约 120,000 字符。`buildKnowledgeBaseContext()` 会在引用时检测这种旧截断数据：如果存在 `storageKey` 和附件名，会从本地/R2 读取原附件重新抽取文本，更新 `indexingContent`，并用 `processKnowledgeBaseForRag(id, { preserveCompletedStatus: true })` 静默重建向量索引；本轮请求直接使用恢复后的全文参与检索。
- 如果旧知识库附件对象已丢失，无法自动恢复，只能通过更新知识库重新上传附件。
- `searchKnowledgeBaseChunks()` 以用户最新问题作为检索 query；返回结果会尽量补满 topK，不再因为相似度阈值过严只给 1 个 chunk。短词、昵称、别名类问题（如“胖子指的是谁”）还会走本地关键词兜底，把包含字面关键词的片段补进 context，避免向量检索返回了足量但没命中字面词。
- 排查 owner/member 回答不一致时，先确认两边是否同一个 `knowledgeBaseId`、`chunkCount`、`contextContains...`。曾出现过的根因是旧知识库被截断，owner 答对是模型常识，member 按上下文保守回答导致暴露问题；不要先假设是团队权限差异。

#### 知识库编辑流程

```
用户在 /knowledge-bases 点击卡片省略号 → 更新 → 修改标题/内容/可选替换附件
                            ↓
PATCH /api/knowledge-bases/:id（FormData）
                            ↓
后端校验归属用户，复用旧附件文本或解析新附件，重建 indexingContent
                            ↓
内容未变化且非 failed → 保持当前状态；内容变化或原状态 failed → queued 并异步 processKnowledgeBaseForRag()
                            ↓
前端静默刷新列表，若仍 queued/processing 则继续 3 秒轮询
```

#### 团队邀请流程

```
owner 将知识库设为 team → 点击省略号「邀请用户」
              ↓
GET /api/users/search?q=用户名或邮箱 → 多选用户
              ↓
POST /api/knowledge-bases/:id/invitations
              ↓
被邀请用户进入系统 → App.tsx 拉取 GET /api/knowledge-bases/invitations
              ↓
同意：POST /api/knowledge-bases/invitations/:invitationId/accept → 写入 KnowledgeBaseMember
拒绝：POST /api/knowledge-bases/invitations/:invitationId/reject → 删除邀请
```

邀请 dialog 交互：搜索用户期间结果区和搜索按钮都展示 loading；发送邀请按钮有独立 loading。搜索结果只展示用户名和邮箱，不展示用户 id。后端邀请接口会跳过已在团队中的用户和已有待处理邀请的用户，并返回跳过数量；前端应分别给出“已在团队”或“已有邀请”的友好提示。

#### 对话引用知识库流程

```
用户选择已完成的知识库 → 无会话则创建/复用空会话并绑定 knowledgeBaseId → 发送消息(携带 knowledgeBaseId)
                            ↓
  streamMessage() 校验会话归属、知识库权限和状态并持久化问答占位
                            ↓
       可恢复任务调用 buildKnowledgeBaseContext()
                            ↓
              ┌─ 全文 ≤ 2400 字 → 直接注入全文
              └─ 全文 > 2400 字 → 必要时恢复旧截断索引 → searchKnowledgeBaseChunks()
                                     ↓
                           pgvector cosine 相似度检索
                                     ↓
                           返回 Top-6 片段 + 必要的本地关键词兜底片段
                                     ↓
                          合并为 context 注入 system prompt
```

## 架构图数据

> 该区块由 `scripts/generate-architecture-data.mjs` 读取，用于生成前端 `/architecture` 页面数据。修改核心模块、链路或关键文件时，请同步维护下面的 `architecture-json`，让 AGENTS.md 同时服务 AI 快速理解和前端架构可视化。

```architecture-json
{
  "version": 1,
  "title": "MalouChat 技术架构",
  "description": "从用户能感知的 AI 工作流，到前端、后端、数据存储和外部 AI 服务的实现链路，完整展示 MalouChat 的产品能力与技术架构。",
  "layers": [
    {
      "id": "product",
      "label": "业务 / 产品层",
      "description": "用户能直接感知的功能闭环：登录、会话管理、AI 对话、附件理解、长期记忆、知识库协作、个性化设置和管理员模型治理。"
    },
    {
      "id": "technical",
      "label": "技术实现层",
      "description": "支撑产品能力的工程实现：前端应用、后端 API、运行时模型管理、AI 编排、RAG、数据库、对象存储、外部模型和部署。"
    }
  ],
  "groups": [
    {
      "id": "product",
      "label": "用户感知能力",
      "color": "#0f766e"
    },
    {
      "id": "frontend",
      "label": "前端",
      "color": "#2563eb"
    },
    {
      "id": "backend",
      "label": "后端",
      "color": "#16a34a"
    },
    {
      "id": "ai",
      "label": "AI / RAG",
      "color": "#7c3aed"
    },
    {
      "id": "external",
      "label": "外部系统",
      "color": "#475569"
    }
  ],
  "nodes": [
    {
      "id": "product-entry",
      "label": "登录 / 注册入口",
      "layer": "product",
      "group": "product",
      "nodeType": "module",
      "summary": "用户可注册、登录或以可恢复访客身份进入系统，并恢复自己的 AI 工作台状态。",
      "details": "登录和注册共用一个认证入口页面；登录页同时提供访客登录，访客与正式用户共用相同 Token 有效期，并使用数据库递增展示名和浏览器高熵恢复密钥在会话过期后恢复原账号。前端路由守卫负责未登录重定向，认证状态由 Zustand、本地 token 和访客身份共同恢复。",
      "files": [
        "web/src/views/LoginView.tsx",
        "web/src/router/index.tsx"
      ],
      "tags": ["入口", "鉴权", "访客登录"]
    },
    {
      "id": "product-chat",
      "label": "AI 对话工作台",
      "layer": "product",
      "group": "product",
      "nodeType": "module",
      "summary": "用户围绕一个会话进行多轮提问，并实时接收 AI 流式回答。",
      "details": "聊天工作台是核心使用场景：左侧管理会话、知识库和记忆入口，中间展示消息和深度思考，底部输入区承载文本、附件、知识库引用、语音输入和发送控制。",
      "files": [
        "web/src/views/ChatView.tsx",
        "web/src/components/chat/ChatMainPanel.tsx",
        "web/src/components/chat/ChatSidebar.tsx",
        "server/src/modules/messages/message.service.ts"
      ],
      "tags": ["对话", "流式", "工作台"]
    },
    {
      "id": "product-conversation-management",
      "label": "会话管理",
      "layer": "product",
      "group": "product",
      "nodeType": "module",
      "summary": "用户可以按项目组织会话，也可以新建、置顶、重命名、删除和切换历史会话。",
      "details": "侧栏会话管理分为项目列表和普通对话列表。项目可配置 icon、颜色、标题和长期提示词，项目下的会话会自动携带项目提示词进入 LLM system prompt；一个项目可包含多个会话，一个会话最多属于一个项目。用户可通过拖拽或菜单 dialog 将普通会话加入项目、在项目间移动或移出到普通对话列表。",
      "files": [
        "web/src/components/chat/ChatSidebar.tsx",
        "web/src/components/chat/ChatSidebar.tsx",
        "web/src/components/chat/ChatSidebar.tsx",
        "web/src/components/chat/ProjectDialog.tsx",
        "web/src/stores/chat.ts",
        "web/src/stores/project.ts",
        "server/src/modules/projects/project.service.ts",
        "server/src/modules/conversations/conversation.service.ts"
      ],
      "tags": ["会话", "项目", "拖拽移动"]
    },
    {
      "id": "product-message-operations",
      "label": "消息操作",
      "layer": "product",
      "group": "product",
      "nodeType": "module",
      "summary": "用户可以编辑、复制、删除、重新生成消息，并查看深度思考内容。",
      "details": "消息列表支持用户对单条消息进行复制、编辑、删除和重新生成；AI 回答流式输出，深度思考内容以折叠块展示，断流后可恢复生成状态。",
      "files": [
        "web/src/components/chat/MessageList.tsx",
        "web/src/stores/chat.ts",
        "server/src/modules/messages/message.service.ts"
      ],
      "tags": ["消息", "编辑", "重新生成"]
    },
    {
      "id": "product-ai-capabilities",
      "label": "AI 多能力助手",
      "layer": "product",
      "group": "product",
      "nodeType": "module",
      "summary": "AI 不只聊天，还能联网搜索、生成图片、理解位置和使用上下文工具。",
      "details": "当用户询问实时信息时可触发联网搜索；要求画图时可生成图片；询问天气、周边、本地活动时可通过浏览器定位和高德地图理解位置；同时可以结合附件、知识库、长期记忆和回答风格生成回答。",
      "files": [
        "server/src/lib/ai.ts",
        "server/src/lib/tools/webSearch.ts",
        "server/src/lib/tools/drawImage.ts",
        "server/src/lib/tools/userLocation.ts",
        "web/src/utils/client-tools.ts"
      ],
      "tags": ["联网搜索", "图片生成", "位置感知"]
    },
    {
      "id": "product-files",
      "label": "附件理解",
      "layer": "product",
      "group": "product",
      "nodeType": "module",
      "summary": "用户上传文件或图片，AI 在本轮对话里理解附件内容。",
      "details": "支持文本、PDF、DOCX、XLSX、图片等附件；小文本直接进入上下文，大文本进入语义检索，图片会做多模态分析。",
      "files": [
        "web/src/components/chat/MessageComposer.tsx",
        "server/src/modules/files/file.service.ts",
        "server/src/lib/vision.ts"
      ],
      "tags": ["附件", "图片理解", "文件问答"]
    },
    {
      "id": "product-memory",
      "label": "长期记忆管理",
      "layer": "product",
      "group": "product",
      "nodeType": "module",
      "summary": "用户管理个人记忆，AI 也能从对话中自动沉淀信息。",
      "details": "记忆模块让 AI 不只回答当前问题，也能长期理解用户画像、偏好、事实和摘要；用户可以手动管理记忆，后端也会在对话结束后自动判断是否值得记住。",
      "files": [
        "web/src/views/MemoryView.tsx",
        "web/src/stores/memory.ts",
        "server/src/modules/memories/memory.service.ts",
        "server/src/lib/memory-graph.ts"
      ],
      "tags": ["记忆", "个性化", "LangGraph"]
    },
    {
      "id": "product-preferences",
      "label": "个性化设置",
      "layer": "product",
      "group": "product",
      "nodeType": "module",
      "summary": "用户可以调整主题、默认模型和回答风格。",
      "details": "设置弹窗集中承载主题切换、模型偏好、回答语调风格和退出登录；模型和语调会影响后续 AI 回答，但不会改变会话历史。",
      "files": [
        "web/src/components/chat/ChatSettingsDialog.tsx",
        "web/src/stores/preferences.ts",
        "server/src/modules/model-preferences/model-preference.service.ts",
        "server/src/modules/user-preferences/user-preference.service.ts"
      ],
      "tags": ["模型", "语调", "主题"]
    },
    {
      "id": "product-model-admin",
      "label": "后台模型管理",
      "layer": "product",
      "group": "product",
      "nodeType": "module",
      "summary": "管理员统一维护用户可选模型和各项 AI 专用能力，不再依赖代码中的写死配置。",
      "details": "管理员通过 /admin 页面管理对话、向量、多模态、语音和文生图模型。对话模型支持多条配置、默认项、拖拽排序和一键切换全部用户；专用能力各保留一条当前配置，文生图同时管理默认尺寸、提示词扩展和水印。",
      "files": [
        "web/src/views/AdminView.tsx",
        "web/src/api/admin-model.ts",
        "server/src/modules/admin-models/admin-model.service.ts",
        "server/src/lib/model-registry.ts",
        "server/prisma/schema.prisma"
      ],
      "tags": ["管理员", "模型配置", "运行时生效"]
    },
    {
      "id": "product-knowledge-management",
      "label": "知识库管理",
      "layer": "product",
      "group": "product",
      "nodeType": "module",
      "summary": "用户独立管理知识库内容、附件、状态和可见性。",
      "details": "知识库是独立页面，不依附某个会话；正式用户 owner 可以创建、上传 txt/docx、编辑内容、重新上传附件、删除知识库，并在私有/团队之间切换，可见处理状态和详情；访客点击新建时前端会友好提示注册或登录正式账号。",
      "files": [
        "web/src/views/KnowledgeBaseView.tsx",
        "web/src/components/knowledge/KnowledgeBaseEditorModal.tsx",
        "web/src/components/knowledge/KnowledgeBaseDetailModal.tsx",
        "server/src/modules/knowledge-bases/knowledge-base.service.ts",
        "server/src/modules/knowledge-bases/knowledge-base-rag.service.ts"
      ],
      "tags": ["上传", "编辑", "RAG"]
    },
    {
      "id": "product-knowledge-collaboration",
      "label": "知识库团队协作",
      "layer": "product",
      "group": "product",
      "nodeType": "module",
      "summary": "团队知识库支持邀请、接受/拒绝、成员管理和退出。",
      "details": "owner 可以邀请用户加入团队知识库、管理成员和移除成员；被邀请用户登录后处理邀请，同意后可引用，拒绝则不加入；成员只能退出和引用，不能更新或删除。",
      "files": [
        "web/src/views/KnowledgeBaseView.tsx",
        "web/src/App.tsx",
        "server/src/modules/knowledge-bases/knowledge-base.service.ts",
        "server/src/modules/users/user.service.ts"
      ],
      "tags": ["邀请", "成员", "团队"]
    },
    {
      "id": "product-knowledge-reference",
      "label": "对话引用知识库",
      "layer": "product",
      "group": "product",
      "nodeType": "module",
      "summary": "用户在对话里选择可访问的知识库，让回答引用专属资料。",
      "details": "知识库管理完成后，可以在对话输入区绑定知识库；发送前会做权限和状态预检，若成员被移除或知识库改回私有，会给出友好提示并清空不可用引用。",
      "files": [
        "web/src/components/chat/MessageComposer.tsx",
        "web/src/stores/chat.ts",
        "server/src/modules/messages/message.service.ts",
        "server/src/modules/conversations/conversation.service.ts"
      ],
      "tags": ["引用", "权限预检", "知识问答"]
    },
    {
      "id": "product-project-context",
      "label": "项目化组织与项目提示词",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-conversation-management",
      "summary": "按项目组织会话，并让项目内会话持续遵循项目指令。",
      "details": "一个项目可包含多个会话，并配置图标、颜色、标题和长期提示词；项目提示词会进入该项目会话的模型上下文，使同一工作主题保持稳定要求。",
      "files": [
        "web/src/components/chat/ChatSidebar.tsx",
        "web/src/components/chat/ProjectDialog.tsx",
        "server/src/modules/projects/project.service.ts"
      ],
      "tags": ["项目", "上下文", "提示词"]
    },
    {
      "id": "product-conversation-movement",
      "label": "拖拽归类与跨项目移动",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-conversation-management",
      "summary": "通过拖拽或菜单在普通列表与不同项目之间整理会话。",
      "details": "用户可以把普通会话拖入项目、在项目之间移动或移回普通对话列表；移动结果同步写入后端，移动到原位置等无变化场景不会产生请求。",
      "files": [
        "web/src/components/chat/ChatSidebar.tsx",
        "web/src/components/chat/ChatSidebar.tsx",
        "web/src/utils/project-dnd.ts",
        "server/src/modules/conversations/conversation.service.ts"
      ],
      "tags": ["拖拽", "项目归类", "状态同步"]
    },
    {
      "id": "product-conversation-find",
      "label": "置顶、搜索与快速定位",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-conversation-management",
      "summary": "突出高频会话，并从不断增长的历史记录中快速找回目标。",
      "details": "用户可以置顶重要会话、按关键词搜索历史会话，并从搜索结果直接定位到目标内容；重命名和删除等基础管理动作保留在会话菜单中。",
      "files": [
        "web/src/components/chat/ChatSidebar.tsx",
        "web/src/components/chat/ConversationSearchDialog.tsx",
        "server/src/modules/conversations/conversation.service.ts"
      ],
      "tags": ["置顶", "搜索", "定位"]
    },
    {
      "id": "product-message-regenerate",
      "label": "编辑后重新生成",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-message-operations",
      "summary": "修改历史提问后，从该位置重新生成后续回答。",
      "details": "用户编辑历史消息时，系统会截断该消息之后的旧上下文，并基于修改后的问题重新生成回答，避免新旧分支内容混在同一会话中。",
      "files": [
        "web/src/components/chat/MessageList.tsx",
        "web/src/stores/chat.ts",
        "server/src/modules/messages/message.service.ts"
      ],
      "tags": ["编辑", "截断", "重新生成"]
    },
    {
      "id": "product-stream-recovery",
      "label": "流式输出与断流恢复",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-message-operations",
      "summary": "实时展示回答，并在连接中断后恢复生成状态和已有内容。",
      "details": "AI 回答通过流式事件持续追加；连接意外中断时，前端可重新订阅生成任务，恢复已产生内容、深度思考状态和后续正文。",
      "files": [
        "web/src/api/chat.ts",
        "web/src/stores/chat.ts",
        "server/src/modules/messages/message.service.ts",
        "server/src/utils/sse.ts"
      ],
      "tags": ["流式", "中断恢复", "SSE"]
    },
    {
      "id": "product-image-understanding",
      "label": "图片多模态理解",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-files",
      "summary": "结合用户本轮问题理解图片中的视觉内容和文字。",
      "details": "图片上传后会生成通用视觉描述，发送消息时还可以结合用户本轮问题做针对性分析；分析失败时仍会明确告诉模型存在图片附件。",
      "files": [
        "web/src/components/chat/MessageComposer.tsx",
        "server/src/lib/vision.ts",
        "server/src/modules/messages/message.service.ts"
      ],
      "tags": ["多模态", "视觉理解", "图片问答"]
    },
    {
      "id": "product-large-file-qa",
      "label": "大文件语义问答",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-files",
      "summary": "根据文件规模选择直接理解或语义检索，定位相关内容回答。",
      "details": "小文本直接进入当前对话上下文，大文件在后台完成分块和索引；提问时 AI 可检索相关片段，避免只读取文件开头。",
      "files": [
        "server/src/modules/files/rag.service.ts",
        "server/src/lib/tools/semanticSearch.ts",
        "server/src/lib/chunker.ts"
      ],
      "tags": ["文件问答", "语义检索", "大文件"]
    },
    {
      "id": "product-memory-extraction",
      "label": "对话自动提取",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-memory",
      "summary": "从对话中判断值得长期保留的用户信息并自动沉淀。",
      "details": "每轮对话完成后，系统会判断内容是否值得记忆，并提取用户画像、偏好、事实和摘要；不值得长期保存的内容会被跳过。",
      "files": [
        "server/src/lib/memory-graph.ts",
        "server/src/lib/ai.ts",
        "server/src/modules/memories/memory.service.ts"
      ],
      "tags": ["自动提取", "长期记忆", "LangGraph"]
    },
    {
      "id": "product-memory-control",
      "label": "用户可控管理",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-memory",
      "summary": "用户可以检查和修正 AI 长期保留的个人信息。",
      "details": "记忆管理页允许用户查看、创建、修改和删除长期记忆，使自动记忆具备透明、可修正和可撤回的控制边界。",
      "files": [
        "web/src/views/MemoryView.tsx",
        "web/src/stores/memory.ts",
        "server/src/modules/memories/memory.service.ts"
      ],
      "tags": ["透明", "可控", "记忆管理"]
    },
    {
      "id": "product-web-search",
      "label": "联网搜索",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-ai-capabilities",
      "summary": "面对实时信息问题时，由 AI 主动检索互联网内容。",
      "details": "模型在需要最新事实、新闻或实时资料时调用联网搜索工具，再结合搜索结果生成回答，用户不需要手动切换独立搜索模式。",
      "files": [
        "server/src/lib/tools/webSearch.ts",
        "server/src/lib/mcp.ts",
        "server/src/lib/ai.ts"
      ],
      "tags": ["实时信息", "联网搜索", "工具调用"]
    },
    {
      "id": "product-image-generation",
      "label": "图片生成",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-ai-capabilities",
      "summary": "根据自然语言描述生成图片，并作为会话结果展示。",
      "details": "当用户提出绘图需求时，模型调用图片生成工具；生成结果转存到对象存储后作为图片消息返回，并支持预览和下载。",
      "files": [
        "server/src/lib/tools/drawImage.ts",
        "server/src/lib/ai.ts",
        "web/src/components/chat/MessageList.tsx"
      ],
      "tags": ["图片生成", "会话结果", "对象存储"]
    },
    {
      "id": "product-location-awareness",
      "label": "位置感知",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-ai-capabilities",
      "summary": "在用户授权后理解当前位置，回答天气、周边和本地问题。",
      "details": "AI 通过浏览器能力请求用户授权定位，再把经纬度转换为可读地区；位置只在当前工具调用中使用，不由前端根据关键词擅自触发。",
      "files": [
        "web/src/utils/client-tools.ts",
        "server/src/lib/tools/userLocation.ts",
        "server/src/lib/tool-context.ts"
      ],
      "tags": ["用户授权", "位置", "浏览器能力"]
    },
    {
      "id": "product-model-style",
      "label": "模型与回答风格",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-preferences",
      "summary": "持久化默认模型和语调偏好，形成稳定的个人回答体验。",
      "details": "用户可以选择默认模型、回答风格和主题；模型与语调偏好会影响后续回答，但不会重写已有会话历史。",
      "files": [
        "web/src/components/chat/ChatSettingsDialog.tsx",
        "server/src/modules/model-preferences/model-preference.service.ts",
        "server/src/modules/user-preferences/user-preference.service.ts"
      ],
      "tags": ["模型偏好", "语调", "个性化"]
    },
    {
      "id": "product-chat-model-governance",
      "label": "对话模型排序与全员切换",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-model-admin",
      "summary": "控制用户可选模型的默认项和展示顺序，并能紧急统一切换全部用户。",
      "details": "管理员可以添加多个对话模型、设置默认模型并拖拽排序；用户设置中的模型列表沿用同一顺序。模型到期或额度异常时，可把所有用户偏好一次性刷新到指定模型。",
      "files": [
        "web/src/views/AdminView.tsx",
        "server/src/modules/admin-models/admin-model.service.ts",
        "server/src/modules/model-preferences/model-preference.service.ts"
      ],
      "tags": ["拖拽排序", "默认模型", "一键切换"]
    },
    {
      "id": "product-specialized-model-governance",
      "label": "专用模型统一配置",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-model-admin",
      "summary": "分别配置向量、多模态、语音和文生图当前使用的单一模型。",
      "details": "专用模型按能力拆分为向量检索、图片理解、语音转写和文生图四项，每项使用独立配置；语音转写按模型系列选择 OpenAI 兼容或 DashScope 原生 HTTP 接口；文生图额外保存尺寸、提示词智能扩展和水印参数。",
      "files": [
        "web/src/views/AdminView.tsx",
        "server/src/lib/embeddings.ts",
        "server/src/lib/vision.ts",
        "server/src/lib/audio.ts",
        "server/src/lib/tools/drawImage.ts"
      ],
      "tags": ["Embedding", "多模态", "ASR", "文生图"]
    },
    {
      "id": "product-knowledge-stable-update",
      "label": "原 ID 内容更新",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-knowledge-management",
      "summary": "编辑内容或重新上传文件时保持知识库身份和已有引用不变。",
      "details": "创建者可以修改标题、正文或重新上传附件；更新始终保留原知识库 ID，因此成员关系和已有会话引用不需要迁移。",
      "files": [
        "web/src/components/knowledge/KnowledgeBaseEditorModal.tsx",
        "server/src/modules/knowledge-bases/knowledge-base.service.ts"
      ],
      "tags": ["编辑", "重新上传", "稳定 ID"]
    },
    {
      "id": "product-knowledge-reindex",
      "label": "自动重建索引",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-knowledge-management",
      "summary": "内容变化后自动重新切分和索引，并展示处理状态。",
      "details": "正文或附件更新后，知识库重新进入处理队列，完成文本切分和向量索引；页面通过完成、处理中和失败图标反馈当前状态。",
      "files": [
        "server/src/modules/knowledge-bases/knowledge-base.service.ts",
        "server/src/modules/knowledge-bases/knowledge-base-rag.service.ts",
        "web/src/views/KnowledgeBaseView.tsx"
      ],
      "tags": ["重建索引", "处理状态", "内容更新"]
    },
    {
      "id": "product-knowledge-visibility",
      "label": "私有 / 团队切换",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-knowledge-management",
      "summary": "创建者控制知识资产仅自己使用或开放给受邀团队。",
      "details": "知识库支持私有和团队两种可见性，切换前需要二次确认；团队转回私有时自动移除所有成员，并同步收回成员访问权。",
      "files": [
        "web/src/views/KnowledgeBaseView.tsx",
        "server/src/modules/knowledge-bases/knowledge-base.service.ts"
      ],
      "tags": ["私有", "团队", "二次确认"]
    },
    {
      "id": "product-invitation-lifecycle",
      "label": "邀请处理闭环",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-knowledge-collaboration",
      "summary": "从搜索用户、批量邀请到接受或拒绝形成完整协作流程。",
      "details": "创建者可按用户名或邮箱搜索并多选邀请；被邀请人登录后看到邀请列表，接受后加入知识库，拒绝后邀请记录被清理。",
      "files": [
        "web/src/views/KnowledgeBaseView.tsx",
        "web/src/App.tsx",
        "server/src/modules/knowledge-bases/knowledge-base.service.ts",
        "server/src/modules/users/user.service.ts"
      ],
      "tags": ["邀请", "接受拒绝", "用户搜索"]
    },
    {
      "id": "product-knowledge-roles",
      "label": "创建者 / 成员权限",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-knowledge-collaboration",
      "summary": "创建者管理内容和团队，成员仅保留引用与退出能力。",
      "details": "创建者可以更新、删除知识库并邀请或移除成员；普通成员不能修改内容和团队，只能在对话中引用知识库或主动退出。",
      "files": [
        "web/src/views/KnowledgeBaseView.tsx",
        "server/src/modules/knowledge-bases/knowledge-base.service.ts"
      ],
      "tags": ["角色", "权限边界", "成员"]
    },
    {
      "id": "product-membership-exit",
      "label": "成员移除与退出",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-knowledge-collaboration",
      "summary": "创建者可以移除成员，成员也可以主动结束共享关系。",
      "details": "创建者踢出成员或成员主动退出后，团队成员关系立即删除；后端同步清理该成员会话中对该知识库的绑定。",
      "files": [
        "web/src/views/KnowledgeBaseView.tsx",
        "server/src/modules/knowledge-bases/knowledge-base.service.ts",
        "server/src/modules/conversations/conversation.service.ts"
      ],
      "tags": ["移除成员", "退出团队", "关系清理"]
    },
    {
      "id": "product-knowledge-preflight",
      "label": "发送前权限预检",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-knowledge-reference",
      "summary": "消息发送前检查知识库是否仍可访问，避免无效请求进入生成流。",
      "details": "前端发送消息前先调用检查接口；知识库不可用时展示明确权限提示，并撤回页面上刚插入的临时用户消息，不再调用流式生成接口。",
      "files": [
        "web/src/stores/chat.ts",
        "web/src/api/chat.ts",
        "server/src/modules/messages/message.service.ts"
      ],
      "tags": ["发送前检查", "权限", "友好提示"]
    },
    {
      "id": "product-knowledge-revocation",
      "label": "权限变更即时生效",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-knowledge-reference",
      "summary": "成员被移除或知识库转私有后，已有引用同步失效。",
      "details": "权限变化时后端清理受影响用户的会话绑定；即使用户未刷新页面，发送前检查和流式接口兜底校验仍会阻止继续引用。",
      "files": [
        "server/src/modules/knowledge-bases/knowledge-base.service.ts",
        "server/src/modules/conversations/conversation.service.ts",
        "server/src/modules/messages/message.service.ts"
      ],
      "tags": ["权限撤销", "会话清理", "兜底校验"]
    },
    {
      "id": "product-knowledge-retrieval",
      "label": "可靠知识检索问答",
      "layer": "product",
      "group": "product",
      "nodeType": "capability",
      "parentId": "product-knowledge-reference",
      "summary": "兼顾语义相关性和关键词命中，提升长文档与短词问题的召回。",
      "details": "知识问答结合向量召回、关键词补充和旧索引完整源内容恢复，避免长文档只覆盖开头，也能处理昵称、专有名词等短词问题。",
      "files": [
        "server/src/modules/knowledge-bases/knowledge-base-rag.service.ts",
        "server/src/modules/knowledge-bases/knowledge-base.service.ts",
        "server/src/lib/chunker.ts"
      ],
      "tags": ["向量召回", "关键词", "长文档"]
    },
    {
      "id": "frontend-app",
      "label": "React 前端应用",
      "layer": "technical",
      "group": "frontend",
      "nodeType": "module",
      "summary": "React 19 + Vite + Zustand + Ant Design 组成前端体验层。",
      "details": "前端负责路由、登录态恢复、聊天布局、知识库页面、后台模型管理、设置弹窗、架构图页面、移动端响应式和流式消息展示。",
      "files": [
        "web/src/main.tsx",
        "web/src/router/index.tsx",
        "web/src/stores/chat.ts",
        "web/src/views/ArchitectureView.tsx"
      ],
      "tags": ["React 19", "Zustand", "Vite"]
    },
    {
      "id": "frontend-model-admin",
      "label": "模型管理后台",
      "layer": "technical",
      "group": "frontend",
      "nodeType": "module",
      "summary": "响应式 /admin 页面承载模型配置、排序和全员切换操作。",
      "details": "AdminView 通过公共管理页侧栏组织对话模型和专用模型两个区域；对话模型使用 Sortable 调整顺序，所有写操作通过 admin-model API 调用管理员专用接口，并兼容 PC 与移动端。",
      "files": [
        "web/src/views/AdminView.tsx",
        "web/src/api/admin-model.ts",
        "web/src/components/management/ManagementSidebar.tsx",
        "web/src/types/admin-model.ts"
      ],
      "tags": ["React", "Sortable", "Responsive"]
    },
    {
      "id": "frontend-network",
      "label": "前端通信层",
      "layer": "technical",
      "group": "frontend",
      "nodeType": "module",
      "summary": "统一封装 HTTP、SSE、token、文件 URL 和 client tool 回传。",
      "details": "前端 API 层负责请求鉴权、401 处理、访客登录和本地恢复身份、SSE 事件解析、上传进度、文件临时地址兑换，以及浏览器能力工具的执行和结果回传。",
      "files": [
        "web/src/api/http.ts",
        "web/src/api/auth.ts",
        "web/src/stores/auth.ts",
        "web/src/utils/guest-identity.ts",
        "web/src/api/chat.ts",
        "web/src/api/file.ts",
        "web/src/utils/client-tools.ts"
      ],
      "tags": ["HTTP", "SSE", "访客恢复"]
    },
    {
      "id": "browser-client-tools",
      "label": "浏览器能力执行器",
      "layer": "technical",
      "group": "frontend",
      "nodeType": "module",
      "summary": "前端执行后端请求的浏览器能力，并把结果回传给工具链。",
      "details": "后端通过 SSE 下发 client-tool-request；前端解析后调用 web/src/utils/client-tools.ts，目前 getBrowserLocation 会使用 navigator.geolocation 获取经纬度，再 POST client-tool-result 唤醒后端工具。",
      "files": [
        "web/src/api/chat.ts",
        "web/src/stores/chat.ts",
        "web/src/utils/client-tools.ts",
        "server/src/lib/tool-context.ts"
      ],
      "tags": ["Client Tool", "SSE", "Geolocation"]
    },
    {
      "id": "backend-api",
      "label": "Express API",
      "layer": "technical",
      "group": "backend",
      "nodeType": "module",
      "summary": "后端 API 统一挂载 /api，承载认证、会话、消息、文件、记忆、知识库和管理员模型配置。",
      "details": "Express 后端按模块划分 controller/service/routes/schema，中间件负责鉴权、参数校验和错误处理；认证模块同时承载正式用户和可恢复访客登录，Prisma 作为数据库访问层。",
      "files": [
        "server/src/app.ts",
        "server/src/modules/index.ts",
        "server/src/middlewares/auth.ts",
        "server/src/modules/auth/auth.service.ts",
        "server/src/modules/conversations/conversation.service.ts",
        "server/src/modules/messages/message.service.ts"
      ],
      "tags": ["Express", "Prisma", "JWT"]
    },
    {
      "id": "backend-guest-auth",
      "label": "可恢复访客认证",
      "layer": "technical",
      "group": "backend",
      "nodeType": "module",
      "summary": "创建递增访客账号，并通过高熵恢复密钥重新识别同一浏览器访客。",
      "details": "POST /api/auth/guest 对恢复密钥做 SHA-256 后查找访客；未命中时通过 PostgreSQL sequence 原子生成 Visitor_0001 递增展示名并创建用户。访客与正式用户复用相同 JWT 和 Refresh Cookie 时长。",
      "files": [
        "server/src/modules/auth/auth.routes.ts",
        "server/src/modules/auth/auth.service.ts",
        "server/prisma/schema.prisma",
        "web/src/utils/guest-identity.ts"
      ],
      "tags": ["Guest", "身份恢复", "JWT"]
    },
    {
      "id": "backend-model-management",
      "label": "管理员模型配置 API",
      "layer": "technical",
      "group": "backend",
      "nodeType": "module",
      "summary": "仅管理员可访问的模型 CRUD、排序和用户偏好批量切换服务。",
      "details": "admin-models 模块负责参数校验、默认模型约束、对话模型批量排序、全部用户偏好切换及配置变更后的运行时缓存失效；admin 中间件限制只有管理员能够访问。",
      "files": [
        "server/src/modules/admin-models/admin-model.routes.ts",
        "server/src/modules/admin-models/admin-model.controller.ts",
        "server/src/modules/admin-models/admin-model.service.ts",
        "server/src/modules/admin-models/admin-model.schema.ts",
        "server/src/middlewares/admin.ts"
      ],
      "tags": ["Admin API", "CRUD", "批量更新"]
    },
    {
      "id": "backend-knowledge",
      "label": "知识库权限服务",
      "layer": "technical",
      "group": "backend",
      "nodeType": "module",
      "summary": "知识库 CRUD、编辑、团队邀请、成员管理和对话引用权限。",
      "details": "后端控制 private/team 权限，提供邀请/接受/拒绝/移除/退出；messages/stream 在持久化前统一校验权限，权限变化时清理会话绑定。",
      "files": [
        "server/src/modules/knowledge-bases/knowledge-base.service.ts",
        "server/src/modules/knowledge-bases/knowledge-base.controller.ts",
        "server/src/modules/messages/message.service.ts"
      ],
      "tags": ["权限", "团队", "预检"]
    },
    {
      "id": "ai-orchestrator",
      "label": "AI 编排",
      "layer": "technical",
      "group": "ai",
      "nodeType": "module",
      "summary": "LangChain 模型调用、工具循环、深度思考和上下文组装。",
      "details": "负责将会话历史、个人记忆、文件、知识库、回答风格和工具能力组装进模型调用；支持深度思考 reasoning_content 和多轮 tool calling。",
      "files": [
        "server/src/lib/ai.ts",
        "server/src/lib/model-registry.ts",
        "server/src/lib/speech-style.ts"
      ],
      "tags": ["LangChain", "Qwen", "Tool Calling"]
    },
    {
      "id": "ai-model-registry",
      "label": "运行时模型注册表",
      "layer": "technical",
      "group": "ai",
      "nodeType": "module",
      "summary": "从数据库解析各类当前模型，并以短时缓存向 AI 调用链提供统一配置。",
      "details": "model-registry 按类型读取 AiModel，提供可选对话模型、默认专用模型和文生图参数；配置写入后立即失效缓存，数据库暂不可用时使用内置安全回退，避免核心 AI 能力直接中断。",
      "files": [
        "server/src/lib/model-registry.ts",
        "server/src/lib/ai.ts",
        "server/src/lib/embeddings.ts",
        "server/src/lib/vision.ts",
        "server/src/lib/audio.ts",
        "server/src/lib/tools/drawImage.ts"
      ],
      "tags": ["Runtime Config", "Cache", "Fallback"]
    },
    {
      "id": "rag-system",
      "label": "RAG 检索系统",
      "layer": "technical",
      "group": "ai",
      "nodeType": "module",
      "summary": "文本分块、Embedding、pgvector 检索、TopK 补齐和关键词兜底。",
      "details": "文件和知识库会被切成重叠 chunk，生成向量后写入 pgvector；提问时检索相关片段并注入 prompt，短词昵称类问题补充关键词兜底。",
      "files": [
        "server/src/lib/chunker.ts",
        "server/src/lib/embeddings.ts",
        "server/src/modules/files/rag.service.ts",
        "server/src/modules/knowledge-bases/knowledge-base-rag.service.ts"
      ],
      "tags": ["Embedding", "pgvector", "Chunking"]
    },
    {
      "id": "tool-runtime",
      "label": "工具与浏览器桥接",
      "layer": "technical",
      "group": "ai",
      "nodeType": "module",
      "summary": "统一承载 webSearch、drawImage、readFile、semanticSearch 和位置工具。",
      "details": "后端工具使用 request-scoped context 做权限约束；webSearchTool 连接 DashScope WebSearch MCP，drawImageTool 调 DashScope 图片生成并把结果转存 R2，getUserLocationTool 通过浏览器能力拿经纬度后调用高德逆地理编码。",
      "files": [
        "server/src/lib/tools/tools.ts",
        "server/src/lib/tool-context.ts",
        "server/src/lib/mcp.ts",
        "server/src/lib/tools/webSearch.ts",
        "server/src/lib/tools/drawImage.ts",
        "server/src/lib/tools/userLocation.ts"
      ],
      "tags": ["MCP", "Tool Calling", "外部服务"]
    },
    {
      "id": "external-database",
      "label": "PostgreSQL / pgvector",
      "layer": "technical",
      "group": "external",
      "nodeType": "module",
      "summary": "Neon PostgreSQL 存业务数据，pgvector 支撑向量检索。",
      "details": "数据库保存正式用户和访客类型、访客恢复密钥哈希、Visitor 展示名 sequence、会话、消息、记忆、文件、知识库、团队成员、邀请、AiModel 配置和 chunk 向量；Prisma schema 是数据模型核心。",
      "files": [
        "server/prisma/schema.prisma",
        "server/src/lib/prisma.ts"
      ],
      "tags": ["Prisma", "Neon", "pgvector"]
    },
    {
      "id": "data-ai-model-config",
      "label": "AiModel 配置表",
      "layer": "technical",
      "group": "external",
      "nodeType": "module",
      "summary": "持久化对话、向量、多模态、语音和文生图模型的统一配置。",
      "details": "AiModel 保存模型标识、展示名称、类型、默认状态、用户可选状态、排序、向量维度和 JSON 运行参数；对话模型允许多条，专用能力由默认项确定当前配置。",
      "files": [
        "server/prisma/schema.prisma",
        "server/prisma/migrations/20260723000000_add_ai_model_management/migration.sql"
      ],
      "tags": ["Prisma", "AiModel", "Model Config"]
    },
    {
      "id": "external-storage",
      "label": "Cloudflare R2",
      "layer": "technical",
      "group": "external",
      "nodeType": "module",
      "summary": "附件、图片和生成结果的对象存储。",
      "details": "后端只在业务接口中保存 storageKey，前端通过批量 URL 兑换获取预签名访问地址；图片生成和文件上传都复用 R2 存储。",
      "files": [
        "server/src/utils/obs.ts",
        "server/src/modules/files/file.service.ts",
        "server/src/lib/tools/drawImage.ts"
      ],
      "tags": ["Object Storage", "Presigned URL", "S3 API"]
    },
    {
      "id": "external-dashscope-websearch",
      "label": "阿里云联网搜索 MCP",
      "layer": "technical",
      "group": "external",
      "nodeType": "module",
      "summary": "DashScope WebSearch MCP 为 webSearchTool 提供实时联网检索。",
      "details": "server/src/lib/tools/webSearch.ts 使用 DASHSCOPE_WEBSEARCH_MCP_URL 和 DASHSCOPE_API_KEY 初始化 MyMcpClient，并调用 bailian_web_search，把搜索结果交给模型回答实时问题。",
      "files": [
        "server/src/lib/tools/webSearch.ts",
        "server/src/lib/mcp.ts",
        "server/src/config/env.ts"
      ],
      "tags": ["DashScope", "MCP", "联网搜索"]
    },
    {
      "id": "external-dashscope-image",
      "label": "阿里云图片生成",
      "layer": "technical",
      "group": "external",
      "nodeType": "module",
      "summary": "DashScope 图片生成接口为 drawImageTool 生成图片。",
      "details": "server/src/lib/tools/drawImage.ts 使用 DASHSCOPE_IMAGE_GENERATION_URL 和后台模型配置调用阿里云图片生成；模型标识、默认尺寸、提示词扩展和水印来自 AiModel 表，拿到临时图片 URL 后下载并转存到 Cloudflare R2。",
      "files": [
        "server/src/lib/tools/drawImage.ts",
        "server/src/config/env.ts",
        "server/src/utils/obs.ts"
      ],
      "tags": ["DashScope", "Image Generation", "R2"]
    },
    {
      "id": "external-amap",
      "label": "高德地图逆地理编码",
      "layer": "technical",
      "group": "external",
      "nodeType": "module",
      "summary": "高德地图把浏览器经纬度转换成可读行政区位置。",
      "details": "getUserLocationTool 先请求浏览器 getBrowserLocation，再用 AMAP_REGEOCODE_URL 和 AMAP_API_KEY 调高德逆地理编码接口，返回国家、省、市、区等位置文本给模型。",
      "files": [
        "server/src/lib/tools/userLocation.ts",
        "server/src/config/env.ts",
        "web/src/utils/client-tools.ts"
      ],
      "tags": ["Amap", "Geolocation", "位置服务"]
    },
    {
      "id": "external-ai",
      "label": "阿里云 LLM / Embedding",
      "layer": "technical",
      "group": "external",
      "nodeType": "module",
      "summary": "DashScope / OpenAI 兼容模型、Embedding 和多模态视觉分析。",
      "details": "模型服务提供聊天、深度思考 reasoning_content、Embedding 和多模态视觉分析；联网搜索、图片生成和位置服务在架构图中拆成独立外部节点，方便展示工具链边界。",
      "files": [
        "server/src/config/env.ts",
        "server/src/lib/model-registry.ts",
        "server/src/lib/embeddings.ts"
      ],
      "tags": ["DashScope", "Embedding", "Multimodal"]
    },
    {
      "id": "deployment",
      "label": "部署与反向代理",
      "layer": "technical",
      "group": "external",
      "nodeType": "module",
      "summary": "Docker、Nginx、Railway 双服务和健康检查。",
      "details": "server 和 web 独立部署；前端 Nginx 托管静态资源并反向代理 /api 和 /health 到后端服务。",
      "files": [
        "server/Dockerfile",
        "web/Dockerfile",
        "web/nginx.conf",
        "docker-compose.yml"
      ],
      "tags": ["Docker", "Nginx", "Railway"]
    }
  ],
  "edges": [
    {
      "source": "product-entry",
      "target": "product-chat",
      "label": "进入工作台",
      "type": "product"
    },
    {
      "source": "product-chat",
      "target": "product-conversation-management",
      "label": "管理会话",
      "type": "product"
    },
    {
      "source": "product-chat",
      "target": "product-message-operations",
      "label": "操作消息",
      "type": "product"
    },
    {
      "source": "product-chat",
      "target": "product-ai-capabilities",
      "label": "触发 AI 能力",
      "type": "product"
    },
    {
      "source": "product-chat",
      "target": "product-files",
      "label": "上传附件问答",
      "type": "product"
    },
    {
      "source": "product-chat",
      "target": "product-memory",
      "label": "沉淀个性记忆",
      "type": "product"
    },
    {
      "source": "product-chat",
      "target": "product-preferences",
      "label": "调整偏好",
      "type": "product"
    },
    {
      "source": "product-entry",
      "target": "product-knowledge-management",
      "label": "管理知识库",
      "type": "product"
    },
    {
      "source": "product-entry",
      "target": "product-model-admin",
      "label": "管理员进入后台",
      "type": "product"
    },
    {
      "source": "product-model-admin",
      "target": "product-preferences",
      "label": "发布用户可选模型",
      "type": "product"
    },
    {
      "source": "product-knowledge-management",
      "target": "product-knowledge-collaboration",
      "label": "团队协作",
      "type": "product"
    },
    {
      "source": "product-knowledge-collaboration",
      "target": "product-knowledge-reference",
      "label": "授权引用",
      "type": "product"
    },
    {
      "source": "product-knowledge-reference",
      "target": "product-chat",
      "label": "进入对话问答",
      "type": "product"
    },
    {
      "source": "product-conversation-management",
      "target": "product-project-context",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-conversation-management",
      "target": "product-conversation-movement",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-conversation-management",
      "target": "product-conversation-find",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-message-operations",
      "target": "product-message-regenerate",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-message-operations",
      "target": "product-stream-recovery",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-files",
      "target": "product-image-understanding",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-files",
      "target": "product-large-file-qa",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-memory",
      "target": "product-memory-extraction",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-memory",
      "target": "product-memory-control",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-ai-capabilities",
      "target": "product-web-search",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-ai-capabilities",
      "target": "product-image-generation",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-ai-capabilities",
      "target": "product-location-awareness",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-preferences",
      "target": "product-model-style",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-model-admin",
      "target": "product-chat-model-governance",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-model-admin",
      "target": "product-specialized-model-governance",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-knowledge-management",
      "target": "product-knowledge-stable-update",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-knowledge-management",
      "target": "product-knowledge-reindex",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-knowledge-management",
      "target": "product-knowledge-visibility",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-knowledge-collaboration",
      "target": "product-invitation-lifecycle",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-knowledge-collaboration",
      "target": "product-knowledge-roles",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-knowledge-collaboration",
      "target": "product-membership-exit",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-knowledge-reference",
      "target": "product-knowledge-preflight",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-knowledge-reference",
      "target": "product-knowledge-revocation",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "product-knowledge-reference",
      "target": "product-knowledge-retrieval",
      "label": "代表能力",
      "type": "capability"
    },
    {
      "source": "frontend-app",
      "target": "frontend-network",
      "label": "调用 API / SSE",
      "type": "http"
    },
    {
      "source": "frontend-app",
      "target": "frontend-model-admin",
      "label": "管理员入口",
      "type": "internal"
    },
    {
      "source": "frontend-model-admin",
      "target": "frontend-network",
      "label": "模型管理请求",
      "type": "http"
    },
    {
      "source": "frontend-network",
      "target": "backend-api",
      "label": "/api",
      "type": "http"
    },
    {
      "source": "backend-api",
      "target": "backend-guest-auth",
      "label": "访客认证",
      "type": "internal"
    },
    {
      "source": "backend-guest-auth",
      "target": "external-database",
      "label": "身份恢复 / 创建",
      "type": "data"
    },
    {
      "source": "backend-api",
      "target": "backend-knowledge",
      "label": "知识库业务",
      "type": "internal"
    },
    {
      "source": "backend-api",
      "target": "backend-model-management",
      "label": "管理员模型接口",
      "type": "internal"
    },
    {
      "source": "backend-model-management",
      "target": "data-ai-model-config",
      "label": "CRUD / 排序",
      "type": "data"
    },
    {
      "source": "backend-model-management",
      "target": "ai-model-registry",
      "label": "配置变更后清缓存",
      "type": "internal"
    },
    {
      "source": "backend-api",
      "target": "ai-orchestrator",
      "label": "消息生成",
      "type": "ai"
    },
    {
      "source": "backend-knowledge",
      "target": "rag-system",
      "label": "重建索引 / 检索",
      "type": "ai"
    },
    {
      "source": "ai-orchestrator",
      "target": "rag-system",
      "label": "知识上下文",
      "type": "ai"
    },
    {
      "source": "ai-orchestrator",
      "target": "ai-model-registry",
      "label": "解析对话模型",
      "type": "internal"
    },
    {
      "source": "rag-system",
      "target": "ai-model-registry",
      "label": "解析向量模型",
      "type": "internal"
    },
    {
      "source": "tool-runtime",
      "target": "ai-model-registry",
      "label": "解析专用模型",
      "type": "internal"
    },
    {
      "source": "ai-model-registry",
      "target": "data-ai-model-config",
      "label": "读取当前配置",
      "type": "data"
    },
    {
      "source": "ai-model-registry",
      "target": "external-ai",
      "label": "调用已配置模型",
      "type": "ai"
    },
    {
      "source": "ai-orchestrator",
      "target": "tool-runtime",
      "label": "工具调用",
      "type": "tool"
    },
    {
      "source": "tool-runtime",
      "target": "external-dashscope-websearch",
      "label": "webSearchTool",
      "type": "tool"
    },
    {
      "source": "tool-runtime",
      "target": "external-dashscope-image",
      "label": "drawImageTool",
      "type": "tool"
    },
    {
      "source": "external-dashscope-image",
      "target": "external-storage",
      "label": "生成图转存",
      "type": "storage"
    },
    {
      "source": "tool-runtime",
      "target": "browser-client-tools",
      "label": "client-tool-request",
      "type": "sse"
    },
    {
      "source": "browser-client-tools",
      "target": "external-amap",
      "label": "经纬度逆地理编码",
      "type": "tool"
    },
    {
      "source": "ai-orchestrator",
      "target": "external-ai",
      "label": "LLM / Embedding",
      "type": "ai"
    },
    {
      "source": "backend-api",
      "target": "external-database",
      "label": "业务数据",
      "type": "data"
    },
    {
      "source": "data-ai-model-config",
      "target": "external-database",
      "label": "Prisma 持久化",
      "type": "data"
    },
    {
      "source": "rag-system",
      "target": "external-database",
      "label": "向量分片",
      "type": "data"
    },
    {
      "source": "backend-api",
      "target": "external-storage",
      "label": "文件对象",
      "type": "storage"
    },
    {
      "source": "deployment",
      "target": "frontend-network",
      "label": "Nginx 代理",
      "type": "deploy"
    }
  ],
  "flows": [
    {
      "id": "product-chat-flow",
      "label": "AI 对话产品链路",
      "description": "用户登录后进入对话工作台，通过会话管理组织和找回历史内容，在一次提问中可结合消息操作、附件、长期记忆、个性化偏好和 AI 工具能力完成任务。",
      "steps": ["product-entry", "product-chat", "product-conversation-management", "product-message-operations", "product-files", "product-memory", "product-preferences", "product-ai-capabilities"]
    },
    {
      "id": "product-knowledge-flow",
      "label": "知识库产品链路",
      "description": "知识库先在独立页面完成上传、编辑、重建索引和团队协作，再作为可访问资料被对话引用；它不是对话的附属功能，而是一条可独立维护的知识资产链路。",
      "steps": ["product-entry", "product-knowledge-management", "product-knowledge-collaboration", "product-knowledge-reference", "product-chat"]
    },
    {
      "id": "product-model-admin-flow",
      "label": "后台模型治理链路",
      "description": "管理员进入模型后台维护对话和专用模型；对话模型的默认项与排序直接发布到用户设置，必要时可将全部用户统一切换到指定模型，运行时能力同步读取最新专用配置。",
      "steps": ["product-entry", "product-model-admin", "product-preferences", "product-chat", "product-ai-capabilities"]
    },
    {
      "id": "model-management-technical-flow",
      "label": "模型配置运行时链路",
      "description": "模型管理后台通过管理员 API 写入 AiModel 表并使注册表缓存失效；聊天、RAG、图片理解、语音和文生图调用时由运行时注册表解析当前配置，再访问外部模型服务。",
      "steps": ["frontend-model-admin", "frontend-network", "backend-model-management", "data-ai-model-config", "ai-model-registry", "ai-orchestrator", "external-ai"]
    },
    {
      "id": "guest-auth-technical-flow",
      "label": "可恢复访客认证链路",
      "description": "前端读取浏览器保存的访客恢复密钥并调用访客认证接口；后端按密钥哈希恢复已有访客，或通过数据库 sequence 创建递增访客账号，再复用统一 JWT 会话返回工作台。",
      "steps": ["frontend-app", "frontend-network", "backend-api", "backend-guest-auth", "external-database"]
    },
    {
      "id": "chat-technical-flow",
      "label": "AI 对话技术链路",
      "description": "前端工作台通过 API/SSE 连接后端消息服务，后端组装上下文、调用工具和模型，再把流式结果返回前端。",
      "steps": ["frontend-app", "frontend-network", "backend-api", "ai-orchestrator", "tool-runtime", "external-ai"]
    },
    {
      "id": "tool-external-flow",
      "label": "工具与外部服务链路",
      "description": "模型触发工具后，后端工具运行时按工具类型连接 DashScope WebSearch MCP、DashScope 图片生成、浏览器定位和高德逆地理编码；生成图片会转存到 R2 后再返回前端。",
      "steps": ["ai-orchestrator", "tool-runtime", "external-dashscope-websearch", "external-dashscope-image", "external-storage", "browser-client-tools", "external-amap"]
    },
    {
      "id": "knowledge-technical-flow",
      "label": "知识库 RAG 技术链路",
      "description": "知识库服务管理权限和内容更新，RAG 系统负责切分、Embedding、向量存储和检索，回答时把相关片段注入模型上下文。",
      "steps": ["frontend-app", "backend-knowledge", "rag-system", "external-ai", "external-database", "ai-orchestrator"]
    },
    {
      "id": "storage-deploy-flow",
      "label": "外部系统与部署链路",
      "description": "后端通过 Prisma 访问 PostgreSQL/pgvector，通过 R2 保存对象文件；生产环境由 Docker、Railway 和 Nginx 代理组成。",
      "steps": ["deployment", "frontend-network", "backend-api", "external-database", "external-storage", "external-ai"]
    }
  ]
}
```

## 修改原则

- 不要手改生成产物，除非这次改动就是要调整生成结果本身。
- 尽量保持在现有的 `server/web` 边界内改动，功能通常只属于其中一个应用。
