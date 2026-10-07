"use client";

import { useState } from "react";
import { ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { STAFF_ROLE_LABELS, type Profile, type StaffRole } from "@/types/db";
import { inviteUser, resetUserMfa } from "./actions";

const ROLE_OPTIONS: StaffRole[] = ["admin", "staff", "viewer"];

export function UsersAdmin({
  profiles,
  myId,
  mfaEnrolled,
}: {
  profiles: Profile[];
  myId: string;
  // 職員ごとの認証アプリ（二段階認証）の登録状況。true=登録済み、false=未登録、無ければ不明
  mfaEnrolled: Record<string, boolean | null>;
}) {
  const [rows, setRows] = useState(profiles);
  const [mfa, setMfa] = useState(mfaEnrolled);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<StaffRole>("staff");
  const [inviting, setInviting] = useState(false);

  const patchRow = async (id: string, patch: Partial<Pick<Profile, "role" | "is_active">>) => {
    const prev = rows;
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await createClient().from("profiles").update(patch).eq("id", id);
    if (error) {
      setRows(prev);
      setNotice({ ok: false, message: `更新に失敗しました: ${error.message}` });
    } else {
      setNotice({ ok: true, message: "更新しました" });
    }
  };

  const onResetMfa = async (p: Profile) => {
    if (
      !confirm(
        `${p.display_name || p.email} さんの認証アプリの登録を解除しますか？\n解除すると、次のログインで認証アプリを登録し直す画面になります。`,
      )
    )
      return;
    setResettingId(p.id);
    const result = await resetUserMfa(p.id);
    setResettingId(null);
    setNotice(result);
    if (result.ok) setMfa((prev) => ({ ...prev, [p.id]: false }));
  };

  const onInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    const result = await inviteUser(inviteEmail, inviteRole);
    setInviting(false);
    setNotice(result);
    if (result.ok) setInviteEmail("");
  };

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${
            notice.ok ? "bg-brand/10 text-brand" : "bg-seal/10 text-seal"
          }`}
        >
          {notice.message}
        </p>
      )}

      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <UserPlus size={16} />
          職員を招待
        </h2>
        <form onSubmit={onInvite} className="flex flex-col gap-2.5">
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="メールアドレス"
            className="min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm"
          />
          <div className="flex gap-2">
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as StaffRole)}
              className="min-h-[44px] flex-1 rounded-xl border border-border bg-background px-3 text-sm"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {STAFF_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="min-h-[44px] rounded-xl bg-brand px-5 text-sm font-bold text-brand-foreground disabled:opacity-60"
            >
              {inviting ? "送信中…" : "招待"}
            </button>
          </div>
          <p className="text-xs text-muted">
            招待メールのリンクからパスワードを設定するとログインできるようになります。
          </p>
        </form>
      </Card>

      <div className="flex flex-col gap-2.5">
        {rows.map((p) => {
          const isMe = p.id === myId;
          return (
            <Card key={p.id} className={`p-4 ${p.is_active ? "" : "opacity-60"}`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{p.display_name || p.email}</p>
                  <p className="truncate text-xs text-muted">
                    {p.email}
                    {isMe && "（自分）"}
                  </p>
                </div>
                {!p.is_active && (
                  <span className="shrink-0 rounded-full bg-seal/10 px-2.5 py-1 text-xs font-bold text-seal">
                    無効
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={p.role}
                  disabled={isMe}
                  onChange={(e) => patchRow(p.id, { role: e.target.value as StaffRole })}
                  className="min-h-[40px] flex-1 rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {STAFF_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isMe}
                  onClick={() => patchRow(p.id, { is_active: !p.is_active })}
                  className="min-h-[40px] rounded-xl border border-border px-4 text-sm font-bold disabled:opacity-60"
                >
                  {p.is_active ? "無効化" : "有効化"}
                </button>
              </div>
              {/* 二段階認証（認証アプリ）の登録状況と解除 */}
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                {mfa[p.id] === true ? (
                  <span className="flex items-center gap-1 text-brand">
                    <ShieldCheck size={14} />
                    二段階認証：登録済み
                  </span>
                ) : mfa[p.id] === false ? (
                  <span className="flex items-center gap-1 text-seal">
                    <ShieldOff size={14} />
                    二段階認証：未登録（次のログインで登録）
                  </span>
                ) : (
                  <span className="text-muted">二段階認証：登録状況を取得できません</span>
                )}
                {mfa[p.id] === true && !isMe && (
                  <button
                    type="button"
                    disabled={resettingId === p.id}
                    onClick={() => onResetMfa(p)}
                    className="shrink-0 rounded-lg border border-border px-2.5 py-1 font-bold disabled:opacity-60"
                  >
                    {resettingId === p.id ? "解除中…" : "認証アプリを解除"}
                  </button>
                )}
              </div>
              {isMe && (
                <p className="mt-2 text-xs text-muted">
                  自分自身のロール変更・無効化・認証アプリの解除はできません（誤操作防止）。
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
