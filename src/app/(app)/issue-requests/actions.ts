"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { dbErrorMessage } from "@/lib/errors";
import { doneStatusFor, requestStatusFor, type IssueRequestKind } from "@/lib/issue-requests";
import { followupsOf, patchFollowups } from "@/lib/worker-followups";
import { todayStr } from "@/lib/application-alerts";

interface Err {
  ok: false;
  message: string;
}

async function requireStaff(): Promise<boolean> {
  const me = await getMyProfile();
  return !!me && me.role !== "viewer";
}

export interface IssueRequestTarget {
  kind: IssueRequestKind;
  checklistId: string; // 書類のとき。手続きは "followup"
  docId: string; // 書類ID、または "moving" / "movein" / "kokuho"
  workerId: string;
  status: string; // いまの準備状況（依頼中に戻すときに使う）
}

// 依頼中 ⇄ 完了 の切り替え。
// 書類: prep_doc_statuses の status を、その書類の完了扱い／依頼中の選択肢にする
// 手続き: followups の転出（status）・転入（movein_status）・国保加入（両方の加入済み）を切り替える
export async function setIssueRequestDone(
  target: IssueRequestTarget,
  done: boolean,
): Promise<{ ok: true; status: string } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };

  if (target.kind === "doc") {
    const status = done ? doneStatusFor(target.docId) : requestStatusFor(target.docId, target.status);
    if (!status) return { ok: false, message: "この書類には切り替えられる準備状況がありません" };
    const { error } = await admin
      .from("prep_doc_statuses")
      .update({ status })
      .eq("checklist_id", target.checklistId)
      .eq("doc_id", target.docId);
    if (error) return { ok: false, message: dbErrorMessage(error, "0045_prep_doc_statuses.sql") };
    return { ok: true, status };
  }

  const { data, error: readErr } = await admin
    .from("workers")
    .select("followups")
    .eq("id", target.workerId)
    .maybeSingle();
  if (readErr) return { ok: false, message: dbErrorMessage(readErr, "0119_worker_followups.sql") };
  const current = followupsOf(data as { followups?: unknown } | null);
  const next =
    target.docId === "moving"
      ? patchFollowups(current, { moving: { status: done ? "完了" : "依頼中" } })
      : target.docId === "movein"
        ? patchFollowups(current, { moving: { movein_status: done ? "完了" : "依頼中" } })
        : patchFollowups(current, {
            kokuho: done
              ? { kokuho_done: true, nenkin_done: true, docs_ready_on: current.kokuho.docs_ready_on ?? todayStr() }
              : { kokuho_done: false, nenkin_done: false },
          });
  const { error } = await admin.from("workers").update({ followups: next }).eq("id", target.workerId);
  if (error) return { ok: false, message: dbErrorMessage(error, "0119_worker_followups.sql") };
  return { ok: true, status: done ? "完了" : "依頼中" };
}

// 依頼中のメモの保存。書類は prep_doc_statuses.memo（0161）、手続きは followups の note
export async function saveIssueRequestMemo(
  target: IssueRequestTarget,
  memo: string,
): Promise<{ ok: true } | Err> {
  if (!(await requireStaff())) return { ok: false, message: "権限がありません" };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "サーバー設定エラー" };
  const text = memo.trim();

  if (target.kind === "doc") {
    const { error } = await admin
      .from("prep_doc_statuses")
      .update({ memo: text })
      .eq("checklist_id", target.checklistId)
      .eq("doc_id", target.docId);
    if (error) return { ok: false, message: dbErrorMessage(error, "0161_prep_doc_status_memo.sql") };
    return { ok: true };
  }

  const { data, error: readErr } = await admin
    .from("workers")
    .select("followups")
    .eq("id", target.workerId)
    .maybeSingle();
  if (readErr) return { ok: false, message: dbErrorMessage(readErr, "0119_worker_followups.sql") };
  const current = followupsOf(data as { followups?: unknown } | null);
  const next =
    target.docId === "kokuho"
      ? patchFollowups(current, { kokuho: { note: text } })
      : patchFollowups(current, { moving: { note: text } });
  const { error } = await admin.from("workers").update({ followups: next }).eq("id", target.workerId);
  if (error) return { ok: false, message: dbErrorMessage(error, "0119_worker_followups.sql") };
  return { ok: true };
}
