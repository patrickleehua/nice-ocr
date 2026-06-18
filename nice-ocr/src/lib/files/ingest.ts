import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { unzipSync } from "fflate";
import { pdf } from "pdf-to-img";

/**
 * 上传文件解析：把图片 / PDF / ZIP 统一展开为「可识别图片」列表。
 * 下游（存储 / Document / 识别 / 预览）一律按图片处理，无需感知原始格式。
 */
export interface IngestedImage {
  /** 展开后的文件名（用于 Document.originalName 与存储扩展名） */
  name: string;
  buffer: Buffer;
  mimeType: string;
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i;
/** PDF 渲染倍率：2x 兼顾清晰度与体积，利于 OCR 识别。 */
const PDF_RENDER_SCALE = 2;

function baseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function imageMime(name: string): string {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  switch (ext) {
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "tif":
    case "tiff":
      return "image/tiff";
    default:
      return "image/jpeg";
  }
}

function isImage(name: string, mime?: string): boolean {
  return IMAGE_EXT.test(name) || Boolean(mime && mime.startsWith("image/"));
}

function isPdf(name: string, mime?: string): boolean {
  return /\.pdf$/i.test(name) || mime === "application/pdf";
}

function isZip(name: string, mime?: string): boolean {
  return (
    /\.zip$/i.test(name) ||
    mime === "application/zip" ||
    mime === "application/x-zip-compressed" ||
    mime === "multipart/x-zip"
  );
}

interface PdfAssetUrls {
  standardFontDataUrl: string;
  cMapUrl: string;
  cMapPacked: true;
}

/**
 * 解析 pdfjs 标准字体 / CMap 资源目录（CMap 影响中文等 CJK 文字的 PDF 渲染，字体影响标准字体文字）。
 * Node 字体工厂用 fs.readFile 读取，故传**正斜杠 + 尾随 `/`** 的文件系统路径（pdfjs 校验要求结尾为 `/`）。
 * 仅解析一次并缓存；失败则降级为不传（扫描件 PDF 不受影响）。
 */
let cachedAssets: PdfAssetUrls | null | undefined;
function pdfAssetUrls(): PdfAssetUrls | undefined {
  if (cachedAssets !== undefined) return cachedAssets ?? undefined;
  try {
    const require = createRequire(path.join(process.cwd(), "package.json"));
    let dir = path.dirname(require.resolve("pdfjs-dist"));
    for (let i = 0; i < 5; i += 1) {
      if (fs.existsSync(path.join(dir, "standard_fonts"))) {
        const toUrl = (sub: string) => path.join(dir, sub).replace(/\\/g, "/") + "/";
        cachedAssets = {
          standardFontDataUrl: toUrl("standard_fonts"),
          cMapUrl: toUrl("cmaps"),
          cMapPacked: true,
        };
        return cachedAssets;
      }
      dir = path.dirname(dir);
    }
  } catch {
    /* 解析失败则降级 */
  }
  cachedAssets = null;
  return undefined;
}

/** 把 PDF 每页渲染为 PNG，每页一个图片条目。 */
async function renderPdfPages(name: string, buffer: Buffer): Promise<IngestedImage[]> {
  const pages: IngestedImage[] = [];
  const doc = await pdf(new Uint8Array(buffer), {
    scale: PDF_RENDER_SCALE,
    docInitParams: pdfAssetUrls(),
  });
  let index = 0;
  for await (const page of doc) {
    index += 1;
    pages.push({
      name: `${stripExt(baseName(name))}-p${index}.png`,
      buffer: Buffer.from(page),
      mimeType: "image/png",
    });
  }
  return pages;
}

/**
 * 把一个上传文件展开为可识别图片列表：
 * - 图片：原样透传
 * - PDF：每页渲染成 PNG（每页一个条目）
 * - ZIP：解压，对其中图片/PDF 处理（忽略目录、隐藏项、__MACOSX 及其它格式）
 * 不支持的单文件返回空数组，调用方据此提示。
 */
export async function ingestUpload(
  name: string,
  buffer: Buffer,
  mimeType?: string,
): Promise<IngestedImage[]> {
  if (isZip(name, mimeType)) {
    const entries = unzipSync(new Uint8Array(buffer));
    const result: IngestedImage[] = [];
    for (const [entryPath, data] of Object.entries(entries)) {
      if (entryPath.endsWith("/")) continue; // 目录项
      const base = baseName(entryPath);
      if (!base || base.startsWith(".") || entryPath.startsWith("__MACOSX")) continue;
      const buf = Buffer.from(data);
      if (isImage(base)) {
        result.push({ name: base, buffer: buf, mimeType: imageMime(base) });
      } else if (isPdf(base)) {
        result.push(...(await renderPdfPages(base, buf)));
      }
    }
    return result;
  }

  if (isPdf(name, mimeType)) return renderPdfPages(name, buffer);

  if (isImage(name, mimeType)) {
    return [{ name, buffer, mimeType: mimeType?.startsWith("image/") ? mimeType : imageMime(name) }];
  }

  return [];
}
