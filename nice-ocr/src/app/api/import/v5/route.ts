import { NextResponse } from "next/server";
import { importLegacyRecognitionRows, type LegacyRecognitionRow } from "@/lib/workflows/import-v5";

export const runtime = "nodejs";

async function readJsonArray(formData: FormData, key: string) {
  const file = formData.get(key);
  if (!(file instanceof File)) return [];
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`${key} must be a JSON array`);
  }
  return parsed;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const rows = (await readJsonArray(formData, "recognitionResults")) as LegacyRecognitionRow[];
  return NextResponse.json(await importLegacyRecognitionRows(rows));
}
