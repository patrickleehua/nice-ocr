"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { tableCellClass } from "@/components/ui/table";

/**
 * 表格内联编辑单元格（渲染为 <td>），**常驻输入框**。
 *
 * 不在「展示态 / 编辑态」之间切换 DOM —— 输入框始终存在，边框平时透明、
 * hover/聚焦才显形（border-box，不改变盒模型），因此点击编辑不会有布局位移（抖动）。
 * 本地 draft 状态驱动；未聚焦时跟随外部值变化（乐观更新/刷新后）同步。
 * 失焦 / Enter 提交，Esc 还原。结果表与审核台共用。
 */
export function FieldCell({
  value,
  type = "text",
  align = "left",
  disabled = false,
  onCommit,
}: {
  value: string | number | null | undefined;
  type?: "text" | "number";
  align?: "left" | "right";
  disabled?: boolean;
  onCommit: (next: string) => void;
}) {
  const raw = value == null ? "" : String(value);
  const [draft, setDraft] = useState(raw);
  const focused = useRef(false);

  // 未聚焦时，外部值变化（乐观更新 / 后台刷新）同步到 draft；聚焦中不打断用户输入。
  useEffect(() => {
    if (!focused.current) setDraft(raw);
  }, [raw]);

  function commit() {
    const next = draft.trim();
    if (next !== raw.trim()) onCommit(next);
  }

  if (disabled) {
    return (
      <td className={cn(tableCellClass, align === "right" && "text-right")}>{raw === "" ? "-" : raw}</td>
    );
  }

  return (
    <td className={cn(tableCellClass, "p-1")}>
      <input
        type={type}
        step={type === "number" ? "any" : undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(raw);
            focused.current = false;
            event.currentTarget.blur();
          }
        }}
        title="点击编辑"
        className={cn(
          "h-7 w-full min-w-16 rounded border border-transparent bg-transparent px-2 text-xs outline-none transition-colors",
          "hover:border-border focus:border-primary focus:bg-background",
          align === "right" && "text-right",
        )}
      />
    </td>
  );
}
