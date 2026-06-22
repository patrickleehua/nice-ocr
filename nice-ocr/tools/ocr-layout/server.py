"""本地 PaddleOCR 版面服务（行级原图定位用）。

设计要点：
- 常驻进程，启动时加载一次 PaddleOCR 模型；Node 端 worker 通过 HTTP 调用，避免每张图冷启动。
- 只做「检测 + 识别」并返回每条文字行的归一化包围盒 + 文本 + 置信度；
  行聚类、与识别结果的匹配放在 Node 端纯函数里做（可单测、可换后端）。
- 兼容 PaddleOCR 2.x(.ocr) 与 3.x(.predict) 两套 API，输出统一归一化结构。

启动：
    uvicorn server:app --host 127.0.0.1 --port 8077
或：
    python server.py
"""

from __future__ import annotations

import base64
import io
import os
import threading
from functools import lru_cache
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image

OCR_LANG = os.environ.get("OCR_LAYOUT_LANG", "ch")

app = FastAPI(title="nice-ocr layout service")

# PaddleOCR 预测器非线程安全：FastAPI 把同步接口丢线程池并行执行，worker 并发(默认 3)会同时
# 打多个 /layout，多线程同时 predict 同一实例会偶发 500。用全局锁串行化（OCR 本就 CPU 密集）。
_ocr_lock = threading.Lock()


class LayoutRequest(BaseModel):
    # 二选一：本机绝对/相对路径，或 base64（worker 与本服务同机时优先用 imagePath，零拷贝）。
    imagePath: str | None = None
    imageBase64: str | None = None


def _truthy(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip().lower() in {"1", "true", "yes", "on"}


@lru_cache(maxsize=1)
def get_ocr():
    """惰性加载 PaddleOCR；首次调用会下载模型（数十 MB）。

    默认关闭文档方向分类 / 去扭曲 / 文字行方向三个可选子模型：
    票据基本平整、用不上，关掉可少下 3 个模型、加快首次启动、减少对模型服务器的依赖。
    需要时用环境变量 OCR_LAYOUT_ORIENT=1 打开文字行方向。
    """
    from paddleocr import PaddleOCR

    orient = _truthy("OCR_LAYOUT_ORIENT")
    # 3.x 形参；旧版（2.x）不识别这些参数 → 回退到 use_angle_cls。
    try:
        return PaddleOCR(
            lang=OCR_LANG,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=orient,
        )
    except TypeError:
        return PaddleOCR(lang=OCR_LANG, use_angle_cls=orient)


def _load_image(req: LayoutRequest) -> tuple[Any, int, int]:
    if req.imagePath:
        if not os.path.exists(req.imagePath):
            raise HTTPException(status_code=404, detail=f"image not found: {req.imagePath}")
        with Image.open(req.imagePath) as im:
            width, height = im.size
        return req.imagePath, width, height
    if req.imageBase64:
        raw = base64.b64decode(req.imageBase64)
        with Image.open(io.BytesIO(raw)) as im:
            width, height = im.size
        # PaddleOCR 接受 numpy 数组；避免额外依赖，落临时文件交给 imagePath 分支更稳妥。
        import tempfile

        fd, path = tempfile.mkstemp(suffix=".png")
        os.close(fd)
        Image.open(io.BytesIO(raw)).convert("RGB").save(path)
        return path, width, height
    raise HTTPException(status_code=400, detail="imagePath or imageBase64 required")


def _poly_to_box(poly: list[list[float]], width: int, height: int) -> dict[str, float]:
    xs = [float(p[0]) for p in poly]
    ys = [float(p[1]) for p in poly]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    return {
        "x": _clamp01(x0 / width),
        "y": _clamp01(y0 / height),
        "w": _clamp01((x1 - x0) / width),
        "h": _clamp01((y1 - y0) / height),
    }


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def _run_ocr(image_path: str) -> list[tuple[list[list[float]], str, float]]:
    """统一返回 [(poly4, text, score), ...]，兼容 2.x / 3.x。"""
    ocr = get_ocr()
    # 串行化推理：预测器非线程安全，并发请求必须排队。
    with _ocr_lock:
        return _run_ocr_locked(ocr, image_path)


def _run_ocr_locked(ocr, image_path: str) -> list[tuple[list[list[float]], str, float]]:
    lines: list[tuple[list[list[float]], str, float]] = []

    # 3.x: predict 返回 list[dict|Result]，字段含 rec_texts / rec_scores / rec_polys(或 dt_polys)
    if hasattr(ocr, "predict"):
        results = ocr.predict(image_path)
        for res in results or []:
            data = res if isinstance(res, dict) else getattr(res, "json", None) or getattr(res, "res", res)
            if isinstance(data, dict) and "res" in data and isinstance(data["res"], dict):
                data = data["res"]
            texts = (data or {}).get("rec_texts") or []
            scores = (data or {}).get("rec_scores") or []
            polys = (data or {}).get("rec_polys")
            if polys is None:
                polys = (data or {}).get("dt_polys") or []
            for i, poly in enumerate(polys):
                text = texts[i] if i < len(texts) else ""
                score = float(scores[i]) if i < len(scores) else 0.0
                lines.append(([[float(x), float(y)] for x, y in poly], str(text), score))
        if lines:
            return lines

    # 2.x: ocr(img, cls=True) 返回 [[ [poly, (text, score)], ... ]]
    if hasattr(ocr, "ocr"):
        try:
            results = ocr.ocr(image_path, cls=True)
        except TypeError:
            results = ocr.ocr(image_path)
        page = results[0] if results else []
        for item in page or []:
            poly, (text, score) = item[0], item[1]
            lines.append(([[float(x), float(y)] for x, y in poly], str(text), float(score)))
    return lines


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "lang": OCR_LANG}


@app.post("/layout")
def layout(req: LayoutRequest) -> dict[str, Any]:
    image_path, width, height = _load_image(req)
    raw_lines = _run_ocr(image_path)
    lines = [
        {
            "text": text,
            "score": round(score, 4),
            "box": _poly_to_box(poly, width, height),
            "poly": poly,
        }
        for poly, text, score in raw_lines
        if text.strip()
    ]
    return {"width": width, "height": height, "lines": lines}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("OCR_LAYOUT_HOST", "127.0.0.1"),
        port=int(os.environ.get("OCR_LAYOUT_PORT", "8077")),
    )
