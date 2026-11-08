"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Paperclip } from "lucide-react";
import { getDocRequestFilePreviewUrl } from "@/app/(app)/organizations/requests/actions";
import { formatYenAmount, warekiYear } from "@/lib/dependents";
import { fuyoFormNames, type FuyoFormKind, type FuyoJudgement } from "@/lib/fuyo-judgement";

type RemittanceFile = { id: string; file_name: string; mime_type: string };

// 会社からの書類の依頼のマスから開いたときの、申告書の選び方。
// 左に送金明細書（同じ依頼の送金証明書のマスに添付したもの）と外国人詳細の送金額、
// 右に「入社時」「年末調整時」を並べて、誰が載るかを見比べてから添付する方を押す
export function FuyoAttachChooser({
  target,
  workerId,
  year,
  judgement: j,
  recommended,
  remittanceFiles,
  busy,
  onAttach,
}: {
  target: { requestTitle: string; itemName: string };
  workerId: string;
  year: string;
  judgement: FuyoJudgement;
  recommended: FuyoFormKind;
  remittanceFiles: RemittanceFile[];
  busy: boolean;
  onAttach: (kind: FuyoFormKind) => void;
}) {
  const wareki = warekiYear(year);
  const notEntered = j.kind === "not-entered";
  const cards: { kind: FuyoFormKind; title: string; desc: string }[] = [
    { kind: "入社時", title: "入社時", desc: "扶養親族を全員記載（送金額は見ない）" },
    {
      kind: "年末調整時",
      title: `年末調整時（${year}年）`,
      desc: "送金が目標に達した人だけ記載・B欄に送金合計額",
    },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="text-xs font-bold">送金明細書（チェック表の添付）</p>
        {remittanceFiles.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-border bg-background px-2 py-3 text-[11px] text-muted">
            同じ依頼の送金証明書のマスには、まだ添付がありません
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {remittanceFiles.map((f) => (
              <RemittancePreview key={f.id} file={f} />
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] font-bold text-muted">
          外国人詳細に入っている送金額（{year}年{wareki && `・${wareki}`}）
        </p>
        {j.dependents.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted">扶養家族が登録されていません</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {j.dependents.map((d, i) => (
              <li
                key={`${d.name}-${i}`}
                className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[11px] ${
                  notEntered ? "bg-background text-muted" : d.achieved ? "bg-status-approved-bg" : "bg-seal/10 text-seal"
                }`}
              >
                <span className="min-w-0 truncate">
                  {notEntered ? "" : d.achieved ? "✓ " : "✗ "}
                  {d.name}
                  {d.relation && `（${d.relation}）`}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatYenAmount(d.amount)} / {formatYenAmount(d.target)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {notEntered && (
          <p className="mt-1 text-[11px] font-bold text-amber-700">{year}年の送金額がまだ入っていません。先に金額を入れてください</p>
        )}
        <Link href={`/workers/${workerId}#wd-dependents`} target="_blank" className="mt-2 inline-block text-[11px] text-brand underline">
          金額を直す（外国人詳細の扶養家族を開く）
        </Link>
        <p className="mt-1 text-[10px] text-muted">金額を直したら、この画面を読み込み直すと判定が変わります</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="text-xs font-bold text-brand">
          「{target.requestTitle}」の「{target.itemName}」に添付する申告書を選んでください
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {cards.map((c) => {
            const names = fuyoFormNames(j, c.kind);
            const rec = !notEntered && c.kind === recommended;
            const skipped = c.kind === "年末調整時" ? j.unachieved : [];
            return (
              <div key={c.kind} className={`flex flex-col rounded-xl p-3 ${rec ? "border-2 border-brand" : "border border-border"}`}>
                <p className="text-sm font-bold">
                  {c.title}
                  {rec && <span className="ml-1.5 rounded bg-brand px-1.5 py-0.5 text-[10px] text-brand-foreground">おすすめ</span>}
                </p>
                <p className="mt-1 text-[11px] text-muted">{c.desc}</p>
                <p className="mt-2 text-[11px] font-bold">記載 {names.length}人</p>
                <p className="text-[11px]">
                  {names.length === 0
                    ? "なし"
                    : c.kind === "年末調整時"
                      ? j.achieved.map((d) => `${d.name}${d.relation ? `（${d.relation}）` : ""} ${formatYenAmount(d.amount)}`).join("・")
                      : j.dependents.map((d) => `${d.name}${d.relation ? `（${d.relation}）` : ""}`).join("・")}
                </p>
                {skipped.length > 0 && !notEntered && (
                  <p className="text-[11px] text-seal">
                    記載しない：{skipped.map((d) => `${d.name}${d.relation ? `（${d.relation}）` : ""} 送金 ${formatYenAmount(d.amount)}`).join("・")}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => onAttach(c.kind)}
                  disabled={busy || (c.kind === "年末調整時" && notEntered)}
                  title={c.kind === "年末調整時" && notEntered ? "送金額を入れてから選べます" : undefined}
                  className={`mt-3 inline-flex min-h-[44px] w-fit items-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-50 ${
                    rec ? "bg-brand text-brand-foreground" : "border border-brand text-brand"
                  }`}
                >
                  <Paperclip size={16} />
                  {busy ? "作成中…" : `${c.kind}で添付`}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          添付するとチェック表に戻り、「会社へ送る書類」がこの申告書に決まります。送金額をあとで直して載る人が変わったら、マスに「作り直しが必要」と出ます。
          入社時・年末調整時のどちらかを、下の「申告書PDFをダウンロード」で確かめてから添付することもできます。
        </p>
      </div>
    </div>
  );
}

// 送金明細書のプレビュー（画像はその場で表示、PDF は別タブで開く）
function RemittancePreview({ file }: { file: RemittanceFile }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = file.mime_type.startsWith("image/");
  useEffect(() => {
    let alive = true;
    void getDocRequestFilePreviewUrl(file.id).then((res) => {
      if (alive && res.ok) setUrl(res.url);
    });
    return () => {
      alive = false;
    };
  }, [file.id]);
  return (
    <div className="rounded-lg border border-border bg-background p-1.5">
      {isImage && url && (
        <a href={url} target="_blank" rel="noopener noreferrer" title="押すと大きく開きます">
          {/* eslint-disable-next-line @next/next/no-img-element -- 署名付きURLの一時画像 */}
          <img src={url} alt={file.file_name} className="max-h-[320px] w-full rounded object-contain" />
        </a>
      )}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-brand underline">
          <ExternalLink size={11} />
          {file.file_name}
        </a>
      ) : (
        <span className="text-[11px] text-muted">{file.file_name}（読み込み中…）</span>
      )}
    </div>
  );
}
