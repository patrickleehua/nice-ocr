"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  widthClass = "min-w-16",
  width,
  listId,
  options,
  onCommit,
}: {
  value: string | number | null | undefined;
  type?: "text" | "number";
  align?: "left" | "right";
  disabled?: boolean;
  /** 输入框/单元格最小宽度类；商品名等长文本列传入更宽的值，避免名称被截断。 */
  widthClass?: string;
  /** 用户拖拽设定的列宽（px）；设置后以内联样式覆盖 widthClass（item 2 列宽可调）。 */
  width?: number;
  /** 关联的 <datalist> id，启用输入词语联想（item 1，仅文本字段）。 */
  listId?: string;
  /** 本单元格专属联想候选（优先于 listId）：用于「按产品名联想单位」这类按行变化的候选。 */
  options?: string[];
  onCommit: (next: string) => void;
}) {
  const widthStyle = width ? { width, minWidth: width, maxWidth: width } : undefined;
  const ownListId = useId();
  const hasOptions = Boolean(options && options.length);
  const effectiveListId = hasOptions ? ownListId : listId;
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
      <td
        className={cn(tableCellClass, width ? undefined : widthClass, align === "right" && "text-right")}
        style={widthStyle}
      >
        {raw === "" ? "-" : raw}
      </td>
    );
  }

  return (
    <td className={cn(tableCellClass, "p-1")} style={widthStyle}>
      {hasOptions ? (
        <datalist id={ownListId}>
          {options!.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
      <input
        type={type}
        step={type === "number" ? "any" : undefined}
        list={effectiveListId}
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
          "h-7 w-full rounded border border-transparent bg-transparent px-2 text-xs outline-none transition-colors",
          widthClass,
          "hover:border-border focus:border-primary focus:bg-background",
          align === "right" && "text-right",
        )}
      />
    </td>
  );
}
