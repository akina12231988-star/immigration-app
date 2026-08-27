import { describe, expect, test } from "vitest";
import {
  APPLICATION_CONTENT_CHOICES,
  ENTRUSTED_SITUATION,
  PREP_SITUATIONS,
  WORKER_SITUATIONS,
  appTypeOfPrepSituation,
  autoSituation,
  mergeSituation,
  situationAfterApproval,
  prepSituationLabel,
  situationDescription,
  splitSituations,
} from "@/lib/worker-situation";
import { APPLICATION_CONTENT_OPTIONS } from "@/types/application";

const values = new Set(WORKER_SITUATIONS.map((s) => s.value));

describe("situationDescription", () => {
  test("選択肢の意味を返す（前後の空白は無視）", () => {
    expect(situationDescription("更新＜５年目＞")).toContain("１年未満");
    expect(situationDescription("  １号満了終了 ")).toContain("５年");
  });

  test("選択肢に無い自由入力・説明未登録の選択肢は空を返す", () => {
    expect(situationDescription("独自のメモ")).toBe("");
    expect(situationDescription("特定技能の審査中")).toBe("");
  });

  test("使わない選択肢（技人国・移行しない・技能習2号ロ）は外している", () => {
    expect(WORKER_SITUATIONS.some((s) => s.value.includes("技人国"))).toBe(false);
    expect(WORKER_SITUATIONS.some((s) => s.value.includes("移行しない"))).toBe(false);
    expect(WORKER_SITUATIONS.some((s) => s.value.includes("技能習"))).toBe(false);
  });
});

describe("PREP_SITUATIONS", () => {
  test("準備中の内容は7つで、すべて只今の状況の選択肢にある", () => {
    expect(PREP_SITUATIONS).toHaveLength(7);
    for (const s of PREP_SITUATIONS) expect(values.has(s)).toBe(true);
  });
});

describe("APPLICATION_CONTENT_CHOICES", () => {
  test("申請内容の候補は7つで、申請内容は従来の3種類のどれかになる", () => {
    expect(APPLICATION_CONTENT_CHOICES).toHaveLength(7);
    for (const c of APPLICATION_CONTENT_CHOICES) {
      expect(APPLICATION_CONTENT_OPTIONS).toContain(c.content);
      expect(c.label.startsWith(c.content)).toBe(true); // 候補名は保存される申請内容から始まる
    }
  });

  test("候補ごとの只今の状況は、すべて審査中の選択肢にある", () => {
    for (const c of APPLICATION_CONTENT_CHOICES) {
      expect(values.has(c.situation)).toBe(true);
      expect(c.situation).toContain("審査中");
    }
  });

  test("本人申請の候補は2つ（特定活動２号以降準備・特定技能２号）", () => {
    const self = APPLICATION_CONTENT_CHOICES.filter((c) => c.selfApply);
    expect(self.map((c) => c.situation).sort()).toEqual(
      ["２号特定技能の審査中", "特定活動（２号以降準備）の審査中"].sort(),
    );
  });
});

describe("mergeSituation", () => {
  const entrusted = {
    current_situation: ENTRUSTED_SITUATION,
    support: "支援対象",
    status: "在籍中",
  };

  test("支援対象かつ在籍中の＜支援委託中＞は外さず、先頭に残して併記する", () => {
    expect(mergeSituation("特定技能更新許可の審査中", entrusted)).toBe(
      `${ENTRUSTED_SITUATION}・特定技能更新許可の審査中`,
    );
    // すでに併記されている人も同じ形を保つ
    expect(
      mergeSituation("特定技能更新の準備中", {
        ...entrusted,
        current_situation: `${ENTRUSTED_SITUATION}・特定技能申請準備中`,
      }),
    ).toBe(`${ENTRUSTED_SITUATION}・特定技能更新の準備中`);
  });

  test("支援対象でない・在籍中でない・＜支援委託中＞が付いていない人はそのまま置き換える", () => {
    expect(
      mergeSituation("特定技能更新許可の審査中", { ...entrusted, support: "支援対象外" }),
    ).toBe("特定技能更新許可の審査中");
    expect(
      mergeSituation("特定技能更新許可の審査中", { ...entrusted, status: "退職" }),
    ).toBe("特定技能更新許可の審査中");
    expect(
      mergeSituation("特定技能更新許可の審査中", { ...entrusted, current_situation: "更新" }),
    ).toBe("特定技能更新許可の審査中");
  });

  test("新しい状況が＜支援委託中＞そのもののときは二重にしない", () => {
    expect(mergeSituation(ENTRUSTED_SITUATION, entrusted)).toBe(ENTRUSTED_SITUATION);
  });
});

describe("situationAfterApproval", () => {
  test("特定技能の更新の許可がおりたら「更新」に変える（＜支援委託中＞は残す）", () => {
    expect(
      situationAfterApproval(`${ENTRUSTED_SITUATION}・特定技能更新許可の審査中`),
    ).toBe(`${ENTRUSTED_SITUATION}・更新`);
    expect(situationAfterApproval("特定技能更新許可の審査中")).toBe("更新");
  });

  test("特定技能の更新以外の状況のときは変えない", () => {
    expect(situationAfterApproval("特定活動の審査中")).toBeNull();
    expect(situationAfterApproval(ENTRUSTED_SITUATION)).toBeNull();
    expect(situationAfterApproval("")).toBeNull();
  });
});

describe("splitSituations / situationDescription（併記）", () => {
  test("「・」で併記された状況を分けられる", () => {
    expect(splitSituations(`${ENTRUSTED_SITUATION}・特定技能更新許可の審査中`)).toEqual([
      ENTRUSTED_SITUATION,
      "特定技能更新許可の審査中",
    ]);
  });

  test("併記された状況の説明は、それぞれの説明をつなげて返す", () => {
    const text = situationDescription(`${ENTRUSTED_SITUATION}・特定技能更新許可の審査中`);
    expect(text).toContain("在留期間更新許可申請");
    expect(text).toContain("支援委託中");
  });
});

describe("autoSituation（未入力のときの自動表示）", () => {
  test("審査中の申請があれば、現在のビザ＋申請内容の審査中を返す", () => {
    expect(
      autoSituation("特定技能1号", { status: "申請済", applicationContent: "在留期間の更新許可" }),
    ).toBe("特定技能1号・在留期間の更新許可の審査中");
    expect(
      autoSituation("特定活動", { status: "通知書到着", applicationContent: "在留資格の変更許可" }),
    ).toBe("特定活動・在留資格の変更許可の審査中");
  });

  test("許可済（在留カード受け取り待ち）も添える", () => {
    expect(
      autoSituation("特定技能1号", { status: "許可済", applicationContent: "在留期間の更新許可" }),
    ).toBe("特定技能1号・在留期間の更新許可の許可済（在留カード受け取り待ち）");
  });

  test("在留カード受領・取下げ・申請前はビザだけを返す", () => {
    expect(autoSituation("特定技能1号", { status: "在留カード受領" })).toBe("特定技能1号");
    expect(autoSituation("特定技能1号", { status: "取下げ" })).toBe("特定技能1号");
    expect(autoSituation("特定技能1号", { status: "申請前" })).toBe("特定技能1号");
    expect(autoSituation("特定技能1号", null)).toBe("特定技能1号");
  });

  test("ビザが未入力でも審査中の情報だけ返す。どちらも無ければ空", () => {
    expect(autoSituation("", { status: "申請済", applicationContent: "在留認定許可申請" })).toBe(
      "在留認定許可申請の審査中",
    );
    expect(autoSituation("", null)).toBe("");
  });
});

describe("appTypeOfPrepSituation（申請準備の申請種別）", () => {
  test("7つの候補すべてに申請種別がある", () => {
    for (const c of APPLICATION_CONTENT_CHOICES) {
      expect(["変更", "更新", "認定", "特定活動"]).toContain(c.appType);
    }
  });

  test("只今の状況の保存値から申請種別が決まる", () => {
    const table: [string, string][] = [
      ["在留資格認定申請書の準備中", "認定"],
      ["特定活動で申請準備中", "特定活動"],
      ["特定活動ビザ更新の申請準備", "更新"],
      ["特定活動（特定技能２号移行準備のため）準備中", "特定活動"],
      ["特定技能更新の準備中", "更新"],
      ["特定技能申請準備中", "変更"],
      ["特定技能2号申請準備中", "変更"],
    ];
    for (const [situation, appType] of table) {
      expect(appTypeOfPrepSituation(situation)).toBe(appType);
    }
  });

  test("知らない値・空のときは未選択のまま", () => {
    expect(appTypeOfPrepSituation("")).toBe("");
    expect(appTypeOfPrepSituation("なにか")).toBe("");
  });

  test("特定活動への資格変更は「特定活動」、特定活動の期間更新は「更新」", () => {
    expect(appTypeOfPrepSituation("特定活動で申請準備中")).toBe("特定活動");
    expect(appTypeOfPrepSituation("特定活動ビザ更新の申請準備")).toBe("更新");
  });
});

describe("prepSituationLabel", () => {
  test("保存値を画面の言い方に直す", () => {
    expect(prepSituationLabel("特定技能2号申請準備中")).toBe(
      "在留資格の変更許可（特定技能２号）※本人申請",
    );
  });

  test("知らない値はそのまま返す", () => {
    expect(prepSituationLabel("なにか")).toBe("なにか");
  });
});
