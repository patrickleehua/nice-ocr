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
- [ ] 3.4 单测或集成测试：模拟识别结果含 sourceRegion 时落库成功

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
- [ ] 7.1 `pnpm typecheck`
- [ ] 7.2 `pnpm test`
- [ ] 7.3 手工验证：上传新图识别后 hover/click 明细行能定位原图区域
- [ ] 7.4 手工验证：旧数据无坐标仍能正常审核
- [x] 7.5 完成后按项目约定提交 `feat:识别行支持原图区域定位`
