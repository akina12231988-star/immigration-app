// 帳簿の日付の並びの自動訂正の計画。
//
// 「日付の流れがおかしい応募」を、決まったルールで最小限に直す案を組み立てる。
// ここでは案を作るだけで、保存はしない（画面で内容を確かめてから適用する）。
//
// ルール（訂正の考え方）:
// 1) 採用年月日が紹介年月日より1年近く前 → 年の入れ違いとみなして採用年月日を1年あとへ
//    （例: 2025-05-14 → 2026-05-14。紹介 2026-05-10 と自然につながる）
// 2) 採用年月日が紹介年月日より少し前（300日以内） → 紹介は採用と同日以前のはずなので、
//    紹介年月日を採用年月日まで前へ動かす
// 3) 求人受付年月日がその求人のいちばん早い紹介年月日より後 → いちばん早い紹介年月日に合わせる
// 4) 求職受付日がその人のいちばん早い紹介年月日より後 → いちばん早い紹介年月日に合わせる
//
// 雇用条件書・雇用契約・雇用開始日の指摘は、契約書類の実物に合わせるべきものなので
// 自動では直さない（画面で「手で直す」案内を出す）。

export interface LedgerFixInputRow {
  id: string; // 応募ID
  workerId: string;
  workerName: string;
  company: string; // 応募先の表示名
  postingId: string | null;
  postingReceivedOn: string | null; // 求人受付年月日
  jobseekerAcceptedOn: string | null; // 求職受付日
  appliedOn: string; // 紹介年月日
  resultOn: string | null; // 採用年月日
  result: string;
}

export interface LedgerFixChange {
  target: "応募" | "求人" | "求職受付";
  id: string; // 応募ID / 求人ID / 外国人ID
  who: string; // 表示名（人名・会社名）
  field: "applied_on" | "result_on" | "received_on" | "jobseeker_accepted_on";
  fieldLabel: string;
  from: string;
  to: string;
  reason: string;
}

export interface LedgerFixPlan {
  changes: LedgerFixChange[];
  applicationPatches: Map<string, { applied_on?: string; result_on?: string }>;
  postingPatches: Map<string, string>; // 求人ID → received_on
  workerPatches: Map<string, string>; // 外国人ID → jobseeker_accepted_on
  unresolved: string[]; // 自動では直せなかった指摘（手で直してもらう）
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

// 1年あとの同じ月日（2/29しか無いときは2/28）
function addOneYear(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const y = Number(m[1]) + 1;
  if (m[2] === "02" && m[3] === "29") return `${y}-02-28`;
  return `${y}-${m[2]}-${m[3]}`;
}

export function planLedgerDateFixes(rows: LedgerFixInputRow[]): LedgerFixPlan {
  const changes: LedgerFixChange[] = [];
  const applicationPatches = new Map<string, { applied_on?: string; result_on?: string }>();
  const postingPatches = new Map<string, string>();
  const workerPatches = new Map<string, string>();
  const unresolved: string[] = [];

  // 訂正後の紹介年月日（応募ID → 日付）。受付日の訂正はこの値をもとに決める
  const appliedAfter = new Map<string, string>();

  for (const r of rows) {
    let applied = r.appliedOn;
    const resultOn = r.resultOn ?? "";

    // ルール1・2: 採用年月日が紹介年月日より前
    if (r.result === "採用" && resultOn && applied && resultOn < applied) {
      const gap = daysBetween(resultOn, applied);
      const bumped = addOneYear(resultOn);
      if (gap > 300 && bumped >= applied) {
        applicationPatches.set(r.id, { ...applicationPatches.get(r.id), result_on: bumped });
        changes.push({
          target: "応募",
          id: r.id,
          who: r.workerName,
          field: "result_on",
          fieldLabel: "採用年月日",
          from: resultOn,
          to: bumped,
          reason: "年の入れ違いとみなして1年あとに直す",
        });
      } else if (gap <= 300) {
        applied = resultOn;
        applicationPatches.set(r.id, { ...applicationPatches.get(r.id), applied_on: applied });
        changes.push({
          target: "応募",
          id: r.id,
          who: r.workerName,
          field: "applied_on",
          fieldLabel: "紹介年月日",
          from: r.appliedOn,
          to: applied,
          reason: "紹介は採用と同日以前のはずなので、採用年月日に合わせる",
        });
      } else {
        unresolved.push(
          `${r.workerName}: 採用年月日（${resultOn}）と紹介年月日（${applied}）が離れすぎていて自動では直せません`,
        );
      }
    }

    appliedAfter.set(r.id, applied);
  }

  // ルール3: 求人受付年月日は、その求人のいちばん早い紹介年月日以前になる
  const postingMin = new Map<string, { min: string; receivedOn: string; company: string }>();
  for (const r of rows) {
    if (!r.postingId || !r.postingReceivedOn) continue;
    const applied = appliedAfter.get(r.id) ?? r.appliedOn;
    if (!applied) continue;
    const cur = postingMin.get(r.postingId);
    if (!cur || applied < cur.min) {
      postingMin.set(r.postingId, {
        min: applied,
        receivedOn: r.postingReceivedOn,
        company: r.company,
      });
    }
  }
  for (const [postingId, p] of postingMin) {
    if (p.receivedOn <= p.min) continue;
    postingPatches.set(postingId, p.min);
    changes.push({
      target: "求人",
      id: postingId,
      who: p.company,
      field: "received_on",
      fieldLabel: "求人受付年月日",
      from: p.receivedOn,
      to: p.min,
      reason: "求人受付は紹介より前のはずなので、いちばん早い紹介年月日に合わせる",
    });
  }

  // ルール4: 求職受付日は、その人のいちばん早い紹介年月日以前になる
  const workerMin = new Map<string, { min: string; acceptedOn: string; name: string }>();
  for (const r of rows) {
    if (!r.jobseekerAcceptedOn) continue;
    const applied = appliedAfter.get(r.id) ?? r.appliedOn;
    if (!applied) continue;
    const cur = workerMin.get(r.workerId);
    if (!cur || applied < cur.min) {
      workerMin.set(r.workerId, {
        min: applied,
        acceptedOn: r.jobseekerAcceptedOn,
        name: r.workerName,
      });
    }
  }
  for (const [workerId, w] of workerMin) {
    if (w.acceptedOn <= w.min) continue;
    workerPatches.set(workerId, w.min);
    changes.push({
      target: "求職受付",
      id: workerId,
      who: w.name,
      field: "jobseeker_accepted_on",
      fieldLabel: "求職受付日",
      from: w.acceptedOn,
      to: w.min,
      reason: "求職受付は応募より前のはずなので、いちばん早い紹介年月日に合わせる",
    });
  }

  return { changes, applicationPatches, postingPatches, workerPatches, unresolved };
}
