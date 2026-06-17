# nice-ocr 审核 AI 模块 — 研究与设计提案（evolve）

> Super Dev research artifact · phase = research · Status: **待你确认（确认后才进入 Spec/编码）**
> Date: 2026-06-17 · 主导专家: PM + ARCHITECT
> research 双引擎: 引擎1 本地知识(无 `knowledge/` 命中) · 引擎2 联网研究(见 §4 与来源)

## 1. 你的问题拆解

你问的是:**要不要在"数据已确认"之后再加一道 AI 审核流程,对确认后的数据做二次复查;也许只针对特定情况检查。**

把它拆成三个可判定的子问题:
- Q1 **是否需要**:确认之后是否还存在"没人会再看一眼、但可能是错的"数据?
- Q2 **针对什么**:如果需要,应该审核哪一部分(全部 / 仅机器自动通过 / 仅特定风险)?
- Q3 **怎么审**:用规则/统计、还是再叫一次 AI(LLM-as-judge)、还是两者结合?以多大成本?

## 2. 现状:数据生命周期与"确认"的两种来源

```
上传图片 → Document(queued) → RecognitionJob(extract)
   worker 双模型识别(pass1 主 / pass2 副) → validateRow 规则校验 → buildConsensusFlags 双次一致比对
   → decideRowReview(模式, 风险, 一致) 落库:
        · ai_auto       低风险 + 双次一致 → status=confirmed（机器自动通过，无人看过）
        · pending_review 其余 → 进审核台等人工
        · conflict      高风险 → 冲突
人工在审核台逐行核对/内联编辑/确认 → reviewClass=human, status=confirmed
confirmed 行 → 重建产品库 / 导出
```

**关键事实:"已确认(confirmed)"其实有两种来源,信任度完全不同:**
| 来源 | reviewClass | 是否有人看过 | 残留错误谁来兜 |
| --- | --- | --- | --- |
| 机器自动通过 | `ai_auto` | **从未有人看过** | 目前没有任何人/流程 |
| 人工确认 | `human` | 看过(但可能误确认/改错) | 目前没有复核 |

现有校验只有 `validateRow` 三条规则:编码清洗、非商品名、`金额=数量×单价`。它**只能发现"内部不自洽"的错误**。

## 3. 核心发现:确认后存在"无人复核盲区"

**`ai_auto` 自动通过的依据是"双次识别一致 + 规则通过",但这两条都无法保证"与原图一致":**

1. **相关性误差(双次一致≠正确)**:同一个模型(当前 dev 只有 1 个带密钥 provider,副模型退化为同模型双跑)对同一张图常犯**同样的错**——两次都把"8.00"读成"3.00",于是"双次一致"成立。双盲复核(double-key)能挡独立随机错,挡不住这种系统性误读。
2. **内部自洽的错误规则查不出**:数量/单价被一起读错,但 `数量×单价` 仍等于(被一起读错的)金额 → `AMOUNT_MISMATCH` 不触发、名字合法 → 低风险 → `ai_auto`。**这类行直接进产品库和导出,无人知晓。**
3. **不可读扫描件上的"自信幻觉"**:业界已知 LLM 在模糊/残缺图上不会说"不知道",而是编出"看起来对"的值(见 §4)。这类行最危险,却最容易双次一致。

**结论(回答 Q1):是,确实需要。** 你"尽量减少人工 + 高精度"的目标,本质是把大量行交给 `ai_auto` 免去人工——精度风险就**全部沉积在这批无人复核的行里**。审核 AI 模块正是给这块盲区兜底。

## 4. 行业做法(联网研究印证)

- **LLM-as-a-Judge 二次复核**是文档抽取的标准模式:用一个独立 LLM 按字段对抽取结果打分,**高置信自动通过、低置信/命中失败模式的路由给人工**;并对**自动通过的结果按比例抽样**送人工,以发现系统性错误并校准。
- **LLM 在不可读输入上会自信幻觉**(KYC OCR 实践):扫描不清时不报"不知道",而是给出形状正确的假值——印证 §3.3。
- **LLM 评审有偏好**(偏重格式/表面而非实质),故建议 ensemble/多模型投票 + 结构化"对照源数据"的校验,而非单模型拍板。
- **验收抽样 / AOQL(平均出厂质量上限)**:不必 100% 复检,按统计抽样规则抽取子集,按可接受错误率 α/β 决定接受/拒绝整批,即可保证"出厂"错误率低于目标——为"抽样审核 ai_auto"提供统计依据。
- **双键验证(double-key)**=我们现有的"双次一致";它能挡独立随机错,但需要"独立第二视角"(不同模型/不同提示词/对照历史)才能挡相关性误差。

来源:
- [From Extraction to Accuracy: Evaluating Extracted Invoice Data with LLM-as-a-Judge (Towards AI)](https://towardsai.net/p/machine-learning/from-extraction-to-accuracy-evaluating-extracted-invoice-data-with-llm-as-a-judge)
- [Evals before prompts: building an LLM OCR for KYC (nilenso)](https://blog.nilenso.com/blog/2026/05/18/evals-before-prompts-building-an-llm-ocr-for-kyc/)
- [LLM-as-a-Judge vs Human-in-the-Loop (Maxim AI)](https://www.getmaxim.ai/articles/llm-as-a-judge-vs-human-in-the-loop-evaluations-a-complete-guide-for-ai-engineers/)
- [Two-pass verification (Wikipedia)](https://en.wikipedia.org/wiki/Two-pass_verification)
- [On Efficient and Statistical Quality Estimation for Data Annotation (arXiv 2405.11919)](https://arxiv.org/pdf/2405.11919)
- [Acceptance Sampling (SixSigma.us)](https://www.6sigma.us/six-sigma-in-focus/acceptance-sampling/)

## 5. 结论:需要,但要"针对特定"(回答 Q2)

**不要对所有确认数据全量 AI 复审(成本高且无谓)。审核对象按"无人复核 + 出错代价"排序:**

| 优先级 | 审核对象 | 理由 | 建议手段 |
| --- | --- | --- | --- |
| **P0** | `ai_auto` 行 | 唯一"无人看过"的群体,精度盲区 | 规则/统计全查 + 可疑者 AI 复核 + 干净者抽样 |
| P1 | 人工确认后又被内联编辑的行 | 改错风险 | 提交时即时重跑 `validateRow`(已有,免费) |
| P2 | `human` 确认行(抽样) | 误确认 | 低比例抽样规则核查即可,一般不必 AI |

## 6. 设计方案(三选一,推荐 C)

- **方案 A — 纯规则/统计审核(不调 AI)**:对照产品库历史(单价区间、单位一致性、编码↔名称一致性、重复行)+ 重跑 `validateRow`。便宜、确定、零 API 成本;但发现不了"图上就是另一个数"的视觉级错误。
- **方案 B — 全量 AI 复核(LLM-as-judge)**:对每个 `ai_auto` 行用独立模型/提示词重看原图判定"同意/不同意/存疑"。覆盖最全,但成本 ∝ ai_auto 行数,偏过度。
- **方案 C — 混合(推荐,贴合"针对特定 + 避免过度")**:
  1. **Stage 1 规则/统计预筛**(免费):覆盖**全部 ai_auto 行**,挑出可疑(价格离群、单位/编码冲突、重复、改后不自洽)。
  2. **Stage 2 AI 复核**(LLM-as-judge,仅对**可疑子集** + 干净 ai_auto 的**小比例抽样**):独立模型重看原图给出 verdict + 建议修正值。
  3. **结果**:通过→标记 `audit passed`;存疑/不同意→进**复审队列**交人工。
  - 既补上视觉级盲区,又把 AI 成本压在"可疑 + 抽样"上。

## 7. 落点:复用现有架构(增量、无级联)

- **Schema(增量加列)**:
  - `RecognitionRow`: `auditState String @default("none")`(none/passed/flagged/reviewed)、`auditNote String?`、`auditedAt DateTime?`。(保留 `reviewClass` 表示来源,审核状态独立成列,不污染来源语义。)
  - `RecognitionJob` 新增 `type="audit"`;`ExtractionAttempt` 用 `strategy="audit"` 记录复核调用(已支持)。
  - `AppSetting` 新增 `recognition.audit`:开关、范围、抽样率、审核用 provider、价格离群阈值。
- **流程**:文档全部确认后入队 `audit` job(或审核台/仪表盘"运行审核"按钮手动触发,后续可加定时)。worker 复用 provider 抽象做 Stage 2,审核 provider 建议选与主模型**不同**的 provider(无则用主模型 + 不同审核提示词)。
- **历史基线**:`ProductObservation`/`Product` 已沉淀单价、单位、编码↔名称,直接作为统计离群基线。
- **UI**:审核台新增"复审"过滤 chip(`auditState=flagged`)+ 仪表盘"待复审"指标;沿用本轮已做的内联编辑改值。
- **审计**:每次审核动作写 `AuditLog`(已有)。

## 8. 范围与非目标(避免过度)

- 不做全量 AI 复审、不做单独 ML 模型、不做通用 eval/标注平台。
- 不引入级联外键(遵守 AGENTS 约定);所有新增为增量列/新 job 类型。
- 抽样有上限并 `log` 抽样规模,避免"看起来全审了"的错觉。

## 9. 待你确认的关键决策(确认后才写 Spec/tasks 与代码)

1. **审核范围**:以 `ai_auto` 为主(P0) ……还是要把 `human` 确认行也纳入抽样?
2. **审核方式**:方案 C(规则统计预筛 → 可疑子集 + 抽样 AI 复核)?还是先只上方案 A(纯规则,零 API 成本)做第一版?
3. **触发方式**:文档确认后**自动入队审核**,还是先做**手动"运行审核"按钮**(更可控、成本透明)?
4. **复审结果处置**:审核存疑的行,是退回"复审队列"等人工,还是允许审核 AI 直接改写并降级为 `pending`?(推荐退回人工,审核 AI 只建议不直接改写。)
