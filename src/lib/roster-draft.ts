import {
  rosterJpDate,
  rosterWorkKind,
  withResidencePermitHistory,
  withVisaPermitHistory,
  type RosterPermit,
} from "@/lib/roster";
import type { RosterHistoryEntry, RosterPreviousJob, WorkerRoster } from "@/types/db";

// 労働者名簿の中身を「外国人の登録データ」から組み立てる。
//
// 労働者名簿の画面（/workers/[id]/roster）と、入社書類の「作成」で添付するPDFは
// 同じ内容にしたいので、その元になる値をここで1か所にまとめている。
// すでにその会社の名簿を保存してあるときは、保存した内容を優先する。

export interface RosterDraft {
  company_name: string; // 送付先の会社名
  work_kind: string; // 業務の種類
  history: RosterHistoryEntry[];
  previous_jobs: RosterPreviousJob[];
  leaving_on: string; // 表示用の文字列（例: 2026年8月20日）
  leaving_reason: string;
  issued_on: string; // 発行年月日（YYYY-MM-DD）
  employment_start: string; // 雇用開始年月日の表示文字（例: 2026年7月31日。空欄のままでもよい）
}

// 職歴のうち、名簿の「前職」に出すもの（終了済み・会社名あり）を開始日の古い順に
export function rosterPreviousJobs(
  histories: { start_date: string; end_date: string | null; org_name: string; prefecture?: string }[],
): RosterPreviousJob[] {
  return [...histories]
    .filter((h) => h.end_date !== null && h.org_name)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
    .map((h) => ({ company: h.org_name, prefecture: h.prefecture ?? "" }));
}

export interface RosterDraftSource {
  orgName: string; // 現在の所属機関の名称
  field: string; // 分野（業務の種類の初期値に使う）
  employmentStartOn: string | null; // その会社の雇用開始日（YYYY-MM-DD）
  residenceStatus: string;
  residencePermitDate: string | null;
  status: string; // 在籍中／退職 など
  leavingOn: string | null;
  leavingKind: string;
  leavingReason: string;
  workHistories: {
    start_date: string;
    end_date: string | null;
    org_name: string;
    prefecture?: string;
  }[];
  // その会社にいる間に受けた許可（在留資格の履歴から。あれば全部を履歴に載せる）
  permits?: RosterPermit[];
}

export function buildRosterDraft(
  src: RosterDraftSource,
  saved: WorkerRoster | null,
  today: string,
): RosterDraft {
  const start = src.employmentStartOn;
  return {
    company_name: saved?.company_name || src.orgName,
    work_kind: saved?.work_kind || rosterWorkKind(src.field),
    // 入社の行に加えて、在留資格の許可も履歴として残す（画面の労働者名簿と同じ）。
    // その会社にいる間の許可が分かっていれば全部（更新のたびの許可も）載せ、無ければ今の許可だけ
    history: src.permits && src.permits.length > 0
      ? withVisaPermitHistory(
          saved?.history ?? (start ? [{ on: rosterJpDate(start), content: "入社" }] : []),
          src.permits,
        )
      : withResidencePermitHistory(
          saved?.history ?? (start ? [{ on: rosterJpDate(start), content: "入社" }] : []),
          src.residenceStatus,
          src.residencePermitDate,
        ),
    previous_jobs: saved?.previous_jobs ?? rosterPreviousJobs(src.workHistories),
    leaving_on: saved?.leaving_on ?? (src.status === "退職" ? rosterJpDate(src.leavingOn) : ""),
    leaving_reason:
      saved?.leaving_reason ??
      (src.status === "退職"
        ? [src.leavingKind, src.leavingReason].filter(Boolean).join("・")
        : ""),
    issued_on: saved?.issued_on ?? start ?? today,
    // 名簿で直した雇用開始年月日があればそれ（空欄もそのまま）。無ければ登録データの日付
    employment_start: saved?.employment_start ?? rosterJpDate(start),
  };
}
