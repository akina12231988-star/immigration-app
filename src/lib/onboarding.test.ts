import { describe, expect, it } from "vitest";
import {
  WORKER_DETAIL_DOC_KEYS,
  buildFollowupMail,
  buildOnboardingMail,
  followupMailDocs,
  formatDateSlash,
  isGensenYearKey,
  isPendingDocAlert,
  isPendingDocOverdue,
  isStartDateCorrectionNeeded,
  onboardingDocDefs,
  onboardingDownloadName,
  onboardingMailNumbers,
  onboardingMailSubject,
  onboardingPdfName,
  pendingDaysElapsed,
  reiwaYear,
  startDateCorrectionReason,
} from "./onboarding";

describe("onboardingDocDefs", () => {
  it("11種の書類に1始まりの番号を振る", () => {
    const defs = onboardingDocDefs("2026-07-22");
    expect(defs).toHaveLength(11);
    expect(defs[0]).toMatchObject({ key: "zairyu", label: "在留カード", num: 1 });
    expect(defs[10].num).toBe(11);
  });
  it("源泉徴収票のラベルは令和年で変わる", () => {
    expect(reiwaYear("2026-07-22")).toBe(8);
    const gensen = onboardingDocDefs("2026-07-22").find((d) => d.key === "gensen_r8");
    expect(gensen?.label).toBe("令和8年分源泉徴収票");
  });
});

describe("formatDateSlash", () => {
  it("YYYY/MM/DD に整形する", () => {
    expect(formatDateSlash("2026-07-05")).toBe("2026/07/05");
  });
  it("未入力は空欄（全角スペース）", () => {
    expect(formatDateSlash(null)).toBe("　　　　");
    expect(formatDateSlash("")).toBe("　　　　");
  });
});

describe("onboardingMailNumbers", () => {
  it("添付資料→後送→未入手の順に通し番号を振り直す（対象外は番号なし）", () => {
    // 元の並び: 1.在留カード(添付) 2.指定書(後送) 3.申請書類一式(添付) 4.マイナンバー(未入手) 5.履歴書(対象外)
    expect(onboardingMailNumbers(["添付", "後送", "添付", "未入手", "対象外"])).toEqual([
      1, // 在留カード → 添付資料の1番
      3, // 指定書 → 後送は添付資料の続き
      2, // 申請書類一式 → 添付資料の2番（番号が詰まる）
      4, // マイナンバー → 未入手は後送の続き
      null, // 対象外は番号なし
    ]);
  });
});

describe("buildOnboardingMail", () => {
  const base = {
    workerName: "CHHOURN SOMONNY",
    orgName: "有限会社 國崎青果",
    honorific: "御中" as const,
    employmentStartOn: "2026-08-01",
    office: "熊本",
    residence: "社宅",
    sender: "野口",
    extraNote: "",
    docs: [
      { label: "在留カード", status: "添付" as const, note: "" },
      { label: "指定書", status: "後送" as const, note: "来週発送" },
      { label: "マイナンバー", status: "未入手" as const, note: "" },
      { label: "履歴書", status: "対象外" as const, note: "" },
    ],
  };

  it("宛名・基本情報・3区分を組み立てる", () => {
    const mail = buildOnboardingMail(base);
    expect(mail).toContain("有限会社 國崎青果 御中");
    expect(mail).toContain("CHHOURN SOMONNYさんの下記の該当する資料を添付いたします。");
    expect(mail).toContain("雇用開始年月日：2026/08/01");
    expect(mail).toContain("配属先の営業所：熊本");
    expect(mail).toContain("居住地：社宅");
    expect(mail).toContain("【添付資料】\n1. 在留カード");
    expect(mail).toContain("【後送予定】\n2. 指定書→来週発送");
    expect(mail).toContain("【未入手】\n3. マイナンバー");
    expect(mail.endsWith("ご確認のほどよろしくお願いします。\n\n野口")).toBe(true);
  });

  it("後送があると添付資料の番号が詰まり、後送はその続きの番号になる", () => {
    const mail = buildOnboardingMail({
      ...base,
      docs: [
        { label: "在留カード", status: "添付" as const, note: "" },
        { label: "指定書", status: "後送" as const, note: "" },
        { label: "申請書類一式（雇用契約書・雇用条件書含む）", status: "添付" as const, note: "" },
      ],
    });
    expect(mail).toContain(
      "【添付資料】\n1. 在留カード\n2. 申請書類一式（雇用契約書・雇用条件書含む）",
    );
    expect(mail).toContain("【後送予定】\n3. 指定書");
  });

  it("対象外はどの区分にも載せない", () => {
    expect(buildOnboardingMail(base)).not.toContain("履歴書");
  });

  it("宛名未入力なら宛名行を出さない・追記事項は結びの前に入る", () => {
    const mail = buildOnboardingMail({ ...base, orgName: "", extraNote: "裏面は転入後に送付します。" });
    expect(mail.startsWith("お世話になっております。")).toBe(true);
    expect(mail).toContain("裏面は転入後に送付します。\n\nご確認のほど");
  });
});

describe("onboardingDownloadName", () => {
  it("番号_書類名_氏名＋元の拡張子（番号は2桁ゼロ埋め）", () => {
    expect(onboardingDownloadName(1, "在留カード", "CHHOURN SOMONNY", "scan.pdf")).toBe(
      "01_在留カード_CHHOURN_SOMONNY.pdf",
    );
  });
  it("括弧の補足と使えない文字を除く", () => {
    expect(
      onboardingDownloadName(3, "申請書類一式（雇用契約書・雇用条件書含む）", "NGUYEN VAN A", "a.JPG"),
    ).toBe("03_申請書類一式_NGUYEN_VAN_A.jpg");
  });
  it("拡張子が不明なら付けない", () => {
    expect(onboardingDownloadName(2, "指定書", "A", "noext")).toBe("02_指定書_A");
  });
});

describe("onboardingPdfName", () => {
  it("番号_書類名_氏名.pdf（元の拡張子に関わらず）", () => {
    expect(onboardingPdfName(1, "在留カード", "CHHOURN SOMONNY")).toBe(
      "01_在留カード_CHHOURN_SOMONNY.pdf",
    );
  });
  it("2桁の番号もそのまま2桁で付く", () => {
    expect(onboardingPdfName(11, "フリガナがわかる書類（前職の社保など）", "NGUYEN VAN A")).toBe(
      "11_フリガナがわかる書類_NGUYEN_VAN_A.pdf",
    );
  });
});

describe("未提出アラート", () => {
  it("後送・未入手かつ未受領のみ対象", () => {
    expect(isPendingDocAlert({ status: "後送", received_on: null })).toBe(true);
    expect(isPendingDocAlert({ status: "未入手", received_on: null })).toBe(true);
    expect(isPendingDocAlert({ status: "後送", received_on: "2026-07-01" })).toBe(false);
    expect(isPendingDocAlert({ status: "未入手", received_on: "2026-07-01" })).toBe(false);
    expect(isPendingDocAlert({ status: "添付", received_on: null })).toBe(false);
    expect(isPendingDocAlert({ status: "対象外", received_on: null })).toBe(false);
  });
  it("期日を過ぎたら超過（当日は超過でない・未設定は超過扱いしない）", () => {
    expect(isPendingDocOverdue("2026-07-21", "2026-07-22")).toBe(true);
    expect(isPendingDocOverdue("2026-07-22", "2026-07-22")).toBe(false);
    expect(isPendingDocOverdue(null, "2026-07-22")).toBe(false);
  });
  it("後送・未入手にした日からの経過日数（当日は0日・日付なしは null）", () => {
    expect(pendingDaysElapsed("2026-07-16", "2026-07-26")).toBe(10);
    expect(pendingDaysElapsed("2026-07-26", "2026-07-26")).toBe(0);
    expect(pendingDaysElapsed(null, "2026-07-26")).toBeNull();
    expect(pendingDaysElapsed("invalid", "2026-07-26")).toBeNull();
  });
});

describe("followupMailDocs", () => {
  it("訂正版→追加の順に通し番号を振る", () => {
    const docs = followupMailDocs([
      { label: "フリガナがわかる書類（前職の社保など）", kind: "追加", note: "" },
      { label: "申請書類一式（雇用契約書・雇用条件書含む）", kind: "訂正版", note: "" },
      { label: "労働者名簿", kind: "訂正版", note: "" },
    ]);
    expect(docs.map((d) => [d.num, d.label])).toEqual([
      [1, "申請書類一式（雇用契約書・雇用条件書含む）"],
      [2, "労働者名簿"],
      [3, "フリガナがわかる書類（前職の社保など）"],
    ]);
  });
});

describe("buildFollowupMail", () => {
  it("訂正理由・訂正版・追加資料・差し替えのお願いを組み立てる", () => {
    const body = buildFollowupMail({
      workerName: "BOY SAMNANG",
      orgName: "有限会社國崎青果",
      honorific: "御中",
      reason: "雇用開始年月日の訂正（2026/08/01 → 2026/08/05）",
      docs: [
        { label: "申請書類一式（雇用契約書・雇用条件書含む）", kind: "訂正版", note: "" },
        { label: "労働者名簿", kind: "訂正版", note: "" },
        { label: "フリガナがわかる書類（前職の社保など）", kind: "追加", note: "前職の社保" },
      ],
      extraNote: "",
      sender: "野口",
    });
    expect(body).toContain("有限会社國崎青果 御中");
    expect(body).toContain(
      "先日お送りしたBOY SAMNANGさんの入社書類について、雇用開始年月日の訂正（2026/08/01 → 2026/08/05）がありましたので",
    );
    expect(body).toContain("【訂正版】\n1. 申請書類一式（雇用契約書・雇用条件書含む）\n2. 労働者名簿");
    expect(body).toContain("【追加資料】\n3. フリガナがわかる書類（前職の社保など）→前職の社保");
    expect(body).toContain("以前お送りした資料との差し替えをお願いいたします");
    expect(body.trim().endsWith("野口")).toBe(true);
  });

  it("追加資料だけのときは差し替えのお願いを入れない", () => {
    const body = buildFollowupMail({
      workerName: "BOY SAMNANG",
      orgName: "有限会社國崎青果",
      honorific: "御中",
      reason: "",
      docs: [{ label: "フリガナがわかる書類（前職の社保など）", kind: "追加", note: "" }],
      extraNote: "",
      sender: "野口",
    });
    expect(body).toContain("下記の資料を追加で添付いたします");
    expect(body).not.toContain("差し替え");
    expect(body).not.toContain("【訂正版】");
  });
});

describe("雇用開始日の訂正検知", () => {
  it("送信済みで記録と外国人情報の雇用開始日が食い違うと訂正が必要", () => {
    expect(
      isStartDateCorrectionNeeded({
        recordStartOn: "2026-08-01",
        workerStartOn: "2026-08-05",
        mailSentOn: "2026-07-25",
      }),
    ).toBe(true);
  });

  it("未送信・日付一致・どちらか未入力なら対象外", () => {
    expect(
      isStartDateCorrectionNeeded({
        recordStartOn: "2026-08-01",
        workerStartOn: "2026-08-05",
        mailSentOn: null,
      }),
    ).toBe(false);
    expect(
      isStartDateCorrectionNeeded({
        recordStartOn: "2026-08-01",
        workerStartOn: "2026-08-01",
        mailSentOn: "2026-07-25",
      }),
    ).toBe(false);
    expect(
      isStartDateCorrectionNeeded({
        recordStartOn: null,
        workerStartOn: "2026-08-05",
        mailSentOn: "2026-07-25",
      }),
    ).toBe(false);
  });

  it("訂正理由の文面を作る", () => {
    expect(startDateCorrectionReason("2026-08-01", "2026-08-05")).toBe(
      "雇用開始年月日の訂正（2026/08/01 → 2026/08/05）",
    );
  });
});

describe("入社書類メールと外国人詳細の書類をそろえる", () => {
  it("外国人詳細の書類は、入社書類メールと同じ並び（源泉徴収票を除く）", () => {
    const mail = onboardingDocDefs("2026-07-22")
      .map((d) => d.key)
      .filter((k) => !isGensenYearKey(k));
    expect([...WORKER_DETAIL_DOC_KEYS]).toEqual(mail);
  });

  it("申請書類一式と労働者名簿も外国人詳細に出す", () => {
    expect(WORKER_DETAIL_DOC_KEYS).toContain("shinsei");
    expect(WORKER_DETAIL_DOC_KEYS).toContain("meibo");
  });
});

describe("onboardingMailSubject", () => {
  it("「◯◯さんの資料」にする", () => {
    expect(onboardingMailSubject("TEGUH RIZKI")).toBe("TEGUH RIZKIさんの資料");
  });

  it("前後の空白は落とす", () => {
    expect(onboardingMailSubject("  NGUYEN VAN A  ")).toBe("NGUYEN VAN Aさんの資料");
  });

  it("氏名が無いときは「資料」だけにする", () => {
    expect(onboardingMailSubject("")).toBe("資料");
  });
});
