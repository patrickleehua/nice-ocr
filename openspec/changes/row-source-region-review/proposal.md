## Why

审核工作台当前只能把识别明细关联到「具体图片」，不能关联到「图片上的具体行区域」。操作员需要在原图里人工寻找每条明细对应的位置，再核对字段，尤其在长表格、扫描件、PDF 多页拆图里很费眼力。

主流 OCR 审核体验会把识别结果和原图坐标绑定：点击或悬停结构化行时，原图上高亮对应区域；点击图上的区域时，右侧表格滚动并选中对应行。AWS Textract、Azure Document Intelligence、Google Document AI、Label Studio 等都采用 geometry/bounding region + overlay 的模式。

目标：在现有审核工作台上增加「行级来源区域定位」，让用户从“人眼找原图位置”变成“系统带我到对应位置”。

## What Changes

- 识别输出 schema 增加可选的行级来源区域 `sourceRegion`，用归一化坐标描述该业务行在原图中的位置。
- `RecognitionRow` 新增 `sourceRegionJson` 保存区域信息；老数据为空时自然降级。
- worker 在写入识别行时保存模型返回的行级区域。
- 原图查看器支持 overlay 高亮层，并能根据选中行自动平移/缩放到目标区域。
- 审核明细表和原图双向联动：
  - hover/click 明细行，高亮原图区域；
  - 点击原图区域，选中并滚动到对应明细行；
  - 提供「定位」按钮用于主动跳转。
- 保留后续升级空间：未来可接入专业 layout OCR，或扩展到字段级/cell 级来源区域。

## Capabilities

### New Capabilities
- `row-source-region-review`: 识别行与原图来源区域的存储、展示和交互联动。

### Modified Capabilities
- 识别 schema/归一化：允许模型返回行级区域。
- 审核工作台：明细行与原图 viewer 增加联动状态。

## Impact

- 数据库：`RecognitionRow` 增加 `sourceRegionJson String?`，禁止级联关系变更。
- 识别：修改动态/默认 schema 与 normalize，提示词引导模型返回归一化 bbox。
- worker：创建识别行时持久化 `sourceRegionJson`。
- API：文档详情返回行的 `sourceRegionJson`。
- 前端：`ImageViewer` 增加 regions/activeRegion/onRegionSelect，`ReviewPage` 增加行选中/hover/滚动定位。
- 测试：schema 归一化、worker 落库、viewer 坐标映射、无坐标降级、审核联动。

## Non-Goals

- 本次不接入 AWS/Azure/Google 的专业 Document AI。
- 本次不做字段级/cell 级高亮，只做行级区域。
- 本次不要求历史数据自动补坐标；历史数据无坐标时保持现有体验。
- 本次不做人工拖拽校正区域；可作为后续增强。
