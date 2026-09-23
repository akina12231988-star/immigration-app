import { describe, expect, it } from "vitest";
import { normalizeOrganizationIntake } from "./organization-intake";
import {
  annualHolidays,
  jobConditionSections,
  dailyWorkMinutes,
  dailyWorkText,
  canPrintWorkplaceList,
  followWorkSite,
  phoneOnly,
  workplaceListRows,
  timeToMinutes,
  workplaceChangeText,
  workplaceText,
} from "./job-conditions";

describe("1日の所定労働時間", () => {
  it("終業 − 始業 − 休憩", () => {
    expect(timeToMinutes("8:00")).toBe(480);
    expect(timeToMinutes("25:00")).toBeNull();
    expect(dailyWorkMinutes("08:00", "17:00", "60")).toBe(480);
    expect(dailyWorkText("08:00", "17:00", "60")).toBe("8時間");
    expect(dailyWorkText("08:30", "17:00", "60")).toBe("7時間30分");
  });
  it("日をまたぐ勤務・入力不足", () => {
    expect(dailyWorkText("22:00", "07:00", "60")).toBe("8時間");
    expect(dailyWorkText("", "17:00", "60")).toBe("");
    expect(dailyWorkMinutes("08:00", "09:00", "90")).toBeNull();
  });
});

describe("年間合計休日日数", () => {
  it("365 − 年間所定労働日数", () => {
    expect(annualHolidays("260")).toBe(105);
    expect(annualHolidays("260日")).toBe(105);
    expect(annualHolidays("")).toBeNull();
    expect(annualHolidays("400")).toBeNull();
  });
});

describe("就業の場所・交代制の表記", () => {
  it("変更の可能性", () => {
    expect(workplaceChangeText("無", [])).toBe("変更なし");
    expect(workplaceChangeText("", [])).toBe("");
    expect(
      workplaceChangeText("有", [{ name: "愛野営業所", address: "長崎県雲仙市愛野町", contact: "0957-00-0000" }]),
    ).toBe("変更あり: 愛野営業所（長崎県雲仙市愛野町／0957-00-0000）");
    expect(workplaceText({ name: "", address: "", contact: "" })).toBe("");
  });
});

describe("作業する住所 → 就業の場所の自動転記", () => {
  const prev = { address: "長崎県雲仙市1", contact: "TEL 0957-00-0000" };
  it("空か前の値のままなら追いかける（事業所名は会社名）", () => {
    expect(followWorkSite([{ name: "", address: "", contact: "" }], { address: "", contact: "" }, prev, "株式会社A")).toEqual([
      { name: "株式会社A", address: "長崎県雲仙市1", contact: "TEL 0957-00-0000" },
    ]);
    const rows = [{ name: "本社", address: "長崎県雲仙市1", contact: "TEL 0957-00-0000" }, { name: "営業所", address: "X", contact: "" }];
    expect(followWorkSite(rows, prev, { ...prev, address: "長崎県雲仙市2" }, "株式会社A")).toEqual([
      { name: "本社", address: "長崎県雲仙市2", contact: "TEL 0957-00-0000" },
      { name: "営業所", address: "X", contact: "" },
    ]);
  });
  it("手で書き換えた1行目は上書きしない", () => {
    const rows = [{ name: "工場", address: "熊本県八代市", contact: "" }];
    expect(followWorkSite(rows, prev, { ...prev, address: "長崎県雲仙市2" }, "株式会社A")[0].address).toBe("熊本県八代市");
  });
});

describe("就業場所の一覧表", () => {
  it("電話番号だけを取り出す（FAXは除く）", () => {
    expect(phoneOnly("TEL 0957-88-3787 / FAX 0957-88-3788")).toBe("0957-88-3787");
    expect(phoneOnly("0957-36-0882")).toBe("0957-36-0882");
    expect(phoneOnly("FAX 0957-00-0000")).toBe("");
  });
  it("就業の場所 → 変更先の順、空行は除き、変更の可能性が有で2か所以上なら印刷できる", () => {
    const intake = {
      job_workplaces: [{ name: "本社", address: "〒854-0703 長崎県雲仙市", contact: "TEL 0957-88-3787 / FAX 0957-88-3788" }],
      job_workplace_change: "有",
      job_workplace_changes: [
        { name: "愛野営業所", address: "長崎県雲仙市愛野町", contact: "0957-36-0882" },
        { name: "", address: "", contact: "" },
      ],
    };
    expect(workplaceListRows(intake)).toEqual([
      { name: "本社", address: "〒854-0703 長崎県雲仙市", phone: "0957-88-3787" },
      { name: "愛野営業所", address: "長崎県雲仙市愛野町", phone: "0957-36-0882" },
    ]);
    expect(canPrintWorkplaceList(intake)).toBe(true);
    expect(canPrintWorkplaceList({ ...intake, job_workplace_change: "無" })).toBe(false);
    expect(workplaceListRows({ ...intake, job_workplace_change: "無" })).toHaveLength(1);
  });
});

describe("就業場所の一覧表の重複", () => {
  it("就業の場所と同じ住所が変更先にあれば、変更先の行だけを出す（郵便番号・全角数字の違いは無視）", () => {
    const rows = workplaceListRows({
      job_workplaces: [{ name: "有限会社國崎青果", address: "〒866-0031 熊本県八代市新浜町1-1", contact: "TEL 0965-32-5337" }],
      job_workplace_change: "有",
      job_workplace_changes: [
        { name: "本社", address: "長崎県雲仙市南串山町丙１９３９", contact: "0957-88-3787" },
        { name: "熊本営業所", address: "熊本県八代市新浜町１-１", contact: "0965-32-5337" },
        { name: "埼玉営業所", address: "埼玉県深谷市後榛沢364", contact: "0485-85-5830" },
        { name: "関東営業所", address: "埼玉県深谷市後榛沢364", contact: "048-585-5830" },
      ],
    });
    expect(rows.map((r) => r.name)).toEqual(["本社", "熊本営業所", "埼玉営業所", "関東営業所"]);
  });
});

describe("jobConditionSections", () => {
  it("雇用条件書の順番（1〜11）で、登録内容を行にする（未登録は「未登録」）", () => {
    const intake = normalizeOrganizationIntake({
      job_workplaces: [{ name: "本社", address: "熊本県八代市", contact: "" }],
      job_workplace_change: "無",
      job_work_start: "8:00",
      job_work_end: "17:00",
      job_break_minutes: "60",
      job_raise: "有",
      job_raise_note: "年1回",
      job_resign_notice_days: "30日",
      pay_method: "口座振込",
    });
    const s = jobConditionSections(intake);
    expect(s.map((x) => x.title.split(".")[0])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
    expect(s[0].lines).toEqual(["本社（熊本県八代市）", "変更の可能性：変更なし"]);
    expect(s[1].lines[0]).toBe("8:00〜17:00（休憩60分・1日8時間）");
    expect(s[7].lines).toContain("昇給：有（年1回）");
    expect(s[7].lines[0]).toContain("支払方法：口座振込");
    expect(s[8].lines[0]).toBe("自己都合の場合：30日前に社長・工場長等に届けること");
    expect(s[10].lines).toEqual(["未登録"]);
  });
});
