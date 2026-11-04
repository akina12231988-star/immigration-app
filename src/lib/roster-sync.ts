// 在籍名簿（請求書作成で書き出したエクセル）の「配属先」「居住について」を外国人詳細へ反映する。
//
// 名簿のシートから見出しの行（氏名・配属先・居住について）を探し、1人ずつ取り出す。
// 外国人は在留カード番号で照合し、番号が無い・合わないときは氏名（空白を除いて同じ）で照合する
// （同じ氏名が2人以上いるときは照合しない）。今の値と違うものだけを反映の対象にする。

import type { ReadSheet } from "@/lib/xlsx-read";

export interface RosterEntry {
  sheet: string; // シート名（所属機関）
  name: string;
  cardNo: string;
  office: string; // 配属先
  residence: string; // 居住について
}

export interface RosterWorker {
  id: string;
  name: string;
  residence_card_no: string | null;
  assigned_office: string | null;
  residence_note: string | null;
}

export type RosterMatch =
  | { entry: RosterEntry; worker: RosterWorker; by: "card" | "name"; officeChanged: boolean; residenceChanged: boolean }
  | { entry: RosterEntry; worker: null; reason: string };

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFKC").replace(/\s+/g, "").toUpperCase();

// シートから名簿の行を取り出す（見出しの行が無いシートは飛ばす）
export function parseRosterSheets(sheets: ReadSheet[]): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (const sh of sheets) {
    const hi = sh.rows.findIndex((r) => r.includes("氏名") && (r.includes("配属先") || r.includes("居住について")));
    if (hi < 0) continue;
    const hdr = sh.rows[hi];
    const col = (label: string) => hdr.indexOf(label);
    const [iName, iCard, iOffice, iRes] = [col("氏名"), col("在留カード番号"), col("配属先"), col("居住について")];
    for (const r of sh.rows.slice(hi + 1)) {
      const name = (r[iName] ?? "").trim();
      if (!name) continue;
      out.push({
        sheet: sh.name,
        name,
        cardNo: iCard >= 0 ? (r[iCard] ?? "").trim() : "",
        office: iOffice >= 0 ? (r[iOffice] ?? "").trim() : "",
        residence: iRes >= 0 ? (r[iRes] ?? "").trim() : "",
      });
    }
  }
  return out;
}

// 名簿の1人ずつを外国人に照合し、変わる項目を出す。名簿で空の欄は変えない（今の値を消さない）
export function matchRoster(entries: RosterEntry[], workers: RosterWorker[]): RosterMatch[] {
  const byCard = new Map<string, RosterWorker>();
  const byName = new Map<string, RosterWorker[]>();
  for (const w of workers) {
    const c = norm(w.residence_card_no);
    if (c) byCard.set(c, w);
    const n = norm(w.name);
    byName.set(n, [...(byName.get(n) ?? []), w]);
  }
  return entries.map((entry) => {
    let worker = entry.cardNo ? byCard.get(norm(entry.cardNo)) : undefined;
    let by: "card" | "name" = "card";
    if (!worker) {
      const cands = byName.get(norm(entry.name)) ?? [];
      if (cands.length === 1) {
        worker = cands[0];
        by = "name";
      } else {
        return {
          entry,
          worker: null,
          reason: cands.length > 1 ? "同じ氏名の外国人が複数いるため照合できません" : "外国人が見つかりません",
        };
      }
    }
    const officeChanged = Boolean(entry.office) && entry.office !== (worker.assigned_office ?? "").trim();
    const residenceChanged = Boolean(entry.residence) && entry.residence !== (worker.residence_note ?? "").trim();
    return { entry, worker, by, officeChanged, residenceChanged };
  });
}
