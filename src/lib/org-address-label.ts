// 所属機関の住所・会社名を、テープ（ラベルプリンター）に貼るテキストや CSV にする。
//
// ブラザーの P-touch Editor などに貼り付けて印刷できるよう、
//   〒861-8041
//   熊本県熊本市東区戸島５丁目15番29号
//
//   有限会社　丸尾工務店
// の形にする。複数の機関をまとめて印刷するときは CSV（会社名・郵便番号・住所）にして
// ラベルソフトのデータベース機能に読み込ませる。画面から切り出して単体テストできるようにしている。

export interface AddressLabelSource {
  name: string;
  postal: string; // 郵便番号（数字のみでもハイフン付きでもよい。空は未登録）
  address: string;
}

export interface AddressLabelOptions {
  honorific?: string; // 会社名の後に付ける敬称（御中 など。空なら付けない）
}

// 郵便番号を「861-8041」の形にそろえる（数字7桁でなければそのまま）
export function formatPostal(raw: string | null | undefined): string {
  const digits = (raw ?? "").normalize("NFKC").replace(/[^0-9]/g, "");
  if (digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return (raw ?? "").trim();
}

// 郵便番号を数字7桁にする（保存用）。7桁にならなければ ""
export function postalDigits(raw: string | null | undefined): string {
  const digits = (raw ?? "").normalize("NFKC").replace(/[^0-9]/g, "");
  return digits.length === 7 ? digits : "";
}

// 会社名の空白を全角1つにそろえる（「有限会社 丸尾工務店」→「有限会社　丸尾工務店」）
export function labelCompanyName(name: string, honorific = ""): string {
  const n = name.trim().replace(/[\s　]+/g, "　");
  return honorific ? `${n}　${honorific}` : n;
}

// テープに貼るテキスト（郵便番号が無ければ〒の行は出さない）
export function addressLabelText(src: AddressLabelSource, opts: AddressLabelOptions = {}): string {
  const lines: string[] = [];
  const postal = formatPostal(src.postal);
  if (postal) lines.push(`〒${postal}`);
  if (src.address.trim()) lines.push(src.address.trim());
  lines.push("");
  lines.push(labelCompanyName(src.name, opts.honorific ?? ""));
  return lines.join("\n");
}

// CSV の1マス（カンマ・改行・引用符があれば引用符で囲む）
export function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// 会社名・郵便番号・住所の CSV（1行目は見出し）。Excel で開けるよう BOM 付き UTF-8 にする
export function buildAddressCsv(rows: AddressLabelSource[], opts: AddressLabelOptions = {}): string {
  const header = ["会社名", "郵便番号", "住所", "宛名"];
  const body = rows.map((r) =>
    [r.name.trim(), formatPostal(r.postal), r.address.trim(), labelCompanyName(r.name, opts.honorific ?? "")]
      .map(csvCell)
      .join(","),
  );
  return `﻿${[header.join(","), ...body].join("\r\n")}\r\n`;
}

// ファイル名（例: 所属機関の住所_2026-10-20_12件.csv）
export function addressCsvFileName(count: number, today: string): string {
  return `所属機関の住所_${today}_${count}件.csv`;
}
