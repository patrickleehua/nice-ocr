# Tasks

## 1. 数据模型与类型
- [x] 1.1 `prisma/schema.prisma` 为 `RecognitionRow` 增加 nullable `sourceRegionJson`
- [x] 1.2 更新前端/共享类型中的 `RecognitionRow` / `ApiRow`，补充 `sourceRegionJson?: string | null`
- [x] 1.3 增加 source region 解析/校验 helper：归一化、clamp、非法返回 null

## 2. 识别 schema 与归一化
- [x] 2.1 默认识别 schema 为每行增加可选 `sourceRegion`
- [x] 2.2 动态场景 schema 同步支持 `sourceRegion`
- [x] 2.3 normalize 时把模型返回的区域转换为稳定 `SourceRegion` 结构
- [x] 2.4 单测：合法坐标保留；越界坐标 clamp；缺失/非法坐标不影响业务字段

## 3. 提示词与 worker 落库
- [x] 3.1 更新默认/动态识别提示词，要求模型尽量返回行级归一化区域
- [x] 3.2 worker 创建 `RecognitionRow` 时写入 `sourceRegionJson`
- [x] 3.3 确认 second pass/audit pass 不覆盖 canonical row 的区域来源
- [x] 3.4 单测或集成测试：模拟识别结果含 sourceRegion 时落库成功

## 4. ImageViewer overlay
- [x] 4.1 `ImageViewer` 增加 regions、activeRegionId、targetRegionId、onRegionSelect props
- [x] 4.2 实现图片自然尺寸/渲染尺寸测量和归一化坐标映射
- [x] 4.3 绘制 active/hover region overlay，保持与 zoom/pan 同步
- [x] 4.4 实现 targetRegionId 变化时自动 pan/zoom 到目标区域
- [ ] 4.5 验证宽图/高图/缩放/拖拽/重置视图下 overlay 不错位

## 5. 审核工作台联动
- [x] 5.1 `ReviewPage` 从 rows 解析 `sourceRegionJson` 生成 viewer regions
- [x] 5.2 表格行 hover/click 联动 active/target region
- [x] 5.3 表格操作区增加定位按钮，有坐标才启用
- [x] 5.4 overlay region click 后滚动并高亮对应表格行
- [x] 5.5 专注模式和普通模式都保持联动

## 6. 降级与可用性
- [x] 6.1 老数据/无坐标行不显示误导性高亮，定位按钮 disabled 或隐藏
- [x] 6.2 坐标解析失败不影响文档详情加载
- [x] 6.3 overlay 不遮挡图片主体，active 状态有足够对比
- [x] 6.4 行切换、文档切换时清理 active/target 状态

## 7. 验证与交付
- [x] 7.1 `pnpm typecheck`（修复 review-page.tsx imageRegions 类型谓词错误后通过）
- [x] 7.2 `pnpm test`（75 项全过，含 sourceRegionJson 落库与提示词注入回归）
- [ ] 7.3 手工验证：上传新图识别后 hover/click 明细行能定位原图区域（需配置可用 AI provider 实跑）
- [ ] 7.4 手工验证：旧数据无坐标仍能正常审核（需配置可用 AI provider 实跑）
- [x] 7.5 完成后按项目约定提交 `feat:识别行支持原图区域定位`

## 8. 上线后修复（功能未生效根因）
首版提交时未执行 typecheck/test/db push（见 verification.md：当时环境无 Node），导致功能链路虽完整但运行期不生效。系统排查出三处根因并修复：
- [x] 8.1 schema 漂移：`sourceRegionJson` 字段加进 schema.prisma 但从未 `prisma generate` + `db push`，dev.db/test.db 都没有该列 → worker 写库即抛未知字段。修复：`prisma db push` 同步 dev.db 并重生 client。
- [x] 8.2 提示词丢失：坐标指令被写死在「可被用户覆盖」的系统提示词里，dev.db 已存的全局提示词「【全局】识别副食品销售单，结构化输出」不含该指令 → 模型从不返回坐标。修复：抽出 `sourceRegionPromptInstruction` 常量，在 `createRecognitionProvider` 构造处幂等强制注入（不污染 `resolveProviderPrompts` 纯优先级语义），并加回归测试复现该已存提示词。
- [x] 8.3 类型错误：`review-page.tsx` 的 `imageRegions` 用 `satisfies` + 类型谓词导致 `tsc` 报错、`next build` 会失败。修复：map 显式返回 `ImageRegion | null`，filter 用 `region !== null` 收窄。
