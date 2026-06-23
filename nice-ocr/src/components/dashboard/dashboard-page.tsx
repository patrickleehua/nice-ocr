"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, FileImage, RefreshCw, ShieldCheck, Table2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import { RiskBadge } from "@/components/ui/status";
import { ReasonBadge, ReasonList } from "@/components/ui/reason-badge";
import { DataTable, tableCellClass, tableHeadClass, TableWrap } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { apiGet, apiJson } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/paths";
import type { RiskLevel } from "@/lib/types";

/** 把毫秒格式化为简洁时长（h/m/s），0 或负值显示破折号。 */
function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

interface DashboardSummary {
  metrics: {
    documents: number;
    queued: number;
    failed: number;
    pendingRows: number;
    confirmedRows: number;
    conflicts: number;
    autoApprovedRows: number;
    humanConfirmedRows: number;
    autoApprovalRate: number;
    flaggedRows: number;
  };
  reviewTiming: { totalMs: number; avgMs: number; count: number };
  activeBatch: { id: string; name: string; status: string; documents: number; rows: number } | null;
  recentFailures: Array<{
    id: string;
    batchId: string;
    fileName: string;
    status: string;
    risk: RiskLevel;
    reasons: string[];
    reasonFallback: string;
    updatedAt: string;
  }>;
  topRisks: Array<{ type: string; reason: string; severity: RiskLevel; count: number }>;
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery<DashboardSummary>({
    queryKey: ["dashboard"],
    queryFn: () => apiGet(apiPaths.dashboardSummary),
  });
  const retry = useMutation({
    mutationFn: (documentId: string) => apiJson(apiPaths.documentRetry(documentId), { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  const retryError = (retry.error as Error)?.message ?? null;

  const metrics = data?.metrics;
  const reviewTiming = data?.reviewTiming;
  const processedRows = metrics ? metrics.confirmedRows + metrics.pendingRows : 0;
  const progress = processedRows > 0 ? Math.round((metrics!.confirmedRows / processedRows) * 100) : 0;

  const metricCards: Array<{
    label: string;
    value: number;
    note: string;
    icon: typeof FileImage;
    tone: string;
    href: string;
    valueText?: string;
  }> = [
    { label: "文档总数", value: metrics?.documents ?? 0, note: "全部批次", icon: FileImage, tone: "text-info-strong", href: "/batches" },
    { label: "处理排队", value: metrics?.queued ?? 0, note: "队列中", icon: Clock, tone: "text-warning-strong", href: "/queue" },
    { label: "失败", value: metrics?.failed ?? 0, note: "可重试", icon: AlertTriangle, tone: "text-danger-strong", href: "/queue?status=failed" },
    { label: "待审核行", value: metrics?.pendingRows ?? 0, note: "风险优先", icon: Table2, tone: "text-warning-strong", href: "/review" },
    { label: "冲突数", value: metrics?.conflicts ?? 0, note: "产品库", icon: AlertTriangle, tone: "text-danger-strong", href: "/conflicts" },
    { label: "已确认行", value: metrics?.confirmedRows ?? 0, note: "可导出", icon: CheckCircle2, tone: "text-success-strong", href: "/results?status=confirmed" },
    { label: "总处理时长", value: reviewTiming?.count ?? 0, valueText: formatDuration(reviewTiming?.totalMs ?? 0), note: `${formatNumber(reviewTiming?.count ?? 0)} 单已计时`, icon: Clock, tone: "text-info-strong", href: "/review" },
    { label: "单均处理时长", value: 0, valueText: formatDuration(reviewTiming?.avgMs ?? 0), note: "每单据平均", icon: Clock, tone: "text-info-strong", href: "/review" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">仪表盘</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.activeBatch
              ? `当前批次：${data.activeBatch.name}，系统以风险优先处理待审核数据。`
              : "暂无批次，请先在批次管理中创建并上传单据。"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={15} className={isFetching ? "animate-spin" : undefined} />
            刷新状态
          </Button>
          <Button size="sm" variant="primary" asChild>
            <Link href="/batches">新建批次</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <Link key={metric.label} href={metric.href} className="block focus:outline-none">
              <Panel className="p-4 transition-colors hover:border-primary hover:bg-muted/40">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">{metric.label}</div>
                    <div className="mt-2 text-2xl font-semibold">{isLoading ? "—" : formatNumber(metric.value)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{metric.note}</div>
                  </div>
                  <Icon className={metric.tone} size={19} />
                </div>
              </Panel>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <PanelHeader>
            <PanelTitle>审核进度</PanelTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">自动通过率 {metrics?.autoApprovalRate ?? 0}%</span>
              {metrics?.flaggedRows ? (
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/results?audit=flagged">前往复审</Link>
                </Button>
              ) : null}
            </div>
          </PanelHeader>
          <div className="px-4 py-4">
            <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>确认率 {progress}%</span>
              <span>
                {formatNumber(metrics?.confirmedRows ?? 0)} 已确认 / {formatNumber(metrics?.pendingRows ?? 0)} 待审核
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label="AI自动通过" value={metrics?.autoApprovedRows ?? 0} tone="text-success-strong" href="/results?status=confirmed" />
              <StatTile label="人工确认" value={metrics?.humanConfirmedRows ?? 0} tone="text-info-strong" href="/results?status=confirmed" />
              <StatTile label="待人工复核" value={metrics?.pendingRows ?? 0} tone="text-warning-strong" href="/review" />
              <StatTile label="待复审" value={metrics?.flaggedRows ?? 0} tone="text-danger-strong" href="/results?audit=flagged" />
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>待处理风险</PanelTitle>
            <Button size="sm" variant="ghost" asChild>
              <Link href={data?.activeBatch ? `/review?batchId=${data.activeBatch.id}` : "/review"}>进入审核</Link>
            </Button>
          </PanelHeader>
          <div className="divide-y divide-border">
            {data?.topRisks.length ? (
              data.topRisks.map((risk) => (
                <Link
                  key={risk.type}
                  href="/conflicts"
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/70"
                >
                  <div>
                    <ReasonBadge code={risk.type} />
                    <div className="mt-1 text-xs text-muted-foreground">{risk.reason}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <RiskBadge risk={risk.severity} />
                    <span className="text-xs text-muted-foreground">{risk.count} 行</span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="px-4 py-6 text-sm text-muted-foreground">暂无未处理风险</div>
            )}
          </div>
        </Panel>
      </div>

      <TableWrap>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-semibold">最近失败 / 高风险</div>
          {retryError ? <span className="text-xs text-danger">{retryError}</span> : null}
        </div>
        <DataTable>
          <thead className={tableHeadClass}>
            <tr>
              <th className={tableCellClass}>文件名</th>
              <th className={tableCellClass}>风险</th>
              <th className={tableCellClass}>原因</th>
              <th className={tableCellClass}>更新时间</th>
              <th className={tableCellClass}>操作</th>
            </tr>
          </thead>
          <tbody>
            {data?.recentFailures.length ? (
              data.recentFailures.map((doc) => {
                const retryDisabled = retry.isPending || doc.status === "queued" || doc.status === "processing";
                return (
                  <tr key={doc.id} className="hover:bg-muted/70">
                    <td className={tableCellClass}>
                      <Link
                        href={`/review?batchId=${doc.batchId}&documentId=${doc.id}`}
                        className="font-medium text-primary hover:underline"
                        title="到审核台查看原图并复核"
                      >
                        {doc.fileName}
                      </Link>
                    </td>
                    <td className={tableCellClass}><RiskBadge risk={doc.risk} /></td>
                    <td className={tableCellClass}>
                      <ReasonList codes={doc.reasons} emptyText={doc.reasonFallback} />
                    </td>
                    <td className={tableCellClass}>{formatDateTime(doc.updatedAt)}</td>
                    <td className={tableCellClass}>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/review?batchId=${doc.batchId}&documentId=${doc.id}`} title="到审核台查看原图并复核">
                            <ShieldCheck size={14} />审核
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => retry.mutate(doc.id)}
                          disabled={retryDisabled}
                          title={retryDisabled ? "文档已在队列中或正在处理" : "重新加入识别队列"}
                        >
                          重试
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })

            ) : (
              <tr>
                <td className={tableCellClass} colSpan={5}>
                  <span className="text-muted-foreground">{isLoading ? "加载中..." : "暂无失败或高风险文档"}</span>
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </TableWrap>
    </div>
  );
}

function StatTile({ label, value, tone, href }: { label: string; value: number; tone: string; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-md border border-border bg-surface p-3 transition-colors hover:border-primary hover:bg-muted/40"
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone}`}>{formatNumber(value)}</div>
    </Link>
  );
}
