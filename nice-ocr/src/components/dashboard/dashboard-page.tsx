import { AlertTriangle, CheckCircle2, Clock, FileImage, RefreshCw, Table2 } from "lucide-react";
import { batches, conflicts, documents, recognitionRows } from "@/data/mock-data";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { BatchStatusBadge, RiskBadge } from "@/components/ui/status";
import { DataTable, tableCellClass, tableHeadClass, TableWrap } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

const metricCards = [
  { label: "文档总数", value: "1,248", note: "当前批次", icon: FileImage, tone: "text-info-strong" },
  { label: "处理排队", value: "236", note: "队列中", icon: Clock, tone: "text-warning-strong" },
  { label: "失败", value: "34", note: "可重试", icon: AlertTriangle, tone: "text-danger-strong" },
  { label: "待审核行", value: "1,532", note: "风险优先", icon: Table2, tone: "text-warning-strong" },
  { label: "冲突数", value: "127", note: "产品库", icon: AlertTriangle, tone: "text-danger-strong" },
  { label: "已确认行", value: "8,765", note: "可导出", icon: CheckCircle2, tone: "text-success-strong" },
];

export function DashboardPage() {
  const activeBatch = batches[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">仪表盘</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            当前批次：{activeBatch.name}，系统以风险优先处理待审核数据。
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary">
            <RefreshCw size={15} />
            刷新状态
          </Button>
          <Button size="sm" variant="primary">新建批次</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <Panel key={metric.label} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">{metric.label}</div>
                  <div className="mt-2 text-2xl font-semibold">{metric.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{metric.note}</div>
                </div>
                <Icon className={metric.tone} size={19} />
              </div>
            </Panel>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <PanelHeader>
            <PanelTitle>批次处理趋势</PanelTitle>
            <BatchStatusBadge status={activeBatch.status} />
          </PanelHeader>
          <div className="px-4 py-4">
            <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>进度 {activeBatch.progress}%</span>
              <span>{formatNumber(activeBatch.rows)} 行 / {formatNumber(activeBatch.documents)} 张</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${activeBatch.progress}%` }} />
            </div>
            <div className="mt-6 grid h-52 grid-cols-8 items-end gap-3 border-b border-l border-border px-4 pb-4">
              {[18, 24, 35, 52, 83, 77, 58, 64].map((height, index) => (
                <div key={index} className="flex flex-col items-center gap-2">
                  <div className="w-full rounded-t bg-info" style={{ height: `${height * 1.7}px` }} />
                  <span className="text-[11px] text-muted-foreground">{index + 1}时</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>待处理风险</PanelTitle>
            <Button size="sm" variant="ghost">进入审核</Button>
          </PanelHeader>
          <div className="divide-y divide-border">
            {conflicts.map((conflict) => (
              <div key={conflict.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">{conflict.type}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{conflict.reason}</div>
                </div>
                <div className="flex items-center gap-2">
                  <RiskBadge risk={conflict.severity} />
                  <span className="text-xs text-muted-foreground">{conflict.sourceCount} 行</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <TableWrap>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold">最近失败</div>
          <Button size="sm" variant="ghost">批量重试</Button>
        </div>
        <DataTable>
          <thead className={tableHeadClass}>
            <tr>
              <th className={tableCellClass}>文件名</th>
              <th className={tableCellClass}>风险</th>
              <th className={tableCellClass}>失败原因</th>
              <th className={tableCellClass}>更新时间</th>
              <th className={tableCellClass}>操作</th>
            </tr>
          </thead>
          <tbody>
            {documents.filter((doc) => doc.status === "failed" || doc.risk === "high").map((doc) => (
              <tr key={doc.id} className="hover:bg-muted/70">
                <td className={tableCellClass}>{doc.fileName}</td>
                <td className={tableCellClass}><RiskBadge risk={doc.risk} /></td>
                <td className={tableCellClass}>{doc.failedReason ?? recognitionRows.find((row) => row.documentId === doc.id)?.conflictReason ?? "需要人工复核"}</td>
                <td className={tableCellClass}>{doc.updatedAt}</td>
                <td className={tableCellClass}><Button size="sm" variant="secondary">重试</Button></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </TableWrap>
    </div>
  );
}
