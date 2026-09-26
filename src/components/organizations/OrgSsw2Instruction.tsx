"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { dbErrorMessage } from "@/lib/errors";
import {
  SSW2_DUTY_FIELDS,
  SSW2_INSTRUCTEE_DEFAULT_FIELDS,
  type OrgSsw2Duties,
} from "@/lib/org-ssw2-duties";
import { updateOrganizationSsw2Duties } from "@/lib/supabase/queries/organizations";
import { SSW2_PLEDGE_GUIDE_HREF } from "@/lib/ssw2-pledge-guide";
import {
  isSsw2Holder,
  orgSsw2Field,
  requiredInstructeeCount,
  ssw2ApplicantIds,
  ssw2Capacity,
  ssw2PrepOrganizationId,
  type InstructeeCandidateWorker,
  type Ssw2Applicant,
} from "@/lib/ssw2-instructees";
import {
  listSsw2InstructionLinks,
  listSsw2PrepWorkerIds,
  type Ssw2InstructionLink,
} from "@/lib/supabase/queries/ssw2-instructees";

// 所属機関の画面に出す「特定技能２号の指導体制」。
//  ・誰が誰の指導対象になっているかを一覧で見せる（在籍者ごとにも出す）
//  ・この機関があと何人２号を受け入れられるかを出す
// 入力そのものは、各人の申請準備（準備の内容＝特定技能2号申請準備中）で行う。
const DUTY_INPUT =
  "min-h-[34px] w-full rounded-lg border border-border bg-background px-2 text-xs focus:border-brand focus:outline-none disabled:opacity-60";

export function OrgSsw2Instruction({
  organizationId,
  duties: initialDuties,
  canEdit = false,
}: {
  organizationId: string;
  duties: OrgSsw2Duties;
  canEdit?: boolean;
}) {
  // 誓約書の「１ 業務内容」。この会社に一度登録しておけば、２号の申請のたびに自動で入る
  const [duties, setDuties] = useState<OrgSsw2Duties>(initialDuties);
  const [dutiesBusy, setDutiesBusy] = useState(false);
  const [dutiesSaved, setDutiesSaved] = useState(false);
  const [dutiesError, setDutiesError] = useState<string | null>(null);

  const saveDuties = async (next: OrgSsw2Duties) => {
    setDutiesBusy(true);
    setDutiesError(null);
    try {
      await updateOrganizationSsw2Duties(createClient(), organizationId, next);
      setDutiesSaved(true);
    } catch (err) {
      setDutiesError(dbErrorMessage(err, "0123_org_ssw2_duties.sql", "保存に失敗しました"));
    } finally {
      setDutiesBusy(false);
    }
  };

  const [workers, setWorkers] = useState<InstructeeCandidateWorker[]>([]);
  const [links, setLinks] = useState<Ssw2InstructionLink[]>([]);
  // 申請種別（app_content）が2号の準備リストがある外国人
  const [prepWorkerIds, setPrepWorkerIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      listSsw2InstructionLinks(supabase),
      supabase
        .from("workers")
        .select(
          "id, name, status, field, residence_status, residence_card_no, current_situation, current_organization_id, application_prep_organization_id",
        ),
      listSsw2PrepWorkerIds(supabase),
    ])
      .then(([linkRows, res, prepIds]) => {
        if (cancelled) return;
        if (res.error) throw res.error;
        setLinks(linkRows);
        setPrepWorkerIds(prepIds);
        setWorkers((res.data as InstructeeCandidateWorker[] | null) ?? []);
        setLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(dbErrorMessage(err, "0120_ssw2_instructees.sql", "指導体制を読み込めませんでした"));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // この機関に在籍している外国人
  const members = workers.filter(
    (w) => w.current_organization_id === organizationId && w.status !== "退職",
  );
  const field = orgSsw2Field(members);

  // いま2号の準備をしている人（全体）。申請準備の画面と同じく申請種別で見る。
  // 許可が出てすでに2号になった人は、指導する側なので準備中には数えない
  const allApplicantIds = ssw2ApplicantIds(workers, {
    prepWorkerIds,
    linkedApplicantIds: links.map((l) => l.applicantId),
  });
  // そのうち、この機関で申請する人（転職先で申請するときは申請準備の所属機関を見る）
  const applicants: (Ssw2Applicant & { transferring: boolean })[] = workers
    .filter((w) => allApplicantIds.has(w.id) && ssw2PrepOrganizationId(w) === organizationId)
    .map((w) => ({
      workerId: w.id,
      name: w.name,
      field: (w.field ?? "").trim(),
      instructeeCount: links.filter((l) => l.applicantId === w.id).length,
      // いまは別の機関に在籍していて、転職先のこの機関で申請する人
      transferring: w.current_organization_id !== organizationId,
    }));

  // すでに誰かの対象者になっている人（会社をまたいで見る）
  const takenBy = new Map<string, string>();
  for (const l of links) if (l.targetWorkerId) takenBy.set(l.targetWorkerId, l.applicantName);

  // この機関で2号を申請する人（在籍者でない、転職してくる人も含む）
  const applicantIds = new Set(applicants.map((a) => a.workerId));
  // まだ誰の対象者にもなっていない、この機関の在籍者（2号申請者本人は、どこで申請する人も数えない）
  // すでに特定技能2号の人は指導する側なので、対象者の候補には数えない
  const freeMembers = members.filter(
    (w) => !takenBy.has(w.id) && !allApplicantIds.has(w.id) && !isSsw2Holder(w.residence_status),
  );

  const cap = ssw2Capacity({ field, applicants, free: freeMembers.length });

  if (!loaded) return null;

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
        <GraduationCap size={16} />
        特定技能２号の指導体制
      </h2>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">
        ２号の申請には、誓約書（参考様式第１－３２号）に「指導を受ける対象者」を書きます。
        同じ人を2人以上の２号申請者の対象者にすることはできないので、この機関で何人まで
        受け入れられるかが決まります。対象者の登録は、各人の
        <span className="font-bold">申請準備 ＞ 準備の内容「在留資格の変更許可（特定技能２号）※本人申請」</span>
        から行います。
        <Link href={SSW2_PLEDGE_GUIDE_HREF} className="ml-1 font-bold text-brand underline">
          誓約書（1-32号）の作り方の案内 →
        </Link>
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          {error}
        </p>
      )}

      {/* 誓約書の「１ 業務内容」。この会社に一度登録しておけば、２号の申請のたびに自動で入る */}
      <div className="mb-3 rounded-xl border border-border p-3">
        <p className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
          １　当該２号特定技能外国人の業務内容
          <Link
            href={`/organizations/${organizationId}/ssw2-interview`}
            className="flex items-center gap-1 rounded-lg border border-brand px-2.5 py-1 text-[11px] font-bold text-brand"
          >
            <ClipboardList size={12} />
            聞き取りの質問票を印刷
          </Link>
        </p>
        <p className="mb-2 text-[11px] leading-relaxed text-muted">
          この会社で２号を申請するときに出す誓約書の欄です。一度入れておけば、同じ会社で申請する
          たびに誓約書に貼る文章へ自動で入ります。会社に聞かないと分からないときは、右の質問票を印刷して
          そのまま聞いてください。在留諸申請の許否に大きく影響するため、具体的に書きます。
        </p>
        {dutiesError && (
          <p role="alert" className="mb-2 rounded-lg bg-seal/10 px-2 py-1.5 text-[11px] text-seal">
            {dutiesError}
          </p>
        )}
        <div className="flex flex-col gap-2">
          {SSW2_DUTY_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-0.5 block text-[11px] font-bold text-muted">
                {f.no} {f.label}
              </span>
              {f.multiline ? (
                <textarea
                  rows={3}
                  value={duties[f.key]}
                  disabled={!canEdit || dutiesBusy}
                  onChange={(e) => {
                    setDuties({ ...duties, [f.key]: e.target.value });
                    setDutiesSaved(false);
                  }}
                  onBlur={() => void saveDuties(duties)}
                  className={`${DUTY_INPUT} min-h-[72px] py-1.5 leading-relaxed`}
                />
              ) : (
                <input
                  value={duties[f.key]}
                  disabled={!canEdit || dutiesBusy}
                  onChange={(e) => {
                    setDuties({ ...duties, [f.key]: e.target.value });
                    setDutiesSaved(false);
                  }}
                  onBlur={() => void saveDuties(duties)}
                  className={DUTY_INPUT}
                />
              )}
              {f.hint && <span className="mt-0.5 block text-[11px] text-muted">{f.hint}</span>}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          {dutiesBusy
            ? "保存中…"
            : dutiesSaved
              ? "保存しました。"
              : "欄から離れると保存されます。"}
        </p>
      </div>

      {/* 誓約書の「２ 指導を受ける対象者一覧」の共通の内容。対象者が全員同じなら、ここに一度入れれば自動で入る */}
      <div className="mb-3 rounded-xl border border-border p-3">
        <p className="mb-1 text-xs font-bold">２　指導を受ける対象者の共通の内容</p>
        <p className="mb-2 text-[11px] leading-relaxed text-muted">
          対象者が全員同じ事業所・役職・職務内容なら、ここに一度入れておけば、各人の申請準備で
          対象者を足したときと、誓約書に貼る文章に自動で入ります。対象者ごとに違うときは、
          申請準備の「指導を受ける対象者」でその人の欄を直してください（そちらが優先されます）。
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SSW2_INSTRUCTEE_DEFAULT_FIELDS.map((f) => (
            <label key={f.key} className={`block ${f.key === "instructee_duties" ? "sm:col-span-2" : ""}`}>
              <span className="mb-0.5 block text-[11px] font-bold text-muted">{f.label}</span>
              <input
                value={duties[f.key]}
                disabled={!canEdit || dutiesBusy}
                placeholder={f.placeholder}
                onChange={(e) => {
                  setDuties({ ...duties, [f.key]: e.target.value });
                  setDutiesSaved(false);
                }}
                onBlur={() => void saveDuties(duties)}
                className={DUTY_INPUT}
              />
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          {dutiesBusy
            ? "保存中…"
            : dutiesSaved
              ? "保存しました。"
              : "欄から離れると保存されます。"}
        </p>
      </div>

      {/* 受け入れ可能人数 */}
      <div className="mb-3 rounded-xl border border-border p-3">
        <p className="mb-1.5 text-xs font-bold">あと何人２号を受け入れられるか</p>
        {cap.required === 0 ? (
          <p className="text-[11px] leading-relaxed text-muted">
            {field
              ? `この機関の分野（${field}）は、様式に必要な対象者数の記載がありません。対象者が不在でも差し支えない分野です（在籍する場合は必ず記載します）。`
              : "在籍者の特定産業分野が未登録のため、必要な対象者数を判定できません。外国人詳細の「特定産業分野・職種」を登録すると出ます。"}
          </p>
        ) : (
          <>
            <p
              className={`text-sm font-bold ${cap.more === 0 ? "text-seal" : "text-brand"}`}
            >
              {cap.more === 0
                ? "いまの人数では、これ以上受け入れられません"
                : `あと ${cap.more} 名まで受け入れられます`}
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5 text-[11px] leading-relaxed text-muted">
              <li>
                分野: {field}（２号1人あたり <span className="font-bold">{cap.required}名以上</span> の対象者が必要）
              </li>
              <li>いま２号の準備をしている人: {cap.applicants}名</li>
              <li>
                対象者に選べる在籍者（まだ誰にも紐づいていない人）:{" "}
                <span className="font-bold">{cap.free}名</span>
              </li>
              {cap.shortage > 0 && (
                <li className="font-bold text-seal">
                  準備中の人の対象者が、あと {cap.shortage}名 足りていません
                </li>
              )}
            </ul>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              ほかの所属機関の方や、登録の無い日本人従業員を対象者にする場合は、この人数に
              含まれていません。実際にはもう少し受け入れられることがあります。
            </p>
          </>
        )}
      </div>

      {/* 誰が誰を指導するか */}
      <p className="mb-1.5 text-xs font-bold">２号申請者ごとの指導対象者</p>
      {applicants.length === 0 ? (
        <p className="mb-3 text-[11px] text-muted">
          この機関には、いま２号の準備をしている方がいません。
        </p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {applicants.map((a) => {
            const mine = links.filter((l) => l.applicantId === a.workerId);
            const need = requiredInstructeeCount(a.field || field);
            const short = Math.max(0, need - mine.length);
            return (
              <li key={a.workerId} className="rounded-lg border border-border p-2">
                <p className="text-xs font-bold">
                  <Link href={`/workers/${a.workerId}`} className="text-brand underline">
                    {a.name}
                  </Link>
                  {a.transferring && (
                    <span className="ml-1.5 rounded border border-brand/40 bg-brand/10 px-1 py-0.5 text-[10px] text-brand">
                      転職してこの機関で申請
                    </span>
                  )}
                  <span className="ml-1.5 font-normal text-muted">
                    {a.field || field}
                    {need > 0 ? `・${need}名以上必要` : "・人数の決まりなし"}
                  </span>
                </p>
                {mine.length === 0 ? (
                  <p className="mt-1 text-[11px] text-seal">対象者がまだ登録されていません。</p>
                ) : (
                  <ol className="mt-1 flex flex-col gap-0.5 text-[11px] text-muted">
                    {mine.map((l, i) => (
                      <li key={`${l.applicantId}-${i}`}>
                        {i + 1}. {l.targetName || "（氏名未入力）"}
                        {l.targetWorkerId ? "" : "（登録の無い方・手入力）"}
                        {(l.office || duties.instructee_office) ? ` ／ ${l.office || duties.instructee_office}` : ""}
                      </li>
                    ))}
                  </ol>
                )}
                {short > 0 && (
                  <p className="mt-1 text-[11px] font-bold text-seal">あと {short}名 足してください。</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 在籍者ごとの状況（誰の指導として登録されているか） */}
      <p className="mb-1.5 text-xs font-bold">在籍者ごとの状況</p>
      {members.length === 0 ? (
        <p className="text-[11px] text-muted">在籍中の外国人がいません。</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {members.map((w) => {
            const by = takenBy.get(w.id);
            const isApplicant = allApplicantIds.has(w.id);
            return (
              <li key={w.id} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <Link href={`/workers/${w.id}`} className="font-bold text-brand underline">
                  {w.name}
                </Link>
                {isApplicant ? (
                  <span className="rounded border border-brand/40 bg-brand/10 px-1.5 py-0.5 font-bold text-brand">
                    {applicantIds.has(w.id) ? "２号の申請準備中" : "２号の申請準備中（転職先で申請）"}
                  </span>
                ) : isSsw2Holder(w.residence_status) ? (
                  <span className="rounded border border-border bg-background px-1.5 py-0.5 font-bold text-muted">
                    特定技能２号（指導する側）
                  </span>
                ) : by ? (
                  <span className="rounded border border-seal/40 bg-seal/10 px-1.5 py-0.5 font-bold text-seal">
                    {by}さんの指導対象者
                  </span>
                ) : (
                  <span className="rounded border border-border px-1.5 py-0.5 text-muted">
                    空き（対象者にできます）
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
