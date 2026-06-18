import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { apiPaths } from "@/lib/api/paths";
import type { FieldDef } from "@/lib/fields/field-schema";

export interface FieldSchemaPayload {
  activeScenarioId: string;
  scenarios: Array<{ id: string; name: string; description: string }>;
  /** 当前场景的有序识别字段（可编辑明细列） */
  fields: FieldDef[];
  /** 派生/只读元字段 */
  metaFields: FieldDef[];
}

/** 拉取活动场景的字段定义，驱动结果表/审核台动态出列。 */
export function useFieldSchema() {
  return useQuery<FieldSchemaPayload>({
    queryKey: ["fields"],
    queryFn: () => apiGet(apiPaths.fields),
    staleTime: 5 * 60 * 1000,
  });
}
