# nice-ocr

副食品单据图片识别、审核、产品库冲突维护工作台。

当前重构方向：

- Next.js App Router 全栈应用
- SQLite + Prisma 本地持久化
- 数据库任务队列和 worker
- OpenAI 兼容视觉模型识别
- 批次、文档、识别行、产品库、冲突、导入、导出页面

## Windows 验证步骤

WSL 环境当前无法稳定编译本项目，请在 Windows 终端里执行：

```bash
cd nice-ocr
pnpm install
copy .env.example .env
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm test
pnpm dev
```

打开：

```text
http://localhost:3000
```

可选 worker：

```bash
pnpm worker
```

如果需要真实 AI 识别，在 `.env` 中配置：

```bash
OPENAI_API_KEY=你的 key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o
```

## 已实现入口

- `/` 仪表盘
- `/batches` 批次列表
- `/batches/batch-202406` 批次详情
- `/results` 全部结果
- `/review` 审核工作台
- `/products` 产品库
- `/conflicts` 冲突管理
- `/import` v5 导入
- `/settings` 设置

## API 草案

- `GET/POST /api/batches`
- `GET /api/batches/:id`
- `POST /api/batches/:id/upload`
- `GET /api/documents/:id`
- `GET /api/documents/:id/image`
- `POST /api/documents/:id/retry`
- `GET /api/rows`
- `PATCH/DELETE /api/rows/:id`
- `POST /api/rows/bulk-confirm`
- `GET /api/products`
- `PATCH /api/products/:id`
- `POST /api/products/rebuild`
- `GET /api/conflicts`
- `POST /api/exports/recognition`
- `POST /api/exports/products`
- `POST /api/import/v5`

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
