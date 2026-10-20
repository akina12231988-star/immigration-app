import { describe, expect, it } from "vitest";
import { agentNameKey, agentNames, docsForAgent, type MailingAgentDocument } from "./mailing-agent-docs";

const doc = (id: string, agent_name: string, created_at: string): MailingAgentDocument => ({
  id,
  agent_name,
  label: "",
  storage_path: `agent-docs/${id}.pdf`,
  file_name: `${id}.pdf`,
  mime_type: "application/pdf",
  created_at,
});

describe("代理人の身分証明書", () => {
  it("名前は空白・括弧の中・敬称を除いて比べる", () => {
    expect(agentNameKey("野口 明菜")).toBe("野口明菜");
    expect(agentNameKey("野口明菜（行政書士事務所）")).toBe("野口明菜");
    expect(agentNameKey("野口　明菜 様")).toBe("野口明菜");
    expect(agentNameKey("")).toBe("");
  });

  it("入力した代理人の身分証明書だけを登録順に返す", () => {
    const docs = [doc("b", "野口明菜", "2026-10-02"), doc("a", "野口 明菜", "2026-10-01"), doc("c", "木村", "2026-10-03")];
    expect(docsForAgent(docs, "野口明菜（行政書士事務所）").map((d) => d.id)).toEqual(["a", "b"]);
    expect(docsForAgent(docs, "")).toEqual([]);
    expect(docsForAgent(docs, "山田")).toEqual([]);
  });

  it("登録されている代理人の名前（重複なし）", () => {
    const docs = [doc("b", "野口明菜", "2026-10-02"), doc("a", "野口 明菜", "2026-10-01"), doc("c", "木村", "2026-10-03")];
    expect(agentNames(docs)).toEqual(["野口 明菜", "木村"]);
  });
});
