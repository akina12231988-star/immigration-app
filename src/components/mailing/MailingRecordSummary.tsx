import { formatDateJP, requestKindLabel, type JudgmentRecord } from "@/lib/tax-cert";
import { mailingProgressLabel, normalizeTrackingNumber, trackingUrl } from "@/lib/tax-office";

// 郵送請求の記録を1件ずつ短く出す（申請準備の「郵送請求中」の欄と、郵送請求の記録一覧で共用）。
// 納税証明書その3は 税務署・投函日・追跡番号・進捗、それ以外は 請求先・投函日（郵送請求日）を出す

export function mailingDestination(r: JudgmentRecord): string {
  if (r.requestKind === "nozei3") return r.taxOfficeName || "税務署未選択";
  if (r.requestKind === "tenshutsu" || r.requestKind === "juminhyo") return r.cityOffice || "請求先未入力";
  return r.municipalityName || "自治体未選択";
}

export function mailingPostDate(r: JudgmentRecord): string {
  if (r.requestKind === "nozei3" || r.requestKind === "tenshutsu" || r.requestKind === "juminhyo") {
    return r.postDate ?? "";
  }
  return r.requestMethod === "mail" ? r.mailRequestDate : "";
}

// 進捗の色（準備中 → 郵送待ち → 完了）
export function ProgressBadge({ progress }: { progress?: string }) {
  const cls =
    progress === "done"
      ? "bg-status-approved-bg text-status-approved-fg"
      : progress === "waiting"
        ? "bg-status-applied-bg text-status-applied-fg"
        : "bg-status-notice-bg text-status-notice-fg";
  return (
    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>
      {mailingProgressLabel(progress)}
    </span>
  );
}

export function TrackingLink({ trackingNumber }: { trackingNumber?: string }) {
  const no = (trackingNumber ?? "").trim();
  if (!no) return <span className="text-muted">追跡番号未入力</span>;
  const url = trackingUrl(no);
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="font-bold tabular-nums text-brand underline">
      {normalizeTrackingNumber(no).replace(/(\d{4})(?=\d)/g, "$1-")}
    </a>
  ) : (
    <span className="tabular-nums">{no}</span>
  );
}

export function MailingRecordSummary({ record: r }: { record: JudgmentRecord }) {
  const post = mailingPostDate(r);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
      <span className="font-bold">{requestKindLabel(r.requestKind)}</span>
      <span>{mailingDestination(r)}</span>
      <span className="text-muted">{post ? `投函 ${formatDateJP(post)}` : "投函日未記録"}</span>
      {r.requestKind === "nozei3" && (
        <>
          <TrackingLink trackingNumber={r.trackingNumber} />
          <ProgressBadge progress={r.mailingProgress} />
          {r.mailingProgress === "done" && r.receivedDate && (
            <span className="text-muted">届いた日 {formatDateJP(r.receivedDate)}</span>
          )}
        </>
      )}
      {r.todoNumber && <span className="text-muted">TODO {r.todoNumber}</span>}
    </div>
  );
}
