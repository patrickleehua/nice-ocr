"use client";

import { ImageOff, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const STEP = 0.25;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));

/**
 * 原图查看器：缩放（按钮 / Ctrl+滚轮）+ 拖拽平移（放大后按住拖动）。
 * 拖拽通过滚动容器的 scrollLeft/Top 实现，缩放 >1 时显示 grab 光标。
 */
export function ImageViewer({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState(false);
  const [panning, setPanning] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  // 切换图片时重置缩放与错误态（渲染期同步调整，避免 effect 级联渲染）。
  if (src !== prevSrc) {
    setPrevSrc(src);
    setZoom(1);
    setError(false);
  }

  const canPan = zoom > 1;

  function onPointerDown(event: React.PointerEvent) {
    const el = scrollRef.current;
    if (!el || !canPan) return;
    drag.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
    setPanning(true);
    el.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    const el = scrollRef.current;
    if (!drag.current || !el) return;
    el.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
    el.scrollTop = drag.current.top - (event.clientY - drag.current.y);
  }

  function endPan(event: React.PointerEvent) {
    const el = scrollRef.current;
    drag.current = null;
    setPanning(false);
    if (el?.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        <button
          type="button"
          aria-label="放大"
          onClick={() => setZoom((z) => clampZoom(z + STEP))}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ZoomIn size={15} />
        </button>
        <button
          type="button"
          aria-label="缩小"
          onClick={() => setZoom((z) => clampZoom(z - STEP))}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ZoomOut size={15} />
        </button>
        <button
          type="button"
          aria-label="适应窗口"
          onClick={() => setZoom(1)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Maximize2 size={15} />
        </button>
        <span className="ml-1 text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+滚轮缩放 · 放大后可拖拽</span>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-auto bg-muted p-4",
          canPan ? (panning ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onWheel={(event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          setZoom((z) => clampZoom(z - Math.sign(event.deltaY) * STEP));
        }}
      >
        {src && !error ? (
          <div
            className={cn(
              "flex min-h-full min-w-full items-start",
              canPan ? "justify-start" : "justify-center",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={src}
              src={src}
              alt={alt}
              draggable={false}
              style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? "100%" : "none" }}
              className="h-auto shrink-0 select-none rounded border border-border bg-white object-contain shadow-sm"
              onError={() => setError(true)}
            />
          </div>
        ) : (
          <div className="flex min-h-full min-w-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageOff size={28} />
              <span className="text-xs">原图不可用（未上传或文件缺失）</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
