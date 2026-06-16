import { CheckCircle2, Eye, Filter } from "lucide-react";
import { conflicts } from "@/data/mock-data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/ui/status";
import { DataTable, tableCellClass, tableHeadClass, TableWrap } from "@/components/ui/table";

export function ConflictsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">冲突管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">按严重程度处理产品库和识别明细中的数据质量问题。</p>
        </div>
        <Button size="sm" variant="secondary"><Filter size={15} />筛选冲突</Button>
      </div>

      <TableWrap>
        <DataTable>
          <thead className={tableHeadClass}>
            <tr>
              <th className={tableCellClass}>冲突类型</th>
              <th className={tableCellClass}>严重度</th>
              <th className={tableCellClass}>产品</th>
              <th className={tableCellClass}>原因</th>
              <th className={tableCellClass}>来源行</th>
              <th className={tableCellClass}>状态</th>
              <th className={tableCellClass}>操作</th>
            </tr>
          </thead>
          <tbody>
            {conflicts.map((conflict) => (
              <tr key={conflict.id} className="hover:bg-muted/70">
                <td className={tableCellClass}>{conflict.type}</td>
                <td className={tableCellClass}><RiskBadge risk={conflict.severity} /></td>
                <td className={tableCellClass}>{conflict.product}</td>
                <td className={tableCellClass}>{conflict.reason}</td>
                <td className={tableCellClass}>{conflict.sourceCount}</td>
                <td className={tableCellClass}><Badge tone="warning">未处理</Badge></td>
                <td className={tableCellClass}>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary"><Eye size={14} />查看</Button>
                    <Button size="sm" variant="primary"><CheckCircle2 size={14} />解决</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </TableWrap>
    </div>
  );
}
