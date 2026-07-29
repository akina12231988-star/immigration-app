// 課税・納税証明書 取得タイミング判定ロジック（郵送請求ツール）。
// UI・保存先に依存しない純粋関数。元ツールのロジックを移植。

export interface Municipality {
  id: string;
  name: string;
  cert_name: string;
  has_income: boolean;
  has_tax: boolean;
  needs_tax_payment_cert: boolean;
  show_asterisk: boolean;
  note: string;
  tenshutsu_self_only: boolean; // 転出届: 本人申請のみ（代理人申請不可）
  juminhyo_self_only: boolean; // 住民票: 個人番号なしでも本人申請のみ（代理人申請不可）
}

export type MunicipalityInput = Omit<Municipality, "id">;

export type CollectionType = "special" | "normal";
export type YearType = "prev" | "new";
export type RequestMethod = "window" | "agent_window" | "mail";
export type RecipientType = "self" | "agent";
export type PaymentStatus = "" | "unpaid" | "paid" | "receipt_sent";

// 請求の種別（課税・納税証明書 / 転出届 / 住民票）。既存の記録は undefined = tax
export type RequestKind = "tax" | "tenshutsu" | "juminhyo";
export type ApplicantType = "self" | "agent"; // 本人申請 / 代理人
export type JuminhyoMethod = "mail" | "window"; // 住民票の発行方法（郵送請求 / 窓口発行）

export interface JudgmentDoc {
  title: string;
  meta: string;
  starred: boolean;
  isNhi?: boolean;
}

// 判定記録（DBの judgment_records.data に丸ごと保存する）
export interface JudgmentRecord {
  id: string;
  createdAt: string;
  municipalityId: string;
  municipalityName: string;
  collectionType: CollectionType;
  appDate: string;
  hasNhi: boolean;
  nhiMunicipalityId: string;
  nhiMunicipalityName: string;
  nhiFiscalStartYear: number | null;
  yearType: YearType;
  fiscalStartYear: number;
  yearReason: string;
  timingStatus: "ok" | "warn";
  timingLabel: string;
  timingDetail: string;
  docs: JudgmentDoc[];
  personName: string;
  workerId?: string; // 紐づく外国人（workers.id）
  todoNumber: string;
  mainAlternativeNote: string;
  nhiAlternativeNote: string;
  requestMethod: RequestMethod;
  mailRequestDate: string;
  recipientType: RecipientType;
  agentName: string;
  nhiRequestMethod: RequestMethod;
  nhiMailRequestDate: string;
  nhiRecipientType: RecipientType;
  nhiAgentName: string;
  nhiSameAsMain: boolean;
  // ---- 転出届・住民票の郵送請求（requestKind が tenshutsu / juminhyo のとき） ----
  requestKind?: RequestKind;
  cityOffice?: string; // 請求先の市役所（自治体マスタの名称）
  cityOfficeId?: string; // 請求先の自治体マスタID
  workerAddress?: string; // 記録時点の外国人の現在の住所（請求先判断の参考）
  postDate?: string; // ポスト投函日（郵送請求のとき）
  applicantType?: ApplicantType; // 本人申請 / 代理人
  applicantAgentName?: string; // 代理人の名前
  movingDate?: string; // 転出日（転出届）
  newAddress?: string; // 転入先の住所（転出届）
  juminhyoMethod?: JuminhyoMethod; // 住民票: 郵送請求 / 窓口発行
  juminhyoMyNumber?: boolean; // 住民票に個人番号（マイナンバー）を記載する
  juminhyoPurpose?: string; // 住民票を発行する目的
  // 電話連絡メモ（main / nhi）
  mainPhoneContact?: string;
  mainPhoneContent?: string;
  mainPhoneNeeded?: string;
  mainUnpaidAmount?: string;
  mainPaymentStatus?: PaymentStatus;
  nhiPhoneContact?: string;
  nhiPhoneContent?: string;
  nhiPhoneNeeded?: string;
  nhiUnpaidAmount?: string;
  nhiPaymentStatus?: PaymentStatus;
  [key: string]: unknown;
}

export function judgeYear(
  showAsterisk: boolean,
  collectionType: CollectionType,
  appDate: Date,
): { yearType: YearType; fiscalStartYear: number; reason: string } {
  const month = appDate.getMonth() + 1;
  const calYear = appDate.getFullYear();

  if (showAsterisk) {
    const newFiscalStartYear = month >= 6 ? calYear : calYear - 1;
    return {
      yearType: "new",
      fiscalStartYear: newFiscalStartYear,
      reason:
        "この自治体は納期未到来額・未納額を「＊」表示する設定のため、所得・課税額が判別できず常に新年度の証明書で問題ありません。",
    };
  }

  if (collectionType === "special") {
    if (month >= 6) {
      const fiscalStartYear = calYear;
      return {
        yearType: "prev",
        fiscalStartYear: fiscalStartYear - 1,
        reason:
          "特別徴収は6月〜翌年5月の間、前年度の証明書を取得します（新年度への切替は翌年6月から）。",
      };
    } else {
      const fiscalStartYear = calYear - 1;
      return {
        yearType: "prev",
        fiscalStartYear: fiscalStartYear - 1,
        reason:
          "特別徴収は6月〜翌年5月の間、前年度の証明書を取得します（新年度への切替は翌年6月から）。",
      };
    }
  } else {
    if (month >= 6 && month <= 12) {
      const fiscalStartYear = calYear;
      return {
        yearType: "prev",
        fiscalStartYear: fiscalStartYear - 1,
        reason: "普通徴収は6月〜12月の間、前年度の証明書を取得します。",
      };
    } else {
      const fiscalStartYear = calYear - 1;
      return {
        yearType: "new",
        fiscalStartYear: fiscalStartYear,
        reason:
          "普通徴収は1月〜5月の間、新年度の証明書を取得します（12月が最終納期のため、1月以降は納期未到来額が0円表示となります）。",
      };
    }
  }
}

export function judgeTiming(
  collectionType: CollectionType,
  yearType: YearType,
  appDate: Date,
): { status: "ok" | "warn"; label: string; detail: string } {
  if (collectionType === "special" && yearType === "prev") {
    const month = appDate.getMonth() + 1;
    const day = appDate.getDate();
    if (month === 6 && day <= 13) {
      return {
        status: "warn",
        label: "取得タイミングに注意",
        detail:
          "6月10日が前年度分の最終特別徴収支払期日のため、反映が完了する6月14日以降の取得を推奨します。それより前に取得すると、直近の納付状況が証明書に反映されていない可能性があります。",
      };
    }
    return {
      status: "ok",
      label: "通常通り取得可能",
      detail: "6月14日以降のため、前年度分の特別徴収の納付状況は証明書に反映されています。",
    };
  }
  return {
    status: "ok",
    label: "通常通り取得可能",
    detail: "このケースでは取得タイミングに関する特別な制約はありません。",
  };
}

export function judgeNhiYear(appDate: Date): { fiscalStartYear: number; reason: string } {
  const month = appDate.getMonth() + 1;
  const calYear = appDate.getFullYear();
  const fiscalStartYear = month >= 6 ? calYear : calYear - 1;
  return {
    fiscalStartYear,
    reason:
      "国民健康保険税は6月になると常に最新年度に切り替わるため、6月以降は新年度の納税証明書を取得します。",
  };
}

export function buildRequiredDocs(
  muni: Municipality,
  yearType: YearType,
  hasNhi: boolean,
  appDate: Date,
  nhiMuni: Municipality | null,
): JudgmentDoc[] {
  const docs: JudgmentDoc[] = [];
  const yearLabel = yearType === "prev" ? "前年度" : "新年度";

  if (muni.has_income || muni.has_tax) {
    const metaParts: string[] = [];
    if (muni.has_income) metaParts.push("所得額の記載あり");
    if (muni.has_tax) metaParts.push("課税額の記載あり");
    docs.push({
      title: `${muni.cert_name}（${yearLabel}分）`,
      meta: metaParts.join(" / "),
      starred: muni.show_asterisk,
    });
  } else {
    docs.push({
      title: `${muni.cert_name}（${yearLabel}分）`,
      meta: "所得額・課税額の記載設定なし（要確認）",
      starred: muni.show_asterisk,
    });
  }

  if (muni.needs_tax_payment_cert) {
    docs.push({
      title: `納税証明書（${yearLabel}分）`,
      meta: "課税証明書とは別途取得が必要です",
      starred: muni.show_asterisk,
    });
  }

  if (hasNhi) {
    const nhiYear = judgeNhiYear(appDate);
    const nhiMuniName = nhiMuni ? nhiMuni.name : "（取得先自治体未選択）";
    const sameMuni = nhiMuni && muni && nhiMuni.id === muni.id;
    docs.push({
      title: `国民健康保険税 納税証明書（${yearWithReiwa(nhiYear.fiscalStartYear)}・新年度分）`,
      meta: `取得先：${nhiMuniName}${sameMuni ? "（課税証明書と同じ自治体）" : nhiMuni ? "（課税証明書とは別の自治体）" : ""}。国民健康保険に加入しているため必要です。現在お住まいの自治体で、6月以降は常に最新年度を取得します。`,
      starred: false,
      isNhi: true,
    });
  }

  return docs;
}

// 請求種別の表示名
export function requestKindLabel(kind?: RequestKind): string {
  if (kind === "tenshutsu") return "転出届";
  if (kind === "juminhyo") return "住民票";
  return "課税・納税証明書";
}

// 住民票の書類名（個人番号の記載有無つき）
export function juminhyoTitle(withMyNumber: boolean): string {
  return `住民票の写し（個人番号の記載${withMyNumber ? "あり" : "なし"}）`;
}

// 申請者の表示（本人申請 / 代理人（名前））
export function applicantLabel(type?: ApplicantType, agentName?: string): string {
  return type === "agent" ? `代理人（${agentName || "名前未入力"}）` : "本人申請";
}

// 自治体マスタの設定で本人申請のみ（代理人申請不可）か
export function isSelfOnlyMunicipality(
  kind: "tenshutsu" | "juminhyo",
  muni: Municipality | null,
): boolean {
  if (!muni) return false;
  return kind === "tenshutsu" ? !!muni.tenshutsu_self_only : !!muni.juminhyo_self_only;
}

export function collectionLabel(t: CollectionType): string {
  return t === "special" ? "特別徴収" : "普通徴収";
}

export function paymentStatusLabel(status?: string): string {
  if (status === "unpaid") return "未納";
  if (status === "paid") return "納付済";
  if (status === "receipt_sent") return "領収証送付済み";
  return "";
}

export function formatYen(amount?: string): string {
  const n = Number(amount);
  if (!amount || isNaN(n)) return "";
  return n.toLocaleString("ja-JP") + "円";
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatDateJP(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

export function toReiwa(seirekiYear: number): number {
  return seirekiYear - 2018;
}

export function toReiwaLabel(seirekiYear: number): string {
  const r = toReiwa(seirekiYear);
  if (r <= 0) return `${seirekiYear}`;
  return `令和${r}`;
}

export function yearWithReiwa(fiscalStartYear: number): string {
  return `${fiscalStartYear}年度（${toReiwaLabel(fiscalStartYear)}年度）`;
}

export function fiscalYearLabel(fiscalStartYear: number): string {
  return `${fiscalStartYear}年度【${toReiwaLabel(fiscalStartYear)}年度】（${fiscalStartYear}年6月〜${fiscalStartYear + 1}年5月）`;
}
