import { NextResponse } from "next/server";
import { getActiveScenarioId, setActiveScenarioId } from "@/lib/fields/active-scenario";
import { getMetaFields, getScenarioFields, listScenarios } from "@/lib/fields/field-schema";

export const runtime = "nodejs";

/** 返回当前活动场景的字段定义、元字段与可选场景列表，供前端动态出列与导出/识别共享。 */
export async function GET() {
  const activeScenarioId = await getActiveScenarioId();
  return NextResponse.json({
    activeScenarioId,
    scenarios: listScenarios(),
    fields: getScenarioFields(activeScenarioId),
    metaFields: getMetaFields(),
  });
}

/** 切换活动场景。 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const scenarioId = await setActiveScenarioId(String(body?.scenarioId ?? ""));
  return NextResponse.json({
    activeScenarioId: scenarioId,
    fields: getScenarioFields(scenarioId),
    metaFields: getMetaFields(),
  });
}
