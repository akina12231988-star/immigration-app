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
export const CUSTODIAN_INFO = {
  officeName: "VUONG VAN THANH",
  registrationNo: "20登-005746",
  address: "熊本県熊本市東区小山2丁目13-20 日産共同住宅201号",
  tel: "050-8890-4000",
  mobile: "070-4713-5104",
  agentName: "秋吉 伽恋",
  agentCertNo: "受-222024800268",
  agentCertExpiry: "2027-06-18",
} as const;

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
