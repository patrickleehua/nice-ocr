import Link from "next/link";
import { MoreHorizontal, Plus, UploadCloud } from "lucide-react";
import { batches } from "@/data/mock-data";
import { Button } from "@/components/ui/button";
import { BatchStatusBadge } from "@/components/ui/status";
import { DataTable, tableCellClass, tableHeadClass, TableWrap } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";

export function BatchesPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">批次管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">按批次维护上传、识别、审核、导出进度。</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary">
            <UploadCloud size={15} />
            上传文件
          </Button>
          <Button size="sm" variant="primary">
            <Plus size={15} />
            新建批次
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
        <input className="h-9 w-64 rounded-md border border-border px-3 text-sm outline-none focus:border-primary" placeholder="搜索批次名称/备注" />
        <select className="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary">
          <option>全部状态</option>
          <option>处理中</option>
          <option>完成</option>
          <option>失败</option>
        </select>
        <select className="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary">
          <option>全部策略</option>
          <option>balanced</option>
          <option>fast</option>
          <option>consensus</option>
        </select>
      </div>

      <TableWrap>
        <DataTable>
          <thead className={tableHeadClass}>
            <tr>
              <th className={tableCellClass}>批次名称</th>
              <th className={tableCellClass}>状态</th>
              <th className={tableCellClass}>文档数</th>
              <th className={tableCellClass}>行数</th>
              <th className={tableCellClass}>失败数</th>
              <th className={tableCellClass}>待审核行</th>
              <th className={tableCellClass}>策略</th>
              <th className={tableCellClass}>创建时间</th>
              <th className={tableCellClass}>操作</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr key={batch.id} className="hover:bg-muted/70">
                <td className={tableCellClass}>
                  <Link href={`/batches/${batch.id}`} className="font-medium text-primary hover:underline">
                    {batch.name}
                  </Link>
                </td>
                <td className={tableCellClass}><BatchStatusBadge status={batch.status} /></td>
                <td className={tableCellClass}>{formatNumber(batch.documents)}</td>
                <td className={tableCellClass}>{formatNumber(batch.rows)}</td>
                <td className={tableCellClass}>{batch.failed}</td>
                <td className={tableCellClass}>{formatNumber(batch.needsReview)}</td>
                <td className={tableCellClass}>{batch.strategy}</td>
                <td className={tableCellClass}>{batch.createdAt}</td>
                <td className={tableCellClass}>
                  <Button size="icon" variant="ghost" aria-label="更多操作"><MoreHorizontal size={16} /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </TableWrap>
    </div>
  );
}
