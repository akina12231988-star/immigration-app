// 日本語の合格証・専門外の合格証の「受験情報」（受験した試験名・受験地・日本語のレベル）。
//
// 同じ人が複数の試験を受けていることがあるため、受験情報は何件でも登録できる。
// 合格証のファイルは受験情報ごとに分けて保存し、どの試験名の合格証かを取り違えないようにする。
//
// 保存先:
//   1件目 … workers.cert_nihongo_name / cert_nihongo_location（0114。専門外も同様）と
//            合格証ファイル cert_nihongo / cert_senmongai（従来どおり）
//   2件目以降 … workers.cert_exams（0115・jsonb の配列）と
//            合格証ファイル cert_nihongo_xxxxxx / cert_senmongai_xxxxxx
// こうすることで、申請準備の合格証パネルや過去に登録したデータはそのまま使える。

export type CertExamKind = "nihongo" | "senmongai";

export interface WorkerCertExam {
  id: string; // 受験情報ごとの識別子（英数字。添付ファイルのキーに使う）
  kind: CertExamKind;
  name: string; // 受験した試験名
  location: string; // 受験地（日本国内 / 海外の国名）
  level: string; // 日本語の合格証のレベル（N4/N3/N2/N1。専門外・未選択は ''）
  doc_key: string; // 合格証ファイルの保存キー
}

// 日本語の合格証のレベル。特定技能で必要になるのはN4以上のため、この4つを候補にする
export const JLPT_LEVELS = ["N4", "N3", "N2", "N1"] as const;

// 種類ごとの、1件目の保存キー（従来からのキー。申請準備の合格証パネルとも共有する）
export const CERT_BASE_DOC_KEY: Record<CertExamKind, string> = {
  nihongo: "cert_nihongo",
  senmongai: "cert_senmongai",
};

export const CERT_KIND_LABEL: Record<CertExamKind, string> = {
  nihongo: "日本語の合格証",
  senmongai: "専門外の合格証",
};

// 2件目以降の保存キー（例: cert_nihongo_a1b2c3）。
// 保存キーは英数字と _ で32文字までのため、識別子は短くする
export function certExamDocKey(kind: CertExamKind, id: string): string {
  return `${CERT_BASE_DOC_KEY[kind]}_${id}`;
}

// その合格証のファイルか（1件目の cert_nihongo と、2件目以降の cert_nihongo_xxxxxx のどちらも）。
// 申請準備の「添付あり」の判定にも使う
export function isCertDocKeyOf(baseKey: string, docKey: string): boolean {
  return docKey === baseKey || docKey.startsWith(`${baseKey}_`);
}

// jsonb から読んだ値を配列に整える（0115未適用・古い形でも落ちないようにする）
export function normalizeCertExams(value: unknown): WorkerCertExam[] {
  if (!Array.isArray(value)) return [];
  const out: WorkerCertExam[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const kind = r.kind === "senmongai" ? "senmongai" : "nihongo";
    const id = typeof r.id === "string" ? r.id : "";
    if (!id) continue;
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    out.push({
      id,
      kind,
      name: s(r.name),
      location: s(r.location),
      level: s(r.level),
      doc_key: s(r.doc_key) || certExamDocKey(kind, id),
    });
  }
  return out;
}

// 1件目（0114の列）と2件目以降（cert_exams）をつないで、画面に出す並びにする。
// 1件目は受験情報が空でも必ず出す（合格証のファイルだけ先に登録することがあるため）
export function certExamRows(
  kind: CertExamKind,
  firstName: string,
  firstLocation: string,
  firstLevel: string,
  stored: WorkerCertExam[],
): WorkerCertExam[] {
  const first: WorkerCertExam = {
    id: "",
    kind,
    name: firstName,
    location: firstLocation,
    level: firstLevel,
    doc_key: CERT_BASE_DOC_KEY[kind],
  };
  return [first, ...stored.filter((e) => e.kind === kind)];
}

// 新しい受験情報の識別子。同じ人の中で重複しない短い英数字にする
export function newCertExamId(used: Iterable<string>): string {
  const taken = new Set(used);
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let attempt = 0; attempt < 50; attempt++) {
    let id = "";
    for (let i = 0; i < 6; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!taken.has(id)) return id;
  }
  // ここまで来ることはまずないが、念のため件数で一意にする
  let n = taken.size + 1;
  while (taken.has(`e${n}`)) n++;
  return `e${n}`;
}
