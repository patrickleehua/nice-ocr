import { Badge } from "@/components/ui/badge";
import type { BatchStatus, JobStatus, RiskLevel, RowStatus } from "@/lib/types";

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const map = {
    low: { label: "低", tone: "success" as const },
    medium: { label: "中", tone: "warning" as const },
    high: { label: "高", tone: "danger" as const },
  };
  return <Badge tone={map[risk].tone}>{map[risk].label}</Badge>;
}

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const map = {
    processing: { label: "处理中", tone: "info" as const },
    needs_review: { label: "待核查", tone: "warning" as const },
    completed: { label: "完成", tone: "success" as const },
    failed: { label: "失败", tone: "danger" as const },
    paused: { label: "已暂停", tone: "warning" as const },
    imported: { label: "导入", tone: "neutral" as const },
  };
  return <Badge tone={map[status].tone}>{map[status].label}</Badge>;
}

export function RowStatusBadge({ status }: { status: RowStatus }) {
  const map = {
    pending: { label: "待审核", tone: "warning" as const },
    confirmed: { label: "已确认", tone: "success" as const },
    needs_review: { label: "需复核", tone: "warning" as const },
    conflict: { label: "冲突", tone: "danger" as const },
    excluded: { label: "已排除", tone: "neutral" as const },
  };
  return <Badge tone={map[status].tone}>{map[status].label}</Badge>;
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const map = {
    queued: { label: "排队", tone: "neutral" as const },
    active: { label: "处理中", tone: "info" as const },
    retrying: { label: "重试中", tone: "warning" as const },
    completed: { label: "成功", tone: "success" as const },
    failed: { label: "失败", tone: "danger" as const },
  };
  return <Badge tone={map[status].tone}>{map[status].label}</Badge>;
}
