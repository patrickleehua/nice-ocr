"use client";

import { Ban, CheckCircle2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/ui/status";
import { DataTable, tableCellClass, tableHeadClass, TableWrap } from "@/components/ui/table";
import { apiGet, apiJson } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/paths";
import type { RiskLevel } from "@/lib/types";

interface ApiConflict {
  id: string;
  type: string;
  severity: RiskLevel;
  reason: string;
  sourceRowIdsJson?: string;
  status: "open" | "resolved" | "ignored";
  product?: { name: string; code?: string | null } | null;
}

const statusBadge: Record<ApiConflict["status"], { label: string; tone: "warning" | "success" | "neutral" }> = {
  open: { label: "未处理", tone: "warning" },
  resolved: { label: "已解决", tone: "success" },
  ignored: { label: "已忽略", tone: "neutral" },
};

export function ConflictsPage() {
  const queryClient = useQueryClient();
  const [onlyOpen, setOnlyOpen] = useState(true);

  const { data, isLoading } = useQuery<{ conflicts: ApiConflict[] }>({
    queryKey: ["conflicts"],
    queryFn: () => apiGet(apiPaths.conflicts),
  });

  const resolve = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "resolved" | "ignored" }) =>
      apiJson(apiPaths.conflict(id), { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conflicts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  const all = data?.conflicts ?? [];
  const conflicts = onlyOpen ? all.filter((conflict) => conflict.status === "open") : all;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">冲突管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">按严重程度处理产品库和识别明细中的数据质量问题。</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={onlyOpen}
            onChange={(event) => setOnlyOpen(event.target.checked)}
          />
          仅看未处理
        </label>
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
            {conflicts.length ? (
              conflicts.map((conflict) => {
                const sourceCount = safeParseArray(conflict.sourceRowIdsJson).length;
                const badge = statusBadge[conflict.status];
                return (
                  <tr key={conflict.id} className="hover:bg-muted/70">
                    <td className={tableCellClass}>{conflict.type}</td>
                    <td className={tableCellClass}><RiskBadge risk={conflict.severity} /></td>
                    <td className={tableCellClass}>{conflict.product?.name ?? conflict.product?.code ?? "-"}</td>
                    <td className={tableCellClass}>{conflict.reason}</td>
                    <td className={tableCellClass}>{sourceCount}</td>
                    <td className={tableCellClass}><Badge tone={badge.tone}>{badge.label}</Badge></td>
                    <td className={tableCellClass}>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => resolve.mutate({ id: conflict.id, status: "resolved" })}
                          disabled={resolve.isPending || conflict.status !== "open"}
                        >
                          <CheckCircle2 size={14} />解决
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => resolve.mutate({ id: conflict.id, status: "ignored" })}
                          disabled={resolve.isPending || conflict.status !== "open"}
                        >
                          <Ban size={14} />忽略
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className={tableCellClass} colSpan={7}>
                  <span className="text-muted-foreground">{isLoading ? "加载中..." : "暂无冲突"}</span>
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </TableWrap>
    </div>
  );
}

function safeParseArray(json: string | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
