"use client";

import { AlertTriangle, Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/card";
import type { RecognitionRow } from "@/lib/types";

export function DrawerShell({
  title,
  children,
  open,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25">
      <aside className="h-full w-full max-w-md border-l border-border bg-surface shadow-xl">
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button size="icon" variant="ghost" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </aside>
    </div>
  );
}

export function CreateBatchDrawer({
  open,
  onClose,
  onSubmit,
  defaultApprovalMode = "hybrid",
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; strategy: string; notes: string; approvalMode: string }) => void;
  defaultApprovalMode?: string;
}) {
  return (
    <DrawerShell title="创建批次" open={open} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSubmit({
            name: String(form.get("name") ?? ""),
            strategy: String(form.get("strategy") ?? "balanced"),
            notes: String(form.get("notes") ?? ""),
            approvalMode: String(form.get("approvalMode") ?? "hybrid"),
          });
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">批次名称</span>
          <input name="name" required className="h-9 w-full rounded-md border border-border px-3" placeholder="2024-06 销售单据批次" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">审批模式</span>
          <select name="approvalMode" defaultValue={defaultApprovalMode} className="h-9 w-full rounded-md border border-border bg-surface px-3">
            <option value="manual">全人工：所有行人工确认</option>
            <option value="hybrid">混合：双次一致+低风险自动通过，其余转人工</option>
            <option value="auto">AI自动：双次一致即自动通过，高风险转人工</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">识别策略</span>
          <select name="strategy" className="h-9 w-full rounded-md border border-border bg-surface px-3">
            <option value="balanced">balanced：风险触发二次识别</option>
            <option value="fast">fast：单次识别</option>
            <option value="consensus">consensus：全量多次识别</option>
            <option value="manual">manual：人工导入</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">备注</span>
          <textarea name="notes" className="min-h-24 w-full rounded-md border border-border px-3 py-2" />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary"><Plus size={15} />创建</Button>
        </div>
      </form>
    </DrawerShell>
  );
}

export function EditRowDrawer({
  row,
  open,
  onClose,
  onSubmit,
}: {
  row?: RecognitionRow;
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: Partial<RecognitionRow>) => void;
}) {
  return (
    <DrawerShell title="编辑识别行" open={open} onClose={onClose}>
      {row ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onSubmit({
              code: String(form.get("code") ?? ""),
              name: String(form.get("name") ?? ""),
              unit: String(form.get("unit") ?? ""),
              qty: Number(form.get("qty") ?? 0),
              price: Number(form.get("price") ?? 0),
              amount: Number(form.get("amount") ?? 0),
              remark: String(form.get("remark") ?? ""),
            });
          }}
        >
          {[
            ["code", "产品编码", row.code],
            ["name", "产品名称", row.name],
            ["unit", "单位", row.unit],
            ["qty", "数量", row.qty],
            ["price", "单价", row.price],
            ["amount", "金额", row.amount],
          ].map(([name, label, value]) => (
            <label key={String(name)} className="block text-sm">
              <span className="mb-1 block text-muted-foreground">{String(label)}</span>
              <input name={String(name)} defaultValue={String(value ?? "")} className="h-9 w-full rounded-md border border-border px-3" />
            </label>
          ))}
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">备注</span>
            <textarea name="remark" defaultValue={row.remark ?? ""} className="min-h-20 w-full rounded-md border border-border px-3 py-2" />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>取消</Button>
            <Button type="submit" variant="primary"><Check size={15} />保存</Button>
          </div>
        </form>
      ) : null}
    </DrawerShell>
  );
}

export function RiskDetailDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <DrawerShell title="风险详情" open={open} onClose={onClose}>
      <Panel>
        <PanelHeader>
          <PanelTitle>风险解释</PanelTitle>
          <AlertTriangle className="text-danger-strong" size={18} />
        </PanelHeader>
        <div className="space-y-3 p-4 text-sm">
          <div>系统会综合商品名规则、金额校验、产品库冲突和多次识别差异给出风险等级。</div>
          <div className="rounded-md bg-danger-soft p-3 text-danger-strong">高风险行不会被自动确认，需要人工审核。</div>
        </div>
      </Panel>
    </DrawerShell>
  );
}
