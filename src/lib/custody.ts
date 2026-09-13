// パスポート・在留カード原本の預かり管理のロジック。
// 保管番号（001〜999）は「預かり証の番号 ＝ パスポートの付箋に貼る番号」として共通に使う。

export const STORAGE_NO_MIN = 1;
export const STORAGE_NO_MAX = 999;

// 3桁ゼロ埋め表示（付箋・預かり証と同じ見た目）
export function formatStorageNo(no: number): string {
  return String(no).padStart(3, "0");
}

// 現に預かり中の番号を避けて、最小の空き番号を返す（全て埋まっていれば null）
export function nextFreeStorageNo(usedNos: number[]): number | null {
  const used = new Set(usedNos);
  for (let n = STORAGE_NO_MIN; n <= STORAGE_NO_MAX; n++) {
    if (!used.has(n)) return n;
  }
  return null;
}

// 預かり証の整理番号（azk-receipt の AZK-YYYYMMDD-XXXX 形式を踏襲し、末尾は保管番号で決定的にする）
export function custodyRefNo(receivedOn: string, storageNo: number): string {
  return `AZK-${receivedOn.replace(/-/g, "")}-${formatStorageNo(storageNo)}`;
}

// 預かった日の3ヶ月後（預かり証の有効年月日の既定値）
export function defaultExpireOn(receivedOn: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(receivedOn);
  if (!m) return "";
  const day = Number(m[3]);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, day));
  d.setUTCMonth(d.getUTCMonth() + 3);
  // 3ヶ月後に同じ日が無い場合（例: 11/30 → 2/30）は月末に丸める
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

// 持出・返却時の目的の選択肢（「その他」は画面側で手入力に切り替える）
export const CUSTODY_PURPOSES = [
  "転入手続き",
  "母国に一時帰国",
  "申請書類ファイルに入っている",
  "入管ー窓口申請する為",
  "入管ー許可おりた為",
] as const;

// ---- 預かり証の翻訳（azk-receipt の多言語データを移植） ----

export interface ReceiptTranslation {
  natKeywords: string[];
  langLabel: string;
  title: string;
  legal: string;
}

export const RECEIPT_TRANSLATIONS: Record<string, ReceiptTranslation> = {
  vi: {
    natKeywords: ["ベトナム", "ビエトナム", "VIETNAM"],
    langLabel: "ベトナム語",
    title: "CHÚNG TÔI ĐANG GIỮ HỘ CHIẾU VÀ THẺ NGOẠI KIỀU CỦA BẠN",
    legal: "Khi bạn ra ngoài đường thì bạn cầm giấy này theo nhé！",
  },
  km: {
    natKeywords: ["カンボジア", "CAMBODIA"],
    langLabel: "クメール語",
    title: "យើងខ្ញុំកំពុងរក្សាលិខិតឆ្លងដែន និងអត្តសញ្ញាណប័ណ្ណស្នាក់នៅរបស់អ្នក",
    legal: "នៅពេលអ្នកចេញទៅខាងក្រៅ សូមយកលិខិតនេះទៅជាមួយផង！",
  },
  id: {
    natKeywords: ["インドネシア", "INDONESIA"],
    langLabel: "インドネシア語",
    title: "KAMI SEDANG MENYIMPAN PASPOR DAN KARTU IZIN TINGGAL ANDA",
    legal: "Saat Anda keluar, harap bawa surat ini bersama Anda！",
  },
  tl: {
    natKeywords: ["フィリピン", "PHILIPPINES", "PILIPINAS"],
    langLabel: "タガログ語",
    title: "HAWAK NAMIN ANG INYONG PASAPORTE AT RESIDENCE CARD",
    legal: "Kapag lumabas kayo, dalhin ang papel na ito！",
  },
};

// 国籍表記から預かり証に併記する翻訳を探す（該当なしは null）
export function receiptTranslation(nationality: string): ReceiptTranslation | null {
  const upper = nationality.trim().toUpperCase();
  if (!upper) return null;
  for (const t of Object.values(RECEIPT_TRANSLATIONS)) {
    if (t.natKeywords.some((kw) => upper.includes(kw.toUpperCase()))) return t;
  }
  return null;
}

// 預かり者・申請取次者（azk-receipt の固定表記）
// 登録支援機関（当社）の情報。ここは既定値で、画面（メニューの「登録支援機関」、申請準備 ＞ 申請書に貼る情報）で編集した内容は
// app_settings（key = CUSTODIAN_SETTING_KEY）に保存され、mergeCustodianInfo で上書きされる
export const CUSTODIAN_INFO = {
  officeName: "VUONG VAN THANH",
  registrationNo: "20登-005746",
  invoiceRegistrationNo: "T3810864134633", // 適格請求書発行事業者（インボイス）登録番号
  address: "熊本県熊本市東区小山2丁目13-20 日産共同住宅201号",
  tel: "050-8890-4000",
  mobile: "070-4713-5104",
  agentName: "秋吉 伽恋",
  agentCertNo: "受-222024800268",
  agentCertExpiry: "2027-06-18",
  // 申請書（所属機関等作成用 4「登録支援機関」）に書く内容
  registeredOn: "2021-03-24", // 登録年月日
  headOfficeAddress: "熊本県熊本市東区小山3-8-87 カームリーハウスB201", // 住所（所在地）
  koyoNo: "4301-629022-2", // 雇用保険適用事業所番号
  representativeName: "VUONG VAN THANH", // 代表者の氏名
  supportOfficeName: "VUONG VAN THANH", // 支援を行う事業所の名称
  supportManagerName: "VUONG VAN THANH", // 支援責任者名
  supportStaffName: "VUONG VAN THANH", // 支援担当者名
  languages: "", // 対応可能言語（空なら外国人の国籍から自動で出す）
  // 職業紹介事業者（国内）として申請書に書く内容
  placementLicenseNo: "43-ユ-300259", // 許可・届出受理番号
  placementLicensedOn: "2024-07-01", // 受理年月日
  placementKind: "有料職業紹介事業者", // 区分（有料職業紹介事業者 / 無料職業紹介事業者）
  placementName: "VUONG VAN THANH", // 氏名
  placementPostal: "861-8045", // 郵便番号
  placementAddress: "熊本県熊本市東区小山2丁目13-20 日産共同住宅201号", // 住所
  placementTel: "050-8890-4000", // 電話番号
} as const;

export type CustodianInfo = { [K in keyof typeof CUSTODIAN_INFO]: string };

// 登録支援機関の情報のうち、複数行になるもの（同じ app_settings の値に一緒に保存する）
export interface SupportOrgInterpreter {
  language: string; // 言語（例: ベトナム語）
  name: string; // 通訳者の氏名
}
export interface SupportOrgAgent {
  name: string; // 申請取次者の氏名
  certNo: string; // 届出済証明書の番号
  certExpiry: string; // 届出済証明書の有効期限（YYYY-MM-DD）
}
export interface SupportOrgLists {
  interpreters: SupportOrgInterpreter[]; // 対応可能言語ごとの通訳者
  agents: SupportOrgAgent[]; // 申請取次者（複数可）
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

// 保存されている一覧を取り出す。申請取次者が未保存のときは、従来の1人分（agentName など）から作る
export function mergeSupportOrgLists(override: Record<string, unknown> | null | undefined): SupportOrgLists {
  const rawI = Array.isArray(override?.interpreters) ? (override!.interpreters as unknown[]) : [];
  const interpreters = rawI
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return { language: str(o.language), name: str(o.name) };
    })
    .filter((r) => r.language || r.name);
  let agents: SupportOrgAgent[];
  if (Array.isArray(override?.agents)) {
    agents = (override!.agents as unknown[])
      .map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        return { name: str(o.name), certNo: str(o.certNo), certExpiry: str(o.certExpiry) };
      })
      .filter((r) => r.name || r.certNo || r.certExpiry);
  } else {
    const c = mergeCustodianInfo(override as Partial<Record<keyof CustodianInfo, unknown>> | null | undefined);
    agents = c.agentName || c.agentCertNo || c.agentCertExpiry ? [{ name: c.agentName, certNo: c.agentCertNo, certExpiry: c.agentCertExpiry }] : [];
  }
  return { interpreters, agents };
}

// 保存する値。一覧に加えて、従来の1人分の欄（agentName など）にも1人目を入れて古い画面でも使えるようにする
export function supportOrgSettingValue(info: CustodianInfo, lists: SupportOrgLists): Record<string, unknown> {
  const first = lists.agents[0];
  return {
    ...info,
    agentName: first?.name ?? "",
    agentCertNo: first?.certNo ?? "",
    agentCertExpiry: first?.certExpiry ?? "",
    interpreters: lists.interpreters,
    agents: lists.agents,
  };
}

// app_settings のキー（登録支援機関の情報）
export const CUSTODIAN_SETTING_KEY = "support_org";

// 保存されている上書き（一部だけでもよい）を既定値にかぶせる。空文字は「未登録」として既定値も消す
export function mergeCustodianInfo(override: Partial<Record<keyof CustodianInfo, unknown>> | null | undefined): CustodianInfo {
  const out: Record<string, string> = { ...CUSTODIAN_INFO };
  for (const k of Object.keys(CUSTODIAN_INFO) as (keyof CustodianInfo)[]) {
    const v = override?.[k];
    if (typeof v === "string") out[k] = v;
  }
  return out as CustodianInfo;
}

// ---- azk-receipt バックアップJSONの取込 ----

export interface AzkLedgerEntry {
  boxno: number; // 保管番号（数値化済み）
  name: string;
  nat: string;
  cardno: string;
  status: string; // 在留資格
  date: string; // 預かった日
  expire: string; // 有効年月日
  content: string; // 申請内容
  refno: string;
  returned: boolean;
  returnedAt: string | null;
}

// azk-receipt の「バックアップ保存」で出力されるJSON配列をパースする。
// 保管番号が数値化できない行（"???" など）は無効としてスキップし、件数を返す。
export function parseAzkLedger(text: string): { entries: AzkLedgerEntry[]; skipped: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("JSONとして読み取れません");
  }
  if (!Array.isArray(raw)) throw new Error("台帳バックアップの形式ではありません（配列ではありません）");

  const entries: AzkLedgerEntry[] = [];
  let skipped = 0;
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const boxno = Number.parseInt(String(r.boxno ?? "").replace(/\D/g, ""), 10);
    if (!Number.isFinite(boxno) || boxno < STORAGE_NO_MIN || boxno > STORAGE_NO_MAX) {
      skipped += 1;
      continue;
    }
    entries.push({
      boxno,
      name: String(r.name ?? "").trim(),
      nat: String(r.nat ?? "").trim(),
      cardno: String(r.cardno ?? "").trim().toUpperCase(),
      status: String(r.status ?? "").trim(),
      date: String(r.date ?? "").trim(),
      expire: String(r.expire ?? "").trim(),
      content: String(r.content ?? "").trim(),
      refno: String(r.refno ?? "").trim(),
      returned: r.returned === true,
      returnedAt: typeof r.returnedAt === "string" && r.returnedAt ? r.returnedAt : null,
    });
  }
  return { entries, skipped };
}
