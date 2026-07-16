// Notion「在籍履歴」エクスポートCSVを、外国人取り込み用の中間データに変換する。
// 変換後は parseLegacyJson に渡し、既存の正規化・スキップ処理を再利用する。

import { parseLegacyJson, type ImportResult } from "./import";

// ---- CSV パーサ（RFC4180 準拠。引用符内の改行・カンマに対応） ----
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM除去
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// 在留資格（全角表記など）→ アプリの在留資格名へ正規化
const VISA_MAP: Record<string, string> = {
  特定技能１号: "特定技能1号",
  特定技能1号: "特定技能1号",
  特定技能１号更新: "特定技能1号",
  特定技能２号: "特定技能2号",
  特定技能2号: "特定技能2号",
  技能実習: "技能実習",
  "特定活動（特定技能１号移行準備）": "特定活動（特定技能1号移行準備）",
  "特定活動（特定技能２号移行準備）": "特定活動（特定技能2号移行準備）",
  留学: "留学",
  本国での職歴: "本国での職歴",
};

function cleanWs(s: string): string {
  return s.replace(/[　\s]+/g, " ").trim();
}

// "2026年7月22日" / "2026/7/22" / "2026-07-22" / "July 22, 2026" → YYYY-MM-DD
function toIso(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  let m = s.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const MONTHS: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  };
  m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[2].padStart(2, "0")}`;
  }
  return "";
}

const URL_SUFFIX = /\s*\(https?:\/\/[^)]*\)\s*$/;
const LEADING_NAME = /^([A-Za-z][A-Za-z .'　-]*[A-Za-z])/;

// "NAME 注釈 (https://notion...)" → { legacyId, name, annotation }
function splitName(raw: string): { legacyId: string | null; name: string; annotation: string } {
  let legacyId: string | null = null;
  let rest = raw;
  const um = raw.match(URL_SUFFIX);
  if (um) {
    legacyId = um[0].trim().replace(/^\(|\)$/g, "").split("?")[0];
    rest = raw.slice(0, um.index);
  }
  rest = cleanWs(rest);
  const nm = rest.match(LEADING_NAME);
  if (!nm) return { legacyId, name: rest, annotation: "" };
  return { legacyId, name: cleanWs(nm[1]), annotation: cleanWs(rest.slice(nm[0].length)) };
}

// 会社・機関名の絵文字マーカー等を除去
function cleanOrgName(raw: string): string {
  if (!raw) return "";
  let s = splitName(raw).name || cleanWs(raw);
  s = s.replace(/[（(][^）)]*(?:💰|❌|🍓|通貨|雇|廃業)[^）)]*[）)]/g, "");
  s = s.replace(/[💰❌🍓]/g, "");
  return cleanWs(s);
}

function normalizeVisa(raw: string): string {
  const s = cleanWs(raw);
  return VISA_MAP[s] ?? s; // 未知は素通し（parseLegacyJson 側で「その他」に補正）
}

// ヘッダ名の表記ゆれを吸収して値を取り出す
function pick(rec: Record<string, string>, names: string[]): string {
  for (const n of names) {
    if (rec[n] != null && rec[n] !== "") return rec[n];
  }
  return "";
}

const NAME_COLS = ["外国人の名前", "氏名", "名前", "Name"];

// Notion CSV → ImportResult（parseLegacyJson 互換の中間データ経由）
export function parseNotionCsv(text: string): ImportResult {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) return { workers: [], workerCount: 0, historyCount: 0, skipped: [] };

  const header = rows[0].map((h) => cleanWs(h));
  const records: Record<string, string>[] = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => (rec[h] = (r[i] ?? "").trim()));
    return rec;
  });

  const nameKey = header.find((h) => NAME_COLS.includes(h)) ?? header[0];

  // 同一人物（外国人の名前 が同じ）で行をまとめる
  const groups = new Map<string, Record<string, string>[]>();
  for (const rec of records) {
    const key = (rec[nameKey] ?? "").trim();
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(rec);
    groups.set(key, list);
  }

  const workers: Record<string, unknown>[] = [];
  for (const [key, list] of groups) {
    const { legacyId, name, annotation } = splitName(key);
    if (!name) continue;

    // 在留許可日で時系列に並べる（欠損は末尾）
    const sorted = [...list].sort((a, b) => {
      const da = toIso(pick(a, ["在留許可日", "許可日"]));
      const db = toIso(pick(b, ["在留許可日", "許可日"]));
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });

    const history = sorted.map((r, idx) => {
      const isLast = idx === sorted.length - 1;
      const start = toIso(pick(r, ["在留許可日", "許可日"]));
      const expiry = toIso(pick(r, ["在留期限日", "在留期限"]));
      const retired = toIso(pick(r, ["退職日"]));
      const zairyu = cleanWs(pick(r, ["在籍状況", "状態"]));
      let end = "";
      if (isLast) {
        if (retired) end = retired;
        else if (zairyu === "退職" || zairyu === "支援委託終了") end = expiry;
        else end = ""; // 継続中
      } else {
        end = expiry;
      }
      return {
        visa: normalizeVisa(pick(r, ["在留資格（当時）", "在留資格", "在留資格(当時)"])),
        start,
        end: end || null,
        org: cleanOrgName(pick(r, ["所属機関", "配属先", "会社"])),
        role: "",
        note: "",
      };
    });

    const last = sorted[sorted.length - 1];
    const anyRetired = sorted.map((r) => toIso(pick(r, ["退職日"]))).find(Boolean) ?? "";
    const lastZairyu = cleanWs(pick(last, ["在籍状況", "状態"]));
    let status: string | undefined;
    if (anyRetired) status = "退職";
    else if (lastZairyu === "在籍中") status = "在籍中";
    else if (lastZairyu === "退職") status = "退職";
    else status = undefined; // 支援委託終了・空欄は既定値に委ねる

    const noteParts: string[] = [];
    if (annotation) noteParts.push(annotation);
    const gender = cleanWs(pick(last, ["性別"]));
    if (gender) noteParts.push(`性別: ${gender}`);
    for (const c of ["報酬支払い方法", "支援担当者", "居住について", "配属先"]) {
      const v = cleanWs(pick(last, [c]));
      if (v) noteParts.push(`${c}: ${v}`);
    }

    workers.push({
      legacy_id: legacyId,
      name,
      kana: cleanWs(pick(last, ["フリガナ", "ふりがな", "カナ"])),
      nationality: cleanWs(pick(last, ["国籍"])),
      birth: toIso(pick(last, ["生年月日"])),
      residence_card_no: cleanWs(pick(last, ["在留カード番号", "在留カードNo", "在留カード"])),
      note: noteParts.join(" / "),
      residence_status: normalizeVisa(pick(last, ["在留資格（当時）", "在留資格", "在留資格(当時)"])),
      residence_permit_date: toIso(pick(last, ["在留許可日", "許可日"])),
      residence_expiry_date: toIso(pick(last, ["在留期限日", "在留期限"])),
      messenger_link: cleanWs(pick(last, ["メッセンジャー", "Messenger", "messenger"])),
      organization_name: cleanOrgName(pick(last, ["所属機関", "配属先", "会社"])),
      status,
      history,
    });
  }

  return parseLegacyJson({ workers });
}
