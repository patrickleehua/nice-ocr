import { Download, Eye, RefreshCw } from "lucide-react";
import { products } from "@/data/mock-data";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, tableCellClass, tableHeadClass, TableWrap } from "@/components/ui/table";

export function ProductsPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">产品库</h1>
          <p className="mt-1 text-sm text-muted-foreground">从识别明细沉淀产品资料，并维护编码、名称、单位冲突。</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary"><RefreshCw size={15} />重建观察</Button>
          <Button size="sm" variant="primary"><Download size={15} />导出</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
        <input className="h-9 w-72 rounded-md border border-border px-3 text-sm" placeholder="搜索产品名/编码/别名" />
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="h-4 w-4" />
          仅看冲突
        </label>
      </div>

      <TableWrap>
        <DataTable>
          <thead className={tableHeadClass}>
            <tr>
              <th className={tableCellClass}>产品编码</th>
              <th className={tableCellClass}>产品名</th>
              <th className={tableCellClass}>单位</th>
              <th className={tableCellClass}>别名</th>
              <th className={tableCellClass}>出现次数</th>
              <th className={tableCellClass}>来源文档</th>
              <th className={tableCellClass}>多编码说明</th>
              <th className={tableCellClass}>多单位说明</th>
              <th className={tableCellClass}>冲突</th>
              <th className={tableCellClass}>操作</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-muted/70">
                <td className={tableCellClass}>{product.code || "-"}</td>
                <td className={tableCellClass}>{product.name}</td>
                <td className={tableCellClass}>{product.unit || "-"}</td>
                <td className={tableCellClass}>{product.aliases.join("、") || "-"}</td>
                <td className={tableCellClass}>{product.observationCount}</td>
                <td className={tableCellClass}>{product.sourceDocuments}</td>
                <td className={tableCellClass}>{product.multiCodeNote ?? "-"}</td>
                <td className={tableCellClass}>{product.multiUnitNote ?? "-"}</td>
                <td className={tableCellClass}>
                  {product.conflict ? <Badge tone="danger">冲突</Badge> : <Badge tone="success">正常</Badge>}
                </td>
                <td className={tableCellClass}>
                  <Button size="sm" variant="secondary"><Eye size={14} />来源</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </TableWrap>
    </div>
  );
}
