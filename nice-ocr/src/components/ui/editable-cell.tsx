"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { tableCellClass } from "@/components/ui/table";

/**
 * 表格内联编辑单元格（渲染为 <td>）。
 * 点击进入编辑：Enter / 失焦提交，Esc 取消。审核台与全部结果共用，替代弹窗编辑。
 */
export function EditableCell({
  value,
  type = "text",
  align = "left",
  disabled = false,
  format,
  onCommit,
}: {
  value: string | number | null | undefined;
  type?: "text" | "number";
  align?: "left" | "right";
  disabled?: boolean;
  format?: (value: string | number | null | undefined) => string;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const raw = value == null ? "" : String(value);

  function start() {
    if (disabled) return;
    setDraft(raw);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== raw.trim()) onCommit(next);
  }

  function cancel() {
    setEditing(false);
    setDraft(raw);
  }

  if (editing) {
    return (
      <td className={cn(tableCellClass, "p-1")}>
        <input
          autoFocus
          type={type}
          step={type === "number" ? "any" : undefined}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          className={cn(
            "h-7 w-full min-w-16 rounded border border-primary bg-background px-2 text-xs outline-none",
            align === "right" && "text-right",
          )}
        />
      </td>
    );
  }

  const display = format ? format(value) : raw === "" ? "-" : raw;
  return (
    <td
      className={cn(
        tableCellClass,
        align === "right" && "text-right",
        disabled ? undefined : "cursor-text hover:bg-primary/5",
      )}
      onClick={start}
      title={disabled ? undefined : "点击编辑"}
    >
      {display}
    </td>
  );
}
