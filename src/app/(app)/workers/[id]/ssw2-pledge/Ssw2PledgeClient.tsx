"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, FileText, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { buildDocx } from "@/lib/docx-export";
import { downloadBlob } from "@/lib/xlsx-export";
import { prepDetailHref } from "@/lib/application-prep";
import {
  SSW2_DUTY_FIELDS,
  ssw2DutiesMissing,
  type OrgSsw2Duties,
} from "@/lib/org-ssw2-duties";
import { instructeeMissingFields, type Ssw2Instructee } from "@/lib/ssw2-instructees";
import { buildSsw2PledgeDoc, pledgeFileName, PLEDGE_NOTES } from "@/lib/ssw2-pledge";

const INPUT =
  "min-h-[40px] w-full rounded-lg border border-border bg-background px-2.5 text-sm focus:border-brand focus:outline-none";

// 「２号特定技能外国人の業務内容に関する誓約書」（参考様式第１－３２号）の出力ページ。
// 中身はすべて登録済みの内容から自動で入る。足りないところは、どこで直すかを案内する。
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
  // 作成年月日と作成責任者だけは、この場で直せるようにする（出すときだけの内容）
  const [filledOn, setFilledOn] = useState(today);
  const [authorName, setAuthorName] = useState(initialAuthor);
  const [busy, setBusy] = useState(false);

  const dutiesMissing = ssw2DutiesMissing(duties);
  const instructeeIssues = instructees
    .map((r) => ({ name: r.name || "（氏名未入力）", missing: instructeeMissingFields(r) }))
    .filter((r) => r.missing.length > 0);

  const exportDocx = async () => {
    setBusy(true);
    try {
      const blob = await buildDocx(
        buildSsw2PledgeDoc({ workerName, orgName, authorName, filledOn, duties, instructees }),
      );
      downloadBlob(blob, pledgeFileName(workerName, filledOn));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
          <FileText size={16} />
          ２号特定技能外国人の業務内容に関する誓約書（参考様式第１－３２号）
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          登録してある内容がそのまま入ります。直したいところは、それぞれの登録画面で直してから
          この画面を開き直してください。作成年月日と作成責任者だけは、ここで直したものが出ます。
        </p>

        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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

        <Button onClick={exportDocx} disabled={busy} icon={<Download size={16} />}>
          {busy ? "作成中…" : "Wordで出す"}
        </Button>
      </Card>

      {/* 差し込まれる内容の確認 */}
      <Card className="p-4">
        <p className="mb-2 text-xs font-bold">この内容で出します</p>

        <Row label="２号特定技能外国人" value={workerName} />
        <Row label="在留カード番号" value={residenceCardNo} where={`/workers/${workerId}`} />
        <Row
          label="特定技能所属機関の氏名又は名称"
          value={orgName}
          where={orgId ? `/organizations/${orgId}` : undefined}
        />
        <Row label="所在地" value={orgAddress} where={orgId ? `/organizations/${orgId}` : undefined} />

        <p className="mb-1.5 mt-3 text-xs font-bold">１　当該２号特定技能外国人の業務内容</p>
        {dutiesMissing.length > 0 && (
          <p className="mb-1.5 rounded-lg border border-seal/40 bg-seal/10 px-2 py-1.5 text-[11px] leading-relaxed text-seal">
            <TriangleAlert size={12} className="mr-1 inline" />
            {dutiesMissing.join("・")}が未登録です。
            {orgId ? (
              <Link href={`/organizations/${orgId}`} className="ml-1 font-bold underline">
                所属機関の情報で登録する →
              </Link>
            ) : (
              "所属機関が未設定のため登録できません。"
            )}
          </p>
        )}
        {SSW2_DUTY_FIELDS.map((f) => (
          <Row key={f.key} label={`${f.no} ${f.label}`} value={duties[f.key]} />
        ))}
        {orgId && (
          <p className="mt-1 text-[11px] text-muted">
            この内容は所属機関ごとに登録します。一度入れておけば、同じ会社で２号を申請するたびに
            自動で入ります（
            <Link href={`/organizations/${orgId}`} className="font-bold text-brand underline">
              所属機関の情報で直す →
            </Link>
            ）。
          </p>
        )}

        <p className="mb-1.5 mt-3 text-xs font-bold">
          ２　当該２号特定技能外国人に指導を受ける対象者一覧
        </p>
        {instructees.length === 0 ? (
          <p className="rounded-lg border border-seal/40 bg-seal/10 px-2 py-1.5 text-[11px] leading-relaxed text-seal">
            <TriangleAlert size={12} className="mr-1 inline" />
            指導対象者が登録されていません。
            <Link href={prepDetailHref(workerId)} className="ml-1 font-bold underline">
              申請準備で登録する →
            </Link>
          </p>
        ) : (
          <ol className="flex flex-col gap-0.5 text-[11px] leading-relaxed">
            {instructees.map((r, i) => (
              <li key={r.id}>
                {i + 1}. {r.name || "（氏名未入力）"}
                {r.residence_card_no ? `（${r.residence_card_no}）` : ""}
                {r.office ? ` ／ ${r.office}` : ""}
                {r.position ? ` ／ ${r.position}` : ""}
                {r.duties ? ` ／ ${r.duties}` : ""}
              </li>
            ))}
          </ol>
        )}
        {instructeeIssues.length > 0 && (
          <p className="mt-1.5 rounded-lg border border-seal/40 bg-seal/10 px-2 py-1.5 text-[11px] leading-relaxed text-seal">
            <TriangleAlert size={12} className="mr-1 inline" />
            {instructeeIssues.map((r) => `${r.name}: ${r.missing.join("・")}`).join(" ／ ")}
            が空です。
            <Link href={prepDetailHref(workerId)} className="ml-1 font-bold underline">
              申請準備で直す →
            </Link>
          </p>
        )}
      </Card>

      {/* 様式の留意事項（出す前に確認する） */}
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
