// 履歴書ツールの日付の解釈・整形。
// 入力欄は文字（1995/03/01・1995-3-1・19950301・2027214 など）を柔軟に受け取り、
// 履歴書には「1995年 3月 1日」、埋め込みデータには「1995-03-01」の形で出す。

export interface DateParts {
  y: string;
  m: string;
  d: string;
}

export function pad2(x: string | number): string {
  const s = String(x);
  return s.length < 2 ? `0${s}`.slice(-2) : s;
}

// 文字を {年, 月, 日} に分ける。
// 対応: 1995/03/01・1995-3-1・19950301（8桁）・2027214（YYYY+M+DD 等の可変桁）
export function dateParts(input: string): DateParts | null {
  const s = String(input ?? "").trim();
  if (!s) return null;
  const sep = s.match(/^(\d{1,4})\D+(\d{1,2})(?:\D+(\d{1,2}))?/); // 区切りあり
  if (sep) return { y: sep[1], m: sep[2] ?? "", d: sep[3] ?? "" };
  const v = s.replace(/\D/g, "");
  if (v.length < 4) return { y: v, m: "", d: "" };
  const y = v.slice(0, 4);
  const r = v.slice(4); // 年4桁＋残り
  if (r.length <= 2) return { y, m: r, d: "" }; // 月まで
  if (r.length === 3) {
    // 月1〜2桁＋日
    const mm = Number(r.slice(0, 2));
    return mm >= 1 && mm <= 12
      ? { y, m: r.slice(0, 2), d: r.slice(2) } // MM + D
      : { y, m: r.slice(0, 1), d: r.slice(1) }; // M + DD（例 2027214 → 2/14）
  }
  return { y, m: r.slice(0, 2), d: r.slice(2, 4) }; // MM + DD
}

function clamp(v: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(v, 10);
  return Math.min(Math.max(Number.isFinite(n) ? n : fallback, min), max);
}

// 職歴の日付: 年4桁・月1〜12・日1〜31に丸めて返す（足りない部分は空）
export function parseCareerDate(input: string): DateParts {
  const p = dateParts(input);
  if (!p) return { y: "", m: "", d: "" };
  const y = /^\d{4}$/.test(p.y) ? p.y : p.y ? p.y.slice(0, 4) : "";
  const m = p.m ? String(clamp(p.m, 1, 12, 0)) : "";
  const d = p.d ? String(clamp(p.d, 1, 31, 0)) : "";
  return { y, m, d };
}

// 入力欄を離れたときの整形。職歴用: YYYY / YYYY/MM / YYYY/MM/DD（年が4桁でなければ触らない）
export function formatCareerDateInput(value: string): string {
  const p = dateParts(value);
  if (!p || !p.y) return value;
  const y = p.y.slice(0, 4);
  if (!/^\d{4}$/.test(y)) return value;
  let out = y;
  if (p.m) {
    out += `/${pad2(clamp(p.m, 1, 12, 1))}`;
    if (p.d) out += `/${pad2(clamp(p.d, 1, 31, 1))}`;
  }
  return out;
}

// 生年月日・実習修了日・ビザ期限用: 年月日がそろったときだけ YYYY/MM/DD にする
export function formatFullDateInput(value: string): string {
  const p = dateParts(value);
  if (p && p.y.length === 4 && p.m && p.d) return `${p.y}/${pad2(p.m)}/${pad2(p.d)}`;
  return value;
}

// 履歴書の表記（1995年 3月 1日）
export function formatResumeDate(value: string): string {
  const p = dateParts(value);
  if (!p || !p.y) return String(value ?? "");
  let o = `${Number(p.y)}年`;
  if (p.m) o += ` ${Number(p.m)}月`;
  if (p.d) o += ` ${Number(p.d)}日`;
  return o;
}

// 職歴の表記（2019年4月）
export function formatYearMonth(y: string, m: string, d: string): string {
  if (!y) return "";
  let s = `${Number(y)}年`;
  if (m) s += `${Number(m)}月`;
  if (d) s += `${Number(d)}日`;
  return s;
}

// 埋め込みデータ用に YYYY-MM-DD へ（月・日が無ければあるところまで）
export function toIsoDate(value: string): string {
  const p = dateParts(value);
  if (!p || !p.y) return String(value ?? "");
  if (p.m && p.d) return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
  if (p.m) return `${p.y}-${pad2(p.m)}`;
  return p.y;
}

// 満年齢（生年月日が年4桁でなければ null）
export function calcAge(value: string, today: Date = new Date()): number | null {
  const p = dateParts(value);
  if (!p || !/^\d{4}$/.test(p.y)) return null;
  const y = Number(p.y);
  const m = Number(p.m || 1);
  const d = Number(p.d || 1);
  let a = today.getFullYear() - y;
  const tm = today.getMonth() + 1;
  if (tm < m || (tm === m && today.getDate() < d)) a--;
  return a >= 0 && a < 130 ? a : null;
}
