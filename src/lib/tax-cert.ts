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

// 定額小為替（証明書1枚につき1枚同封する）。
// 番号は「前半の数字-後半の数字」で控える
export type MoneyOrderGroup = "main" | "nhi"; // 課税証明書など / 国民健康保険税

export interface MoneyOrder {
  id: string;
  docTitle: string; // どの証明書の分か
  first: string; // 番号の前半
  second: string; // 番号の後半
  amount?: string; // 金額（円）
  group?: MoneyOrderGroup; // どの欄の分か（未設定は課税証明書などの欄）
  extra?: boolean; // 「定額小為替を追加」で足した分（2年度分など）
}

// 定額小為替の額面（郵便局で買える種類）
export const MONEY_ORDER_AMOUNTS = [
  "50",
  "100",
  "150",
  "200",
  "250",
  "300",
  "350",
  "400",
  "450",
  "500",
  "750",
  "1000",
] as const;

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
  juminhyoCopies?: number; // 住民票の請求通数（1通につき定額小為替1枚）
  // 郵送請求に同封した定額小為替（証明書1枚につき1枚）
  moneyOrders?: MoneyOrder[];
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

// ---- 定額小為替 ----

// 表示用の番号（前半-後半）。片方でも入っていれば出す
export function moneyOrderNo(mo: { first: string; second: string }): string {
  const first = mo.first.trim();
  const second = mo.second.trim();
  if (!first && !second) return "";
  return `${first}-${second}`;
}

// 郵送請求で送る証明書の一覧（この枚数だけ定額小為替を同封する）。
// 窓口で受け取るものは郵送しないので含めない。

interface MailedSource {
  requestKind?: RequestKind;
  juminhyoMethod?: JuminhyoMethod;
  juminhyoMyNumber?: boolean;
  juminhyoCopies?: number;
  requestMethod?: RequestMethod;
  yearType?: YearType;
  hasNhi?: boolean;
  nhiSameAsMain?: boolean;
  nhiRequestMethod?: RequestMethod;
  docs?: JudgmentDoc[];
}

// 課税証明書などの欄の分（課税証明書で1枚、市県民税納税証明書で1枚）
export function mainMailedTitles(r: MailedSource): string[] {
  if (r.requestMethod !== "mail") return [];
  const yearLabel = r.yearType === "new" ? "新年度" : "前年度";
  const titles = (r.docs ?? []).filter((d) => !d.isNhi).map((d) => d.title);
  // 市県民税の納税証明書は自治体によっては判定結果に出ないが、
  // 課税証明書とは別に1枚同封するので行は必ず作る
  if (!titles.some((t) => t.includes("納税証明書"))) {
    titles.push(`市県民税納税証明書（${yearLabel}分）`);
  }
  return titles;
}

// 国民健康保険税納税証明書の欄の分（1枚）
export function nhiMailedTitles(r: MailedSource): string[] {
  if (!r.hasNhi) return [];
  // 「課税証明書と同じ受領方法」か、別に指定した方法で判断する
  const byMail =
    r.nhiSameAsMain === false ? r.nhiRequestMethod === "mail" : r.requestMethod === "mail";
  if (!byMail) return [];
  const titles = (r.docs ?? []).filter((d) => d.isNhi).map((d) => d.title);
  return titles.length > 0 ? titles : ["国民健康保険税 納税証明書"];
}

export function mailedDocTitles(r: MailedSource): string[] {
  // 転出届は手数料がかからないため、定額小為替は自動では出さない
  // （同封した場合は手で1枚追加できる）
  if (r.requestKind === "tenshutsu") return [];
  if (r.requestKind === "juminhyo") {
    if (r.juminhyoMethod === "window") return [];
    const title = juminhyoTitle(!!r.juminhyoMyNumber);
    const copies = Math.max(1, Math.floor(r.juminhyoCopies ?? 1));
    // 1通につき1枚。2通以上なら「1通目」「2通目」と分けて控える
    if (copies === 1) return [title];
    return Array.from({ length: copies }, (_, i) => `${title}（${i + 1}通目）`);
  }
  return [...mainMailedTitles(r), ...nhiMailedTitles(r)];
}

// 証明書の枚数に合わせて定額小為替の行をそろえる。
// すでに入力した番号・金額は、同じ証明書の行に引き継ぐ（順番も保つ）。
// 「定額小為替を追加」で足した行（2年度分など）は、そのまま末尾に残す。
export function syncMoneyOrders(
  titles: string[],
  existing: MoneyOrder[] = [],
  group: MoneyOrderGroup = "main",
): MoneyOrder[] {
  const rest = [...existing];
  const rows: MoneyOrder[] = titles.map((title, i) => {
    const at = rest.findIndex((o) => !o.extra && o.docTitle === title);
    if (at >= 0) return { ...rest.splice(at, 1)[0], docTitle: title, group };
    return { id: `mo-${group}-${i}-${title}`, docTitle: title, first: "", second: "", group };
  });
  // 手で追加した行と、証明書が減っても番号が入っている行は消さずに残す
  return [
    ...rows,
    ...rest
      .filter((o) => o.extra || moneyOrderNo(o) !== "")
      .map((o) => ({ ...o, group })),
  ];
}

// この記録に紐づく定額小為替のうち、指定した欄の分
export function moneyOrdersOf(
  orders: MoneyOrder[] = [],
  group: MoneyOrderGroup,
): MoneyOrder[] {
  return orders.filter((o) => (o.group ?? "main") === group);
}

// 一覧に出す一言（例: 定額小為替 2枚（番号入力済み 1枚））
export function moneyOrderSummary(orders: MoneyOrder[] = []): string {
  if (orders.length === 0) return "";
  const filled = orders.filter((o) => moneyOrderNo(o) !== "").length;
  const total = moneyOrderTotal(orders);
  const totalText = total > 0 ? `・合計 ${total.toLocaleString("ja-JP")}円` : "";
  return `定額小為替 ${orders.length}枚（番号入力済み ${filled}枚）${totalText}`;
}

// 同封した定額小為替の合計金額（円）
export function moneyOrderTotal(orders: MoneyOrder[] = []): number {
  return orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
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
