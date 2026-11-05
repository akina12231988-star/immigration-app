// 証明書類の請求で、申請書に書く本人の情報（氏名・生年月日・住所・住所歴）をコピーしやすく並べる。
// 住所歴は転入日ごとの記録（worker_addresses）を「いつからいつまで」の期間にして、新しい順に出す。
// 課税・納税証明書は年度ごとの1月1日時点の住所の自治体に請求するので、その住所には印を付ける。

import { addressOnDate, type WorkerAddress } from "@/lib/worker-address";
import { warekiDate } from "@/lib/dependents";

export interface AddressPeriod {
  id: string;
  from: string; // 転入日（YYYY-MM-DD）
  to: string | null; // 次の転入日の前日。null は現在
  address: string;
  marks: string[]; // 例: ["R8（2026/1/1）"]
}

const ymdSlash = (d: string) => d.replace(/-/g, "/");

function dayBefore(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// 年度（西暦の年度開始年）→ 令和の略記（2026 → R8）
export function reiwaShort(fiscalStartYear: number): string {
  return `R${fiscalStartYear - 2018}`;
}

// 住所歴を期間にする（新しい順）。years を渡すと、その年度の1月1日時点の住所に印を付ける
export function addressPeriods(addresses: WorkerAddress[], years: number[] = []): AddressPeriod[] {
  const asc = [...addresses].filter((a) => a.moved_on).sort((a, b) => a.moved_on.localeCompare(b.moved_on));
  const marks = new Map<string, string[]>();
  for (const y of [...new Set(years)].sort((a, b) => b - a)) {
    const hit = addressOnDate(asc, `${y}-01-01`);
    if (hit) marks.set(hit.id, [...(marks.get(hit.id) ?? []), `${reiwaShort(y)}（${y}/1/1）`]);
  }
  return asc
    .map((a, i) => ({
      id: a.id,
      from: a.moved_on,
      to: asc[i + 1] ? dayBefore(asc[i + 1].moved_on) : null,
      address: a.address,
      marks: marks.get(a.id) ?? [],
    }))
    .reverse();
}

export function periodLabel(p: Pick<AddressPeriod, "from" | "to">): string {
  return `${ymdSlash(p.from)}〜${p.to ? ymdSlash(p.to) : "現在"}`;
}

// 生年月日（西暦）: 1995年3月8日
export function birthSeireki(birth: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth ?? "");
  return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : "";
}

export function birthWareki(birth: string | null | undefined): string {
  return warekiDate(birth ?? null);
}

export interface PersonCopySource {
  name: string;
  kana: string;
  birth: string | null;
  address: string; // 現在の住所
  postal?: string; // 現在の住所の郵便番号（見つかったとき）
}

// 「まとめてコピー」の文（氏名・フリガナ・生年月日・現在の住所・住所歴）
export function personCopyText(p: PersonCopySource, periods: AddressPeriod[]): string {
  const lines = [
    `氏名: ${p.name}`,
    p.kana ? `フリガナ: ${p.kana}` : "",
    p.birth ? `生年月日: ${birthSeireki(p.birth)}（${birthWareki(p.birth)}）` : "",
    p.address ? `現在の住所: ${p.postal ? `〒${p.postal} ` : ""}${p.address}` : "",
  ].filter(Boolean);
  if (periods.length > 0) {
    lines.push("住所歴:");
    for (const r of periods) {
      lines.push(`  ${periodLabel(r)} ${r.address}${r.marks.length ? `（${r.marks.join("・")}の住所）` : ""}`);
    }
  }
  return lines.join("\n");
}
