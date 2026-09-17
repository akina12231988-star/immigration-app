import { describe, expect, it } from "vitest";
import {
  EMPTY_FOLLOWUPS,
  insuranceSwitchOf,
  movingInsuranceGuide,
  followupLabels,
  followupsOf,
  hasFollowup,
  needsKokuho,
  needsMoving,
  patchFollowups,
  withFollowups,
} from "@/lib/worker-followups";

describe("followupsOf", () => {
  it("0119 が未適用（列が無い）でも空の宿題として読める", () => {
    expect(followupsOf({})).toEqual(EMPTY_FOLLOWUPS);
    expect(followupsOf(null)).toEqual(EMPTY_FOLLOWUPS);
    expect(followupsOf(undefined)).toEqual(EMPTY_FOLLOWUPS);
  });

  it("片方だけ入っていても、もう片方は空で補う", () => {
    const f = followupsOf({ followups: { kokuho: { needed: true } } });
    expect(f.kokuho.needed).toBe(true);
    expect(f.moving).toEqual(EMPTY_FOLLOWUPS.moving);
  });

  it("知らない状況が入っていたら未依頼として扱う", () => {
    expect(followupsOf({ followups: { moving: { status: "なにか" } } }).moving.status).toBe("未依頼");
  });

  it("空文字の日付は null にそろえる", () => {
    const f = followupsOf({ followups: { moving: { planned_on: "" }, kokuho: { docs_ready_on: "" } } });
    expect(f.moving.planned_on).toBeNull();
    expect(f.kokuho.docs_ready_on).toBeNull();
  });
});

describe("needsMoving", () => {
  it("必要で、まだ完了していなければ残っている", () => {
    for (const status of ["未依頼", "依頼中"] as const) {
      expect(needsMoving(patchFollowups(EMPTY_FOLLOWUPS, { moving: { needed: true, status } }))).toBe(true);
    }
  });

  it("完了なら残っていない", () => {
    const f = patchFollowups(EMPTY_FOLLOWUPS, { moving: { needed: true, status: "完了" } });
    expect(needsMoving(f)).toBe(false);
  });

  it("そもそも必要でなければ残っていない", () => {
    const f = patchFollowups(EMPTY_FOLLOWUPS, { moving: { needed: false, status: "未依頼" } });
    expect(needsMoving(f)).toBe(false);
  });
});

describe("needsKokuho", () => {
  it("両方とも加入するまで残る", () => {
    const base = { needed: true };
    expect(needsKokuho(patchFollowups(EMPTY_FOLLOWUPS, { kokuho: base }))).toBe(true);
    expect(
      needsKokuho(patchFollowups(EMPTY_FOLLOWUPS, { kokuho: { ...base, kokuho_done: true } })),
    ).toBe(true);
    expect(
      needsKokuho(patchFollowups(EMPTY_FOLLOWUPS, { kokuho: { ...base, nenkin_done: true } })),
    ).toBe(true);
  });

  it("両方とも加入したら残らない", () => {
    const f = patchFollowups(EMPTY_FOLLOWUPS, {
      kokuho: { needed: true, kokuho_done: true, nenkin_done: true },
    });
    expect(needsKokuho(f)).toBe(false);
  });

  it("退職書類が出ていなくても、必要なら残っている扱い（書類待ちを忘れないため）", () => {
    const f = patchFollowups(EMPTY_FOLLOWUPS, { kokuho: { needed: true, docs_ready_on: null } });
    expect(needsKokuho(f)).toBe(true);
  });
});

describe("followupLabels", () => {
  it("残っていないときは空", () => {
    expect(followupLabels({})).toEqual([]);
  });

  it("転居は依頼中かどうかで書き分ける", () => {
    expect(followupLabels({ followups: { moving: { needed: true, status: "未依頼" } } })).toEqual([
      "転居手続きの依頼",
    ]);
    expect(followupLabels({ followups: { moving: { needed: true, status: "依頼中" } } })).toEqual([
      "転出手続きを依頼中",
    ]);
  });

  it("まだ加入していないほうだけを並べる", () => {
    expect(
      followupLabels({ followups: { kokuho: { needed: true, kokuho_done: true } } }),
    ).toEqual(["国民年金の加入（退職書類の発行待ち）"]);
    expect(
      followupLabels({ followups: { kokuho: { needed: true, docs_ready_on: "2026-09-01" } } }),
    ).toEqual(["国民健康保険・国民年金の加入（退職書類は発行済み）"]);
  });

  it("両方あれば2件出る", () => {
    const labels = followupLabels({
      followups: { moving: { needed: true }, kokuho: { needed: true } },
    });
    expect(labels).toHaveLength(2);
  });
});

describe("hasFollowup / withFollowups", () => {
  it("どちらかが残っていれば対象", () => {
    expect(hasFollowup({ followups: { moving: { needed: true } } })).toBe(true);
    expect(hasFollowup({ followups: { kokuho: { needed: true } } })).toBe(true);
    expect(hasFollowup({ followups: { moving: { needed: true, status: "完了" } } })).toBe(false);
    expect(hasFollowup({})).toBe(false);
  });

  it("残っている人だけを取り出す", () => {
    const rows = [
      { id: "a", followups: { moving: { needed: true } } },
      { id: "b" },
      { id: "c", followups: { kokuho: { needed: true, kokuho_done: true, nenkin_done: true } } },
    ];
    expect(withFollowups(rows).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("patchFollowups", () => {
  it("画面に出していないほうを消さない", () => {
    const base = followupsOf({
      followups: { moving: { needed: true, note: "八代市へ" }, kokuho: { needed: true, note: "前職は社保" } },
    });
    const next = patchFollowups(base, { kokuho: { kokuho_done: true } });
    expect(next.moving).toEqual(base.moving);
    expect(next.kokuho.note).toBe("前職は社保");
    expect(next.kokuho.kokuho_done).toBe(true);
  });
});

describe("転入手続き", () => {
  it("転出証明書が届いたら、転入手続きの段階として案内が変わる", () => {
    const base = { needed: true, status: "依頼中" as const };
    expect(
      followupLabels({ followups: { moving: { ...base, certificate_received_on: "2026-09-20" } } }),
    ).toEqual(["転入手続きの依頼（転出証明書は届いています）"]);
    expect(
      followupLabels({
        followups: { moving: { ...base, certificate_received_on: "2026-09-20", movein_status: "依頼中" } },
      }),
    ).toEqual(["転入手続きを依頼中"]);
    expect(
      followupLabels({ followups: { moving: { ...base, movein_status: "完了" } } })[0],
    ).toContain("転入手続きは完了");
  });
  it("知らない転入の状況は未依頼として読む", () => {
    expect(followupsOf({ followups: { moving: { movein_status: "xx" } } }).moving.movein_status).toBe("未依頼");
  });
});

describe("転居の保険の切り替え", () => {
  const moving = (patch: Partial<typeof EMPTY_FOLLOWUPS.moving>) =>
    patchFollowups(EMPTY_FOLLOWUPS, { moving: { needed: true, status: "依頼中", ...patch } }).moving;

  it("知らない値は未入力として読む", () => {
    const f = followupsOf({ followups: { moving: { insurance_before: "xx", loss_doc: "yy" } } });
    expect(f.moving.insurance_before).toBe("");
    expect(f.moving.loss_doc).toBe("");
  });

  it("切り替えの種類", () => {
    expect(insuranceSwitchOf({ insurance_before: "社保", insurance_after: "国民健康保険" })).toBe("shaho-to-kokuho");
    expect(insuranceSwitchOf({ insurance_before: "国民健康保険", insurance_after: "社保" })).toBe("kokuho-to-shaho");
    expect(insuranceSwitchOf({ insurance_before: "社保", insurance_after: "変更なし" })).toBe("none");
    expect(insuranceSwitchOf({ insurance_before: "", insurance_after: "" })).toBe("none");
  });

  it("社保→国保は退職書類の発行を確認する案内。発行済みなら加入できると出す", () => {
    const base = { insurance_before: "社保" as const, insurance_after: "国民健康保険" as const };
    expect(movingInsuranceGuide(moving(base))?.tone).toBe("attention");
    expect(movingInsuranceGuide(moving(base))?.text).toContain("資格喪失確認書か離職票");
    const ok = movingInsuranceGuide(moving({ ...base, loss_doc: "離職票", loss_doc_on: "2026-09-10" }));
    expect(ok?.tone).toBe("ok");
    expect(ok?.text).toContain("離職票が発行済み（2026-09-10）");
  });

  it("国保→社保は、社保に入ったら国保の脱退を案内する", () => {
    const base = { insurance_before: "国民健康保険" as const, insurance_after: "社保" as const };
    expect(movingInsuranceGuide(moving(base))?.text).toContain("社保の加入手続きが済んだら");
    expect(movingInsuranceGuide(moving({ ...base, shaho_joined: true }))?.text).toContain("脱退手続きをしてください");
    expect(movingInsuranceGuide(moving({ ...base, shaho_joined: true, kokuho_withdrawn: true }))?.tone).toBe("ok");
  });

  it("変更なし・完了・不要なら案内は出ない", () => {
    expect(movingInsuranceGuide(moving({ insurance_before: "社保", insurance_after: "変更なし" }))).toBeNull();
    expect(movingInsuranceGuide(moving({ insurance_before: "社保", insurance_after: "国民健康保険", status: "完了" }))).toBeNull();
  });
});
