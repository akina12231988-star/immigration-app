// 申請詳細の許可情報を保存する前の「在留カード情報の最終確認」。
// 在留カード等読取アプリケーションの照合結果に似せた見本のカードに、入力した内容を流し込んで見せる。
// ここは表示用の文字を作る純粋関数（テストできる）。

// 半角の数字・英字を全角にする（在留カードの番号・満了日の書き方に合わせる）
export function toFullWidth(s: string): string {
  return s.replace(/[0-9A-Za-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
}

// 1995-04-10 → 1995年04月10日（形が違えば空）
export function cardDate(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? "");
  return m ? `${m[1]}年${m[2]}月${m[3]}日` : "";
}

// 性別の書き方（女 F. ／ 男 M.）
export function cardGender(gender: string | null | undefined): string {
  const g = (gender ?? "").trim();
  if (g === "女") return "女 F.";
  if (g === "男") return "男 M.";
  return g;
}

// 申請内容から「許可の種類」（照合結果の許可の欄の書き方）
export function permissionKind(applicationContent: string | null | undefined): string {
  const c = (applicationContent ?? "").trim();
  if (c.includes("変更")) return "在留資格変更許可";
  if (c.includes("更新")) return "在留期間更新許可";
  if (c.includes("認定")) return "在留資格認定";
  return c;
}

export interface ResidenceCardConfirmData {
  name: string;
  birth: string | null;
  gender: string;
  nationality: string;
  address: string;
  residenceStatus: string; // 在留資格（今入力した内容）
  expiryDate: string; // 在留期間満了日
  cardNo: string; // 在留カード番号
  period: string; // 在留期間
  permitDate: string; // 在留許可日
  applicationContent: string; // 申請内容（許可の種類に使う）
  periodNote: string; // 在留期間の注意事項
}

// 入っていない項目（見落とし防止に赤で出す）
export function missingCardItems(d: ResidenceCardConfirmData): string[] {
  const out: string[] = [];
  if (!d.cardNo.trim()) out.push("在留カード番号");
  if (!d.permitDate) out.push("在留許可日");
  if (!d.expiryDate) out.push("在留期限日");
  if (!d.residenceStatus.trim()) out.push("在留資格");
  if (!d.period.trim()) out.push("在留期間");
  return out;
}
