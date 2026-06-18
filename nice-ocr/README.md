# nice-ocr

单据图片识别、人工审核、产品库冲突维护与 Excel 导出的本地优先全栈工作台。

上传单据图片 → AI 视觉模型识别表格明细 → 双模型交叉校验 + 风险规则 → 人工审核/编辑/确认 → 二次审核复查 → 导出 Excel / 维护产品库。

---

## 技术栈

- **Next.js 16（App Router, Turbopack）** + React 19 + TypeScript
- **SQLite + Prisma 7**（driver adapter: better-sqlite3），本地优先持久化
- 数据库任务队列 + 独立 **worker** 进程（有界并发识别、重试、双模型校验、审核）
- AI 视觉识别：`openai`（Responses API）/ `@anthropic-ai/sdk`（Messages API）
- Tailwind CSS 4 + lucide-react 图标 + TanStack Table / Query
- 字段由 `src/lib/fields/field-schema.ts` 单一事实源驱动（识别 / 表格 / 导出共享）

---

## 环境要求

- Node.js ≥ 20（已在 Node 22 验证）
- [pnpm](https://pnpm.io)（仓库使用 `pnpm-lock.yaml`；`npm` 亦可，命令把 `pnpm` 换成 `npm run`）
- Windows / macOS / Linux 均可（开发在 Windows 验证）

---

## 快速开始

```bash
cd nice-ocr

# 1. 安装依赖
pnpm install

# 2. 配置环境变量（数据库地址等）
cp .env.example .env        # Windows: copy .env.example .env

# 3. 初始化数据库（生成 client + 建表 + 可选种子）
pnpm db:generate
pnpm db:push
pnpm db:seed                # 可选：写入演示数据

# 4. 启动开发服务器
pnpm dev
```

打开 http://localhost:3000 。

> 改动 `prisma/schema.prisma` 后，务必重新执行 `pnpm db:generate`（再 `pnpm db:push`），否则运行时会报 Prisma client 过期。

### 启用真实 AI 识别（worker）

识别在**独立 worker 进程**中跑（与 Next 服务器分开）。开发时需另开一个终端：

```bash
pnpm worker
```

worker 从数据库任务队列领取识别任务，按设置中的策略调用 AI provider 并落库。未启动 worker 时，上传的图片只会入队、不会被识别。

AI provider（Base URL / API Key / 协议 / 启用状态 / 模型目录）**全部存数据库**，不读 `.env`。首次使用在 http://localhost:3000/settings 配置。一个 provider 可以拥有多个模型选项，主识别、副识别和审核都选择具体的 provider/model pair，因此可以在同一个 provider 下用两个不同模型交叉校验。

- `openai_responses` —— 官方 `openai` SDK 的 Responses API
- `anthropic_messages` —— 官方 `@anthropic-ai/sdk` 的 Messages API

OpenAI-compatible provider 可在设置页使用“导入”按钮按约定调用 models endpoint：Base URL 已以 `/v1` 结尾时请求 `<baseUrl>/models`，否则请求 `<baseUrl>/v1/models`。导入只是辅助动作，失败不会影响手动新增/编辑模型；再次导入会按 provider/model id 幂等更新 metadata，不会删除未返回的手动模型。

---

## npm/pnpm 脚本

| 脚本 | 作用 |
| --- | --- |
| `pnpm dev` | 启动 Next 开发服务器（Turbopack，端口 3000） |
| `pnpm worker` | 启动识别 worker（队列消费 + AI 识别 + 审核），开发时需单独运行 |
| `pnpm build` | 生产构建 |
| `pnpm start` | 启动生产服务器（需先 `build`） |
| `pnpm lint` | ESLint 检查 |
| `pnpm test` | 跑测试（`scripts/test.ts`，使用隔离的 `test.db`，不污染开发库） |
| `pnpm db:generate` | 生成 Prisma client |
| `pnpm db:push` | 将 schema 同步到数据库（无迁移文件，本地优先） |
| `pnpm db:migrate` | 创建/应用迁移（需要正式迁移历史时使用） |
| `pnpm db:seed` | 写入演示种子数据 |

> 生产模式 `pnpm start` 在后台运行时，停止需按 PID 结束进程（端口不会自动释放）：
> `netstat -ano | findstr :3000` 找到 PID，再 `taskkill /PID <PID> /F`。

---

## 典型工作流

1. **新建批次** → `/batches`，点「新建批次」。
2. **上传单据** → 批次列表点整行进入批次详情，或用「上传」按钮。支持**图片**（jpg/png/webp 等）、**PDF**（每页自动渲染为一张图）、以及包含上述文件的 **ZIP 压缩包**（服务端解压、PDF 逐页展开，每张图一条 Document）。
3. **运行 worker** → `pnpm worker`，等待识别完成（顶栏队列状态指示）。
4. **审核** → `/review`：左侧选文件、中间看原图（可缩放/拖拽）、右侧逐格编辑并确认。
5. **二次审核**（可选）→ 审核台「运行审核」对机器自动通过的行做复查，待复审行进入复审队列。
6. **导出** → `/results` 右上「导出」，输出 Excel。
7. **产品库 / 冲突** → `/products`、`/conflicts` 维护资料库与重名冲突。

---

## 页面路由

| 路由 | 页面 |
| --- | --- |
| `/` | 仪表盘 |
| `/batches` · `/batches/[id]` | 批次列表 / 批次详情（文件 + 预览） |
| `/results` | 全部结果（筛选 / 内联编辑 / 导出） |
| `/review` | 审核工作台（原图 + 识别明细） |
| `/products` · `/conflicts` | 产品库 / 冲突管理 |
| `/import` | v5 历史数据导入 |
| `/settings` | AI provider、识别策略、审核设置 |

---

## 目录结构（节选）

```
nice-ocr/
├─ src/app/            # App Router 页面 + /api 路由
├─ src/components/     # 页面与 UI 组件（app-shell / results / review / ...）
├─ src/lib/
│  ├─ fields/          # 字段 schema 单一事实源（识别/表格/导出共享）
│  ├─ recognition/     # provider、schema、审核、设置
│  ├─ workflows/       # 行更新、产品库、导出模板、v5 导入
│  ├─ queue/           # 数据库任务队列
│  └─ db/              # Prisma client
├─ scripts/worker.ts   # 识别 worker 入口
├─ prisma/schema.prisma
└─ .env.example
```

---

## 测试

```bash
pnpm test
```

测试通过 `scripts/test.ts` 运行，使用独立的 `test.db`，不影响 `dev.db`。

---

## 环境变量

`.env`（见 `.env.example`）：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | SQLite 地址，默认 `file:./dev.db` |

AI provider 的密钥与配置不放 `.env`，统一在 `/settings` 写入数据库。
