# Design

## Context

现有审核工作台已经具备实现联动体验的基础：

- `ReviewPage` 左侧文档列表、中间 `ImageViewer`、右侧识别明细。
- `ImageViewer` 已支持缩放、拖拽、重置视图。
- `RecognitionRow` 通过 `documentId` 关联图片，但没有保存原图坐标。
- `ExtractionAttempt.parsedJson` 保存模型输出，但当前规范化后的 row 只保留业务字段。

因此本次核心是补齐一条坐标链路：

```text
AI 识别输出 sourceRegion
        │
        ▼
normalizeExtraction rows[].sourceRegion
        │
        ▼
RecognitionRow.sourceRegionJson
        │
        ▼
/api/documents/:id rows[]
        │
        ▼
ReviewPage selected/hovered row
        │
        ▼
ImageViewer overlay + pan/zoom to region
```

## Goals / Non-Goals

Goals:
- 行级区域能从新识别结果落库并返回前端。
- 审核台能快速定位行在原图中的位置。
- 坐标使用归一化值，适配缩放、不同图片尺寸、PDF 渲染页。
- 无区域数据时不破坏现有审核流程。
- 设计兼容后续专业 OCR/layout 引擎。

Non-Goals:
- 不在本次引入第三方 OCR layout 服务。
- 不支持字段级来源区域编辑。
- 不追求坐标 100% 精准；第一阶段允许模型坐标近似，UI 以“辅助定位”为目标。

## Data Model

### RecognitionRow.sourceRegionJson

新增 nullable 字段：

```prisma
sourceRegionJson String?
```

示例：

```json
{
  "version": 1,
  "source": "model",
  "kind": "row",
  "box": { "x": 0.08, "y": 0.42, "w": 0.84, "h": 0.045 },
  "confidence": 0.7
}
```

约定：
- 坐标归一化到图片自然尺寸，范围 `0..1`。
- `x/y` 为左上角，`w/h` 为宽高。
- 接受未来 polygon/cells 扩展，但本次 UI 只消费 `box`。
- 入库前 clamp 到 `0..1`，非法或缺失则写 `null`。

### Schema Types

在识别 schema 中给每行增加可选字段：

```ts
sourceRegion?: {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence?: number;
}
```

normalize 后映射为：

```ts
row.sourceRegion?: SourceRegion
```

## Recognition Prompt

系统提示词增加一段非强制约束：

- 对每个明细行尽量返回其在整张图片中的位置。
- 坐标使用相对图片宽高的 0..1 值。
- 如果无法判断位置，可以省略 `sourceRegion`，不要编造极端坐标。

这样能保持向后兼容：模型不返回坐标时识别仍成功。

## Image Viewer Overlay

`ImageViewer` 新增 props：

```ts
regions?: Array<{
  id: string;
  label?: string;
  box: { x: number; y: number; w: number; h: number };
  tone?: "active" | "muted" | "flagged";
}>;
activeRegionId?: string | null;
targetRegionId?: string | null;
onRegionSelect?: (id: string) => void;
```

实现要点：
- 用 wrapper 记录图片 natural/rendered 尺寸。
- overlay 与 `<img>` 放在同一个 transform 容器中，使用相同 zoom/pan。
- region 的 pixel 位置由 rendered image rect × normalized box 得到。
- active region 使用明显描边和半透明填充；非 active 可只在 hover/选中时显示，避免遮挡。
- 当 `targetRegionId` 变化时，计算合适 pan/zoom，让目标区域进入视窗中央。不要每次 hover 都自动移动，避免画面乱跳；只在点击/定位按钮时移动。

## Review Workspace Interaction

新增状态：

```ts
const [activeRowId, setActiveRowId] = useState<string | null>(null);
const [targetRowId, setTargetRowId] = useState<string | null>(null);
```

交互：
- 表格行 hover：设置 `activeRowId`，只高亮，不移动视图。
- 表格行 click 或定位按钮：设置 `activeRowId` + `targetRowId`，原图移动到区域。
- overlay region click：设置 `activeRowId`，滚动右侧表格到对应行。
- active 行在表格中加轻量背景，便于视觉跟随。

无区域时：
- 定位按钮 disabled 或隐藏；
- hover/click 行不影响 viewer；
- 保留现有缩放/拖拽能力。

## API Surface

文档详情接口 `/api/documents/:id` 已直接返回 Prisma rows；新增字段后会自然包含 `sourceRegionJson`。前端类型补充该字段即可。

结果页可暂不使用该字段。本次聚焦审核台，后续结果页可加“查看原图并定位”深链。

## Migration Plan

- Prisma schema 增加 nullable 字段。
- 开发阶段允许直接 `db push` 或 migrate，不需要历史 backfill。
- 旧 rows 的 `sourceRegionJson = null`，UI 降级。

## Risks / Trade-offs

- 多模态 LLM 坐标精度不稳定：第一版只做“辅助定位”，不把坐标作为自动确认依据。
- 表格行跨页/折行：当前每个 Document 是一张图片或 PDF 单页，坐标仍在单图内；长行可用包围盒近似。
- 图片 object-contain + zoom/pan 坐标换算容易错：需要针对宽图、高图、缩放、平移写组件测试或至少手工验证。
- overlay 太多会遮挡：默认只显示 active/hover，或用低透明度边框。

## Future Extensions

- 接入 OCR layout 引擎，将 `sourceRegionJson.source` 改为 `layout_ocr`。
- 字段级 `cells` 高亮，点击某个单元格时定位到原图中的字段区域。
- 人工拖拽修正区域，形成审计数据。
- 审核建议直接显示“模型原值 vs 原图区域”。
