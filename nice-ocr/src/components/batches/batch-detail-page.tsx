import { ChevronLeft, Pause, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { batches, documents } from "@/data/mock-data";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { BatchStatusBadge, JobStatusBadge, RiskBadge } from "@/components/ui/status";
import { DataTable, tableCellClass, tableHeadClass, TableWrap } from "@/components/ui/table";

export function BatchDetailPage() {
  const batch = batches[0];
  const selected = documents[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/batches" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
            <ChevronLeft size={14} />
            返回批次
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{batch.name}</h1>
            <BatchStatusBadge status={batch.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary"><Pause size={15} />暂停</Button>
          <Button size="sm" variant="secondary"><Play size={15} />继续</Button>
          <Button size="sm" variant="primary"><RotateCcw size={15} />重试失败</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <TableWrap className="min-h-[560px]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold">文件列表</div>
            <div className="text-xs text-muted-foreground">进度 {batch.progress}%</div>
          </div>
          <DataTable>
            <thead className={tableHeadClass}>
              <tr>
                <th className={tableCellClass}>文件名</th>
                <th className={tableCellClass}>状态</th>
                <th className={tableCellClass}>行数</th>
                <th className={tableCellClass}>风险</th>
                <th className={tableCellClass}>更新时间</th>
                <th className={tableCellClass}>操作</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-muted/70">
                  <td className={tableCellClass}>{doc.fileName}</td>
                  <td className={tableCellClass}>{doc.status}</td>
                  <td className={tableCellClass}>{doc.rows || "-"}</td>
                  <td className={tableCellClass}><RiskBadge risk={doc.risk} /></td>
                  <td className={tableCellClass}>{doc.updatedAt}</td>
                  <td className={tableCellClass}><Button size="sm" variant="secondary">查看</Button></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableWrap>

        <div className="space-y-4">
          <Panel>
            <PanelHeader>
              <PanelTitle>{selected.fileName}</PanelTitle>
              <Button size="sm" variant="secondary">查看大图</Button>
            </PanelHeader>
            <div className="p-4">
              <div className="flex h-44 items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground">
                单据预览
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">状态</dt><dd className="mt-1">已完成</dd></div>
                <div><dt className="text-xs text-muted-foreground">行数</dt><dd className="mt-1">{selected.rows}</dd></div>
                <div><dt className="text-xs text-muted-foreground">风险等级</dt><dd className="mt-1"><RiskBadge risk={selected.risk} /></dd></div>
                <div><dt className="text-xs text-muted-foreground">更新时间</dt><dd className="mt-1">{selected.updatedAt}</dd></div>
              </dl>
            </div>
          </Panel>

          <Panel>
            <PanelHeader>
              <PanelTitle>识别尝试</PanelTitle>
            </PanelHeader>
            <div className="divide-y divide-border">
              {selected.attempts.map((attempt) => (
                <div key={attempt.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>{attempt.provider}/{attempt.model}</span>
                    <JobStatusBadge status={attempt.status} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{attempt.completedAt ?? attempt.error}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
