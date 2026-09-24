"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ClipboardList, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { prepDetailHref } from "@/lib/application-prep";
import { ssw2DutiesMissing, withInstructeeDefaults, type OrgSsw2Duties } from "@/lib/org-ssw2-duties";
import { instructeeMissingFields, type Ssw2Instructee } from "@/lib/ssw2-instructees";
import { buildSsw2PledgeCopy, PLEDGE_NOTES, type PledgeCopyItem } from "@/lib/ssw2-pledge";
import { SSW2_PLEDGE_GUIDE_HREF } from "@/lib/ssw2-pledge-guide";

const INPUT =
  "min-h-[40px] w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-brand focus:outline-none";

// 「２号特定技能外国人の業務内容に関する誓約書」（参考様式第１－３２号）に貼り付ける文章。
// 入管の様式（Word）はそのまま使い、「様式のどの欄に・どの文章を」貼るかを並べて1欄ずつコピーする。
// 中身は登録済みの内容から自動で入る。足りないところは、どこで直すかを案内する。
export function Ssw2PledgeClient({
  workerId,
  workerName,
  residenceCardNo,
  orgId,
  orgName,
  orgAddress,
  authorName: initialAuthor,
  duties,
  instructees,
  today,
  canEdit,
}: {
  workerId: string;
  workerName: string;
  residenceCardNo: string;
  orgId: string | null;
  orgName: string;
  orgAddress: string;
  authorName: string;
  duties: OrgSsw2Duties;
  instructees: Ssw2Instructee[];
  today: string;
  canEdit: boolean;
}) {
  // 作成年月日と作成責任者だけは、この場で直せるようにする（貼るときだけの内容）
  const [filledOn, setFilledOn] = useState(today);
  const [authorName, setAuthorName] = useState(initialAuthor);

  const dutiesMissing = ssw2DutiesMissing(duties);
  const instructeeIssues = instructees
    .map((r) => ({
      name: r.name || "（氏名未入力）",
      missing: instructeeMissingFields(withInstructeeDefaults(r, duties)),
    }))
    .filter((r) => r.missing.length > 0);

  const sections = buildSsw2PledgeCopy({
    workerName,
    orgName,
    authorName,
    filledOn,
    duties,
    instructees,
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
          <ClipboardList size={16} />
          ２号特定技能外国人の業務内容に関する誓約書（参考様式第１－３２号）に貼る文章
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          入管の様式（Word）を開き、下の「貼る場所」の欄に、右のボタンでコピーした文章を貼り付けてください。
          登録してある内容がそのまま入ります。直したいところは、それぞれの登録画面で直してから
          この画面を開き直してください。作成年月日と作成責任者だけは、ここで直したものが出ます。
          <Link href={SSW2_PLEDGE_GUIDE_HREF} className="ml-1 font-bold text-brand underline">
            どこに何を入れるかの案内 →
          </Link>
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">作成年月日</span>
            <input
              type="date"
              value={filledOn}
              disabled={!canEdit}
              onChange={(e) => setFilledOn(e.target.value)}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-muted">作成責任者の氏名及び役職</span>
            <input
              value={authorName}
              disabled={!canEdit}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="例: 田中　輝久　代表取締役"
              className={INPUT}
            />
          </label>
        </div>
      </Card>

      {/* 登録が足りないところ（どこで直すか） */}
      {(dutiesMissing.length > 0 || instructees.length === 0 || instructeeIssues.length > 0 || !orgName) && (
        <Card className="space-y-1.5 p-4">
          <p className="text-xs font-bold">登録が足りないところ</p>
          {!orgName && (
            <Warn>
              所属機関が未設定です。
              <Link href={`/workers/${workerId}`} className="ml-1 font-bold underline">
                外国人詳細で設定する →
              </Link>
            </Warn>
          )}
          {dutiesMissing.length > 0 && (
            <Warn>
              １ 業務内容の{dutiesMissing.join("・")}が未登録です。
              {orgId && (
                <Link href={`/organizations/${orgId}`} className="ml-1 font-bold underline">
                  所属機関の情報で登録する →
                </Link>
              )}
            </Warn>
          )}
          {instructees.length === 0 && (
            <Warn>
              指導対象者が登録されていません。申請準備の詳細を開き、
              <span className="font-bold">申請種別</span>のすぐ下にある
              <span className="font-bold">「指導を受ける対象者」</span>で「対象者を足す」から選んでください。
              <Link href={prepDetailHref(workerId)} className="ml-1 font-bold underline">
                申請準備を開く →
              </Link>
            </Warn>
          )}
          {instructeeIssues.length > 0 && (
            <Warn>
              {instructeeIssues.map((r) => `${r.name}: ${r.missing.join("・")}`).join(" ／ ")}
              が空です。
              <Link href={prepDetailHref(workerId)} className="ml-1 font-bold underline">
                申請準備で直す →
              </Link>
            </Warn>
          )}
        </Card>
      )}

      {/* 様式の見出しごとに「貼る場所」と「貼る文章」 */}
      {sections.map((s) => (
        <Card key={s.title} className="p-4">
          <p className="mb-2 text-xs font-bold">{s.title}</p>
          {s.items.length === 0 ? (
            <p className="text-[11px] text-muted">貼る文章がありません。</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {s.items.map((item) => (
                <CopyRow key={item.where} item={item} />
              ))}
            </ul>
          )}
          {s.title.startsWith("２") && instructees.length > 5 && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              様式の枠は５行です。６人目からは、様式の表に行を足してから貼ってください（留意事項５）。
            </p>
          )}
        </Card>
      ))}

      {/* 確認用（外国人・所属機関の登録内容） */}
      <Card className="p-4">
        <p className="mb-2 text-xs font-bold">確認用</p>
        <Row label="２号特定技能外国人" value={workerName} />
        <Row label="在留カード番号" value={residenceCardNo} where={`/workers/${workerId}`} />
        <Row
          label="特定技能所属機関の氏名又は名称"
          value={orgName}
          where={orgId ? `/organizations/${orgId}` : undefined}
        />
        <Row label="所在地" value={orgAddress} where={orgId ? `/organizations/${orgId}` : undefined} />
        {orgId && (
          <p className="mt-1 text-[11px] text-muted">
            １ 業務内容は所属機関ごとに登録します。一度入れておけば、同じ会社で２号を申請するたびに
            自動で入ります（
            <Link href={`/organizations/${orgId}`} className="font-bold text-brand underline">
              所属機関の情報で直す →
            </Link>
            ）。
          </p>
        )}
      </Card>

      {/* 様式の留意事項（貼る前に確認する） */}
      <Card className="p-4">
        <p className="mb-1.5 text-xs font-bold">様式の留意事項</p>
        <ul className="flex flex-col gap-1 text-[11px] leading-relaxed text-muted">
          {PLEDGE_NOTES.slice(1).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// 1欄ぶん。「貼る場所」と「貼る文章」とコピーボタン
function CopyRow({ item }: { item: PledgeCopyItem }) {
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <p className="mb-1 text-[11px] font-bold text-muted">貼る場所: {item.where}</p>
      {item.value ? (
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 whitespace-pre-wrap break-words rounded-lg bg-background px-2 py-1.5 text-xs leading-relaxed">
            {item.value}
          </p>
          <CopyButton value={item.value} label={`${item.where}に貼る文章をコピー`} size={16} className="mt-1.5" />
        </div>
      ) : (
        !item.note && <p className="text-[11px] text-seal">未登録</p>
      )}
      {item.parts && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {item.parts.map((p) => (
            <span
              key={p.label}
              className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px]"
            >
              <span className="text-muted">{p.label}:</span>
              <span className="font-bold">{p.value}</span>
              <CopyButton value={p.value} label={`${p.label}をコピー`} size={12} />
            </span>
          ))}
        </div>
      )}
      {item.note && <p className="mt-1 text-[11px] text-muted">{item.note}</p>}
    </li>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-seal/40 bg-seal/10 px-2 py-1.5 text-[11px] leading-relaxed text-seal">
      <TriangleAlert size={12} className="mr-1 inline" />
      {children}
    </p>
  );
}

function Row({ label, value, where }: { label: string; value: string; where?: string }) {
  return (
    <p className="text-[11px] leading-relaxed">
      <span className="text-muted">{label}: </span>
      {value ? (
        <span className="font-bold">{value}</span>
      ) : where ? (
        <Link href={where} className="font-bold text-seal underline">
          未登録（登録する →）
        </Link>
      ) : (
        <span className="text-seal">未登録</span>
      )}
    </p>
  );
}
