"use server";

import { createClient } from "@/lib/supabase/server";
import { getMyProfile } from "@/lib/supabase/queries/profiles";
import { upsertWageReply } from "@/lib/supabase/queries/wage-replies";
import { dbErrorMessage } from "@/lib/errors";
import {
  WAGE_REPLY_STATUSES,
  type OrganizationWageReply,
  type OrganizationWageReplyInput,
} from "@/lib/wage-stats";

interface Err {
  ok: false;
  message: string;
}

const MIGRATION = "0181_organization_wage_replies.sql";

function cleanInput(input: OrganizationWageReplyInput): OrganizationWageReplyInput | string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effective_on)) return "改定の適用日が正しくありません";
  if (!WAGE_REPLY_STATUSES.includes(input.status)) return "状況の値が正しくありません";
  const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const yen = (v: number | null) => (v != null && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
  return {
    organization_id: input.organization_id,
    effective_on: input.effective_on,
    status: input.status,
    sent_on: date(input.sent_on),
    replied_on: date(input.replied_on),
    hourly_ssw1: yen(input.hourly_ssw1),
    hourly_ssw2: yen(input.hourly_ssw2),
    note: (input.note ?? "").trim(),
  };
}

// 回答の記録を1件保存する（機関×改定の適用日で1行）
export async function saveWageReply(
  input: OrganizationWageReplyInput,
): Promise<{ ok: true; reply: OrganizationWageReply } | Err> {
  const me = await getMyProfile();
  if (!me || me.role === "viewer") return { ok: false, message: "権限がありません" };
  const cleaned = cleanInput(input);
  if (typeof cleaned === "string") return { ok: false, message: cleaned };
  try {
    const supabase = await createClient();
    const reply = await upsertWageReply(supabase, cleaned);
    return { ok: true, reply };
  } catch (err) {
    return { ok: false, message: dbErrorMessage(err, MIGRATION, "回答の記録の保存に失敗しました") };
  }
}

// まとめて保存（未送付の機関をまとめて「送付済」にする など）
export async function saveWageReplies(
  inputs: OrganizationWageReplyInput[],
): Promise<{ ok: true; replies: OrganizationWageReply[] } | Err> {
  const me = await getMyProfile();
  if (!me || me.role === "viewer") return { ok: false, message: "権限がありません" };
  const replies: OrganizationWageReply[] = [];
  try {
    const supabase = await createClient();
    for (const input of inputs) {
      const cleaned = cleanInput(input);
      if (typeof cleaned === "string") return { ok: false, message: cleaned };
      replies.push(await upsertWageReply(supabase, cleaned));
    }
    return { ok: true, replies };
  } catch (err) {
    return { ok: false, message: dbErrorMessage(err, MIGRATION, "回答の記録の保存に失敗しました") };
  }
}
