import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scopeToWhere } from "../exports";

describe("scopeToWhere（选择性导出范围 → where）", () => {
  it("缺省=仅排除已删除（全库兼容）", () => {
    assert.deepEqual(scopeToWhere(), { deletedAt: null });
    assert.deepEqual(scopeToWhere(undefined), { deletedAt: null });
    assert.deepEqual(scopeToWhere({}), { deletedAt: null });
  });

  it("镜像 rows 筛选语义：risk→riskLevel、month→normalizedMonth、code/name→contains", () => {
    assert.deepEqual(
      scopeToWhere({
        batchId: "b1",
        status: "confirmed",
        risk: "high",
        auditState: "flagged",
        month: "2024年6月",
        code: "100",
        name: "土豆",
      }),
      {
        deletedAt: null,
        batchId: "b1",
        status: "confirmed",
        riskLevel: "high",
        auditState: "flagged",
        normalizedMonth: "2024年6月",
        code: { contains: "100" },
        name: { contains: "土豆" },
      },
    );
  });

  it("空字符串字段忽略；rowIds 非空才下推 id in", () => {
    assert.deepEqual(scopeToWhere({ status: "", name: "", rowIds: [] }), { deletedAt: null });
    assert.deepEqual(scopeToWhere({ rowIds: ["r1", "r2"] }), { deletedAt: null, id: { in: ["r1", "r2"] } });
  });
});
