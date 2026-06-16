import { Check, ChevronLeft, ChevronRight, Maximize2, Plus, ZoomIn, ZoomOut } from "lucide-react";
import { documents, recognitionRows } from "@/data/mock-data";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { RowStatusBadge, RiskBadge } from "@/components/ui/status";
import { DataTable, tableCellClass, tableHeadClass } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

export function ReviewPage() {
  const current = documents[0];
  const rows = recognitionRows.filter((row) => row.documentId === current.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">审核工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">左侧查看原图，右侧修正识别结果，底部按风险切换文档。</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary"><ChevronLeft size={15} />上一张</Button>
          <Button size="sm" variant="secondary">下一张<ChevronRight size={15} /></Button>
          <Button size="sm" variant="primary"><Check size={15} />确认本单所有行</Button>
        </div>
      </div>

      <div className="grid min-h-[650px] gap-4 xl:grid-cols-[42%_1fr]">
        <Panel className="flex min-h-0 flex-col">
          <PanelHeader>
            <PanelTitle>{current.fileName}</PanelTitle>
            <RiskBadge risk={current.risk} />
          </PanelHeader>
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <Button size="icon" variant="ghost" aria-label="放大"><ZoomIn size={15} /></Button>
            <Button size="icon" variant="ghost" aria-label="缩小"><ZoomOut size={15} /></Button>
            <Button size="icon" variant="ghost" aria-label="适应窗口"><Maximize2 size={15} /></Button>
            <span className="text-xs text-muted-foreground">100%</span>
          </div>
          <div className="flex min-h-[430px] flex-1 items-center justify-center bg-muted p-4">
            <div className="h-[390px] w-[280px] rounded border border-border bg-white p-4 shadow-sm">
              <div className="mb-4 h-4 w-32 rounded bg-muted" />
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 30 }).map((_, index) => (
                  <div key={index} className="h-5 rounded bg-muted" />
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-border p-3">
            <div className="flex gap-2 overflow-x-auto">
              {documents.map((doc) => (
                <div key={doc.id} className="w-28 shrink-0 rounded-md border border-border bg-surface p-1">
                  <div className="flex h-16 items-center justify-center rounded bg-muted text-[11px] text-muted-foreground">预览</div>
                  <div className="mt-1 truncate text-[11px]">{doc.fileName}</div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader>
              <PanelTitle>识别明细</PanelTitle>
              <Button size="sm" variant="secondary"><Plus size={15} />补充行</Button>
            </PanelHeader>
            <div className="max-h-[315px] overflow-auto">
              <DataTable>
                <thead className={tableHeadClass}>
                  <tr>
                    <th className={tableCellClass}>行</th>
                    <th className={tableCellClass}>产品编码</th>
                    <th className={tableCellClass}>产品名称</th>
                    <th className={tableCellClass}>单位</th>
                    <th className={tableCellClass}>数量</th>
                    <th className={tableCellClass}>单价</th>
                    <th className={tableCellClass}>金额</th>
                    <th className={tableCellClass}>状态</th>
                    <th className={tableCellClass}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id} className="hover:bg-muted/70">
                      <td className={tableCellClass}>{index + 1}</td>
                      <td className={tableCellClass}>{row.code}</td>
                      <td className={tableCellClass}>{row.name}</td>
                      <td className={tableCellClass}>{row.unit || "-"}</td>
                      <td className={tableCellClass}>{row.qty.toFixed(2)}</td>
                      <td className={tableCellClass}>{formatCurrency(row.price)}</td>
                      <td className={tableCellClass}>{formatCurrency(row.amount)}</td>
                      <td className={tableCellClass}><RowStatusBadge status={row.status} /></td>
                      <td className={tableCellClass}><Button size="sm" variant="secondary">确认</Button></td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelTitle>识别尝试对比</PanelTitle>
            </PanelHeader>
            <div className="grid gap-3 p-4 md:grid-cols-3">
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">识别 #2 openai/gpt-4o</div>
                <div className="mt-2 text-sm font-medium">日期：2024年6月15日</div>
                <div className="mt-1 text-sm">行数：4</div>
              </div>
              <div className="flex items-center justify-center text-xs font-semibold text-muted-foreground">VS</div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs text-muted-foreground">尝试 #1 openai/gpt-4o</div>
                <div className="mt-2 text-sm font-medium">日期：2024-06-15</div>
                <div className="mt-1 text-sm text-danger-strong">行数：3，不一致</div>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelTitle>风险详情</PanelTitle>
              <RiskBadge risk="high" />
            </PanelHeader>
            <div className="space-y-2 p-4 text-sm">
              <div>风险原因：疑似非商品名、金额校验差异、识别尝试不一致。</div>
              <div className="text-muted-foreground">建议：检查原图汇总行，确认是否排除。</div>
              <Button size="sm" variant="primary">定位此行</Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
