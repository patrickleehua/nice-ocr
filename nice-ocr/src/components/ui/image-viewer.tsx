"use client";

import { ImageOff, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const STEP = 0.25;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));

/**
 * 原图查看器：缩放（按钮 / Ctrl+滚轮）+ 在透明画布内自由拖拽平移。
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
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // 切换图片时重置缩放与错误态（渲染期同步调整，避免 effect 级联渲染）。
  if (src !== prevSrc) {
    setPrevSrc(src);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setError(false);
  }

  const canPan = Boolean(src && !error);

  // Ctrl+滚轮 / 触摸板捏合缩放：必须用原生「非 passive」监听，React 合成 onWheel 是 passive，
  // preventDefault 无效会导致整页一起缩放。这里只缩放画布内图片，并阻止浏览器默认页面缩放。
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((z) => clampZoom(z - Math.sign(event.deltaY) * STEP));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(event: React.PointerEvent) {
    const el = canvasRef.current;
    if (!el || !canPan) return;
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    setPanning(true);
    el.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!drag.current) return;
    setPan({
      x: drag.current.panX + event.clientX - drag.current.x,
      y: drag.current.panY + event.clientY - drag.current.y,
    });
  }

  function endPan(event: React.PointerEvent) {
    const el = canvasRef.current;
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
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Maximize2 size={15} />
        </button>
        <span className="ml-1 text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <span className="ml-auto text-[11px] text-muted-foreground">Ctrl+滚轮缩放 · 放大后可拖拽</span>
      </div>

      <div
        ref={canvasRef}
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden bg-muted",
          canPan ? (panning ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        {src && !error ? (
          <div
            // 顶部对齐而非垂直居中：竖向票据在宽度受限时高度填不满，居中会在上方挤出大片空白；
            // 紧贴工具栏向下展示更符合从上往下的阅读习惯。横向放大后仍可自由拖拽平移。
            className="pointer-events-none absolute inset-4 flex items-start justify-center"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={src}
              src={src}
              alt={alt}
              draggable={false}
              style={{
                transform: `scale(${zoom})`,
              }}
              className="max-h-full max-w-full select-none rounded border border-border bg-white object-contain shadow-sm"
              onError={() => setError(true)}
            />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
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
