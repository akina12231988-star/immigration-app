// 扶養控除等申告書（年末調整）の対象者の一覧。
//
// 外国人詳細で入力した扶養家族と送金の記録から、対象年（1月1日〜12月31日）の送金が目標額
// （30歳以上70歳未満は38万円以上、それ以外は1円以上）に達した扶養親族を抽出する。
// 年末調整用の申告書には達した人だけを記載し、入社時の申告書には全員を記載する。

import {
  isRemittanceAchieved,
  normalizeDependents,
  remittanceTarget,
  remittanceTotal,
} from "@/lib/dependents";
import type { WorkerDependent } from "@/types/db";

export interface FuyoRosterWorker {
  id: string;
  name: string;
  kana: string;
  birth: string | null;
  address: string;
  my_number: string;
  has_spouse: string;
  status: string;
  current_organization_id: string | null;
  dependents: unknown; // workers.dependents（jsonb）
}

export interface FuyoShortage {
  dependent: WorkerDependent;
  total: number; // 対象年の送金合計
  target: number; // 目標額
}

export interface FuyoRosterRow {
  worker: FuyoRosterWorker;
  dependents: WorkerDependent[]; // 登録されている扶養親族（全員）
  achieved: WorkerDependent[]; // 対象年の送金が目標額に達した人（年末調整用に記載する人）
  shortages: FuyoShortage[]; // 達していない人と不足
}

// 扶養家族が1人以上いる外国人を、対象年の送金の達成状況つきで並べる（氏名順）
export function buildFuyoRoster(workers: FuyoRosterWorker[], year: string, today: string): FuyoRosterRow[] {
  return workers
    .map((worker) => {
      const dependents = normalizeDependents(worker.dependents).filter((d) => d.name.trim());
      const achieved = dependents.filter((d) => isRemittanceAchieved(d, today, year));
      const shortages = dependents
        .filter((d) => !isRemittanceAchieved(d, today, year))
        .map((d) => ({ dependent: d, total: remittanceTotal(d.remittances, year), target: remittanceTarget(d, today) }));
      return { worker, dependents, achieved, shortages };
    })
    .filter((r) => r.dependents.length > 0)
    .sort((a, b) => a.worker.name.localeCompare(b.worker.name, "ja"));
}

// 申告書のファイル名（例: 扶養控除等申告書_年末調整時_2026_NGUYEN VAN A.pdf）
export function fuyoFileName(kind: "入社時" | "年末調整時", year: string, workerName: string): string {
  const safe = workerName.replace(/[\\/:*?"<>|]/g, "_").trim();
  return kind === "年末調整時" ? `扶養控除等申告書_年末調整時_${year}_${safe}.pdf` : `扶養控除等申告書_入社時_${safe}.pdf`;
}
