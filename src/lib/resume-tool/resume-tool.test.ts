import { describe, expect, it } from "vitest";
import { extractRirekiPayload } from "@/lib/rireki-import";
import {
  applyResumeDictionary,
  buildResumeHtml,
  buildResumePayload,
  calcAge,
  collectResumeData,
  dateParts,
  dictJa,
  dictListJa,
  languageJa,
  OTHER_KEY,
  RELATIONS,
  emptyResumeForm,
  formatCareerDateInput,
  formatFullDateInput,
  formatResumeDate,
  NOTE_SERVER_UNREACHABLE,
  optionLabel,
  parseCareerDate,
  RESUME_LANGS,
  RESUME_TEXT,
  SSW_FIELDS,
  toIsoDate,
  translateResumeData,
  workOptions,
} from "./index";

describe("日付の解釈", () => {
  it("区切りあり・8桁・可変桁を年月日に分ける", () => {
    expect(dateParts("1995/03/01")).toEqual({ y: "1995", m: "03", d: "01" });
    expect(dateParts("1995-3-1")).toEqual({ y: "1995", m: "3", d: "1" });
    expect(dateParts("19950301")).toEqual({ y: "1995", m: "03", d: "01" });
    expect(dateParts("2027214")).toEqual({ y: "2027", m: "2", d: "14" });
    expect(dateParts("202712")).toEqual({ y: "2027", m: "12", d: "" });
    expect(dateParts("")).toBeNull();
  });

  it("入力欄を離れたときの整形", () => {
    expect(formatFullDateInput("19950301")).toBe("1995/03/01");
    expect(formatFullDateInput("1995/03")).toBe("1995/03");
    expect(formatCareerDateInput("2019.4")).toBe("2019/04");
    expect(formatCareerDateInput("2019/13/40")).toBe("2019/12/31");
    expect(formatCareerDateInput("abc")).toBe("abc");
    expect(parseCareerDate("2022/03")).toEqual({ y: "2022", m: "3", d: "" });
  });

  it("履歴書の表記・埋め込み用の表記・満年齢", () => {
    expect(formatResumeDate("1995/03/01")).toBe("1995年 3月 1日");
    expect(toIsoDate("1995/3/1")).toBe("1995-03-01");
    expect(toIsoDate("2022/03")).toBe("2022-03");
    expect(calcAge("1996-02-10", new Date("2026-09-08"))).toBe(30);
    expect(calcAge("1996-09-09", new Date("2026-09-08"))).toBe(29);
    expect(calcAge("", new Date("2026-09-08"))).toBeNull();
  });
});

describe("文言と選択肢", () => {
  it("6言語すべてに同じキーがある", () => {
    const keys = Object.keys(RESUME_TEXT.ja);
    for (const l of RESUME_LANGS) {
      expect(Object.keys(RESUME_TEXT[l.code]).sort()).toEqual([...keys].sort());
    }
  });

  it("プルダウンの表示は日本語なら日本語だけ、他言語なら併記（無い言語は英語で補う）", () => {
    expect(optionLabel(SSW_FIELDS[0], "ja")).toBe("介護");
    expect(optionLabel(SSW_FIELDS[0], "vi")).toBe("介護 ／ Điều dưỡng");
    const w = workOptions("nogyo_kosyu")[0];
    expect(optionLabel(w, "km")).toBe("施設園芸 ／ Facility horticulture");
  });
});

function sampleForm() {
  const f = emptyResumeForm();
  f.name = "NGUYEN VAN A";
  f.kana = "グエン バン アー";
  f.gender = "女性";
  f.dob = "1996/02/10";
  f.nat = "Việt Nam";
  f.lang = "Tiếng Việt";
  f.spouse = "無";
  f.jtypeKey = "nogyo_kosyu";
  f.jworkKey = "nogyo_kosyu_1";
  f.vexp = "2027/04/07";
  f.statusKey = "cur_tokkatsu_ikou";
  f.adjp = "熊本県八代市郡築五番町126番地2";
  f.adhm = "Hà Nội";
  f.hob = "Đá bóng";
  f.careers[0] = { ...f.careers[0], from: "2021/04", to: "2024/03", company: "株式会社ベース", fieldKey: "nogyo", statKey: "ginou_jisshu_2" };
  f.families[0] = { ...f.families[0], relation: "Mẹ", name: "NGUYEN THI B", birthYear: "1970", job: "Nông dân" };
  return f;
}

describe("入力の日本語化と履歴書の生成", () => {
  it("選択式は内部コードから日本語に確定する", () => {
    const d = collectResumeData(sampleForm());
    expect(d.jtype).toBe("耕種農業");
    expect(d.jwork).toBe("畑作・野菜");
    expect(d.status).toBe("特定活動（特定技能1号移行準備）");
    expect(d.careers[0]).toMatchObject({ fy: "2021", fm: "4", ty: "2024", tm: "3", fieldJa: "農業", statJa: "技能実習2号で修了" });
  });

  it("辞書にある語は通信なしで日本語に、残りは翻訳サーバーへ。届かなければ注意書きを付ける", async () => {
    const d = collectResumeData(sampleForm());
    const calls: Record<string, string>[] = [];
    const t = await translateResumeData(d, "vi", async (from, texts) => {
      calls.push({ from, ...texts });
      const key = Object.keys(texts).find((k) => texts[k] === "Đá bóng") ?? "t0";
      return { [key]: "サッカー" };
    });
    expect(dictJa("Việt Nam")).toBe("ベトナム");
    expect(t.nat).toBe("ベトナム");
    expect(t.lang).toBe("ベトナム語");
    expect(t.families[0].rel).toBe("母");
    expect(t.hob).toBe("サッカー");
    expect(t.adjp).toBe("熊本県八代市郡築五番町126番地2"); // 日本語はそのまま
    expect(calls[0].from).toBe("ベトナム語");
    expect(Object.values(calls[0])).toContain("Đá bóng");
    expect(d.hob).toBe("Đá bóng"); // 元のデータは変えない

    const failed = await translateResumeData(d, "vi", async () => {
      throw new Error("down");
    });
    expect(failed.translateNote).toBe(NOTE_SERVER_UNREACHABLE);
    expect(failed.hob).toBe("Đá bóng");

    const ja = await translateResumeData(d, "ja", async () => {
      throw new Error("呼ばれないはず");
    });
    expect(ja.nat).toBe("Việt Nam");
  });

  it("続柄は選択式で必ず日本語になり、その他のときだけ自由記述を使う", () => {
    const f = sampleForm();
    f.families[0] = { ...f.families[0], relationKey: "elder_sister", relation: "" };
    f.families[1] = { ...f.families[1], relationKey: OTHER_KEY, relation: "Kakak ipar", name: "X" };
    f.families[2] = { ...f.families[2], relationKey: "", relation: "Ayah", name: "Y" }; // 古い入力（選択なし）
    const d = collectResumeData(f);
    expect(d.families[0].rel).toBe("姉");
    expect(d.families[1].rel).toBe("Kakak ipar");
    expect(d.families[2].rel).toBe("Ayah");
    expect(RELATIONS.map((r) => r.ja)).toEqual(["父", "母", "夫", "妻", "息子", "娘", "兄", "弟", "姉", "妹", "祖父", "祖母"]);
  });

  it("プレビューでも辞書で日本語にできる語（続柄・言語・国籍・仕事）は置き換える", () => {
    const f = sampleForm();
    f.nat = "Indonesia";
    f.lang = "Indonesia , Jepang , Inggris";
    f.families[0] = { ...f.families[0], relationKey: "", relation: "Ayah ", name: "Suheri", birthYear: "1967", job: "Welder" };
    f.families[1] = { ...f.families[1], relationKey: "", relation: "Ibu", name: "Sarmiati", job: "Ibu Rumah Tangga" };
    f.families[2] = { ...f.families[2], relationKey: "", relation: "Adik", name: "Bilgis", job: "Masih Sekolah" };
    const d = applyResumeDictionary(collectResumeData(f), "id");
    expect(d.nat).toBe("インドネシア");
    expect(d.lang).toBe("インドネシア語、日本語、英語");
    expect(d.families.map((x) => x.rel)).toEqual(["父", "母", "弟・妹"]);
    expect(d.families.map((x) => x.job)).toEqual(["溶接工", "主婦", "学生"]);
    expect(d.hob).toBe("Đá bóng"); // 辞書に無い自由記述はそのまま（翻訳サーバーは使わない）
    expect(d.translateNote).toBe("");
    // 言語の欄では国名の綴りでも「〜語」、国籍の欄では国名
    expect(languageJa("Vietnam")).toBe("ベトナム語");
    expect(dictListJa("Vietnam")).toBe("ベトナム");
    expect(dictListJa("Indonesia dan Jepang", { indonesia: "インドネシア語", jepang: "日本語" })).toBe("インドネシア語、日本語");
    expect(dictListJa("Indonesia, Xyz")).toBeNull(); // 1つでも引けなければ翻訳サーバーへ
  });

  it("埋め込みデータは取り込み側（rireki-import）で読める形になる", () => {
    const d = collectResumeData(sampleForm());
    const now = new Date("2026-09-08T00:00:00Z");
    const payload = buildResumePayload(d, "vi", now);
    expect(payload.basic.birth).toBe("1996-02-10");
    expect(payload.careers).toHaveLength(1);
    expect(payload.families).toHaveLength(1);

    const html = buildResumeHtml(d, "vi", now);
    expect(html).toContain("1996年 2月 10日");
    expect(html).toContain("（満30歳）");
    expect(html).toContain("2021年4月");
    const back = extractRirekiPayload(html.replace(/<[^>]+>/g, " "));
    expect(back?.basic.name).toBe("NGUYEN VAN A");
    expect(back?.basic.residenceStatus).toBe("特定活動（特定技能1号移行準備）");
    expect(back?.careers[0].company).toBe("株式会社ベース");
  });

  it("A4 1枚に収めるため、印刷余白は0で内側に余白を取り、行が多いときは詰めた表示にする", () => {
    const f = sampleForm();
    const html = buildResumeHtml(collectResumeData(f), "ja");
    expect(html).toContain("@page{size:A4 portrait;margin:0}");
    expect(html).toContain("text-size-adjust:100%"); // スマホの印刷で文字が勝手に大きくならない
    expect(html).toContain('<div class="page">');
    // 職歴6件＋家族1人（合計7行） → 詰めた表示
    f.careers = Array.from({ length: 6 }, (_, i) => ({ ...f.careers[0], id: i + 100 }));
    const many = buildResumeHtml(collectResumeData(f), "ja");
    expect(many).toContain('<div class="page dense">');
  });

  it("入力にタグが混ざっても履歴書のHTMLを壊さない", () => {
    const f = sampleForm();
    f.hob = "<script>alert(1)</script>";
    f.photo = "javascript:alert(1)";
    const html = buildResumeHtml(collectResumeData(f), "ja");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:alert");
  });
});
