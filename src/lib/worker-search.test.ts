import { describe, expect, it } from "vitest";
import { matchesWorkerName, normalizeSearchText, workerNameSuggestions } from "./worker-search";

describe("normalizeSearchText", () => {
  it("空白（半角・全角）を除いて小文字にそろえる", () => {
    expect(normalizeSearchText(" NGUYEN　VAN A ")).toBe("nguyenvana");
  });
});

describe("matchesWorkerName", () => {
  const w = { name: "NGUYEN VAN A", kana: "グエン ヴァン ア" };

  it("氏名の一部で見つかる", () => {
    expect(matchesWorkerName(w, "van")).toBe(true);
  });

  it("空白の入れ方が違っても見つかる", () => {
    expect(matchesWorkerName(w, "nguyenvan")).toBe(true);
  });

  it("ふりがなでも見つかる", () => {
    expect(matchesWorkerName(w, "グエン")).toBe(true);
  });

  it("関係のない文字では見つからない", () => {
    expect(matchesWorkerName(w, "TRAN")).toBe(false);
  });

  it("未入力のときは全員が対象", () => {
    expect(matchesWorkerName(w, "  ")).toBe(true);
  });

  it("ふりがなが未登録でもエラーにならない", () => {
    expect(matchesWorkerName({ name: "髙濱 伸吉", kana: null }, "髙濱")).toBe(true);
  });
});

describe("workerNameSuggestions", () => {
  const workers: { id: string; name: string; kana: string }[] = [
    { id: "1", name: "TRAN VAN B", kana: "" },
    { id: "2", name: "NGUYEN VAN A", kana: "" },
    { id: "3", name: "NGUYEN THI C", kana: "" },
  ];

  it("未入力のときは候補を出さない", () => {
    expect(workerNameSuggestions(workers, "")).toEqual([]);
  });

  it("前方一致を先に、そのあと五十音順で出す", () => {
    // 「van」は NGUYEN VAN A（途中一致）と TRAN VAN B（途中一致）に当たる
    expect(workerNameSuggestions(workers, "nguyen").map((w) => w.id)).toEqual(["3", "2"]);
  });

  it("件数の上限を守る", () => {
    expect(workerNameSuggestions(workers, "van", 1)).toHaveLength(1);
  });
});
