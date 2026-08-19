import { Globe, UserRound } from "lucide-react";
import {
  applicantLabel,
  isSelfApplication,
  nationalityLabel,
} from "@/lib/application-applicant";
import type { Application } from "@/types/application";

// 申請一覧のカード・表に出す「国籍」と「本人申請か申請取次士か」。
// 詳細ページを開かなくても一覧で見分けられるように、本人申請だけ色を変える。
export function ApplicantMeta({
  app,
  nationality,
  showApplicant = true,
  className = "",
}: {
  app: Pick<Application, "isSelfApply" | "assignee">;
  nationality?: string | null;
  // まだ申請していない行（申請前＜準備中＞の擬似行）では取次士を出さない
  showApplicant?: boolean;
  className?: string;
}) {
  const self = isSelfApplication(app);
  return (
    <span className={`flex flex-wrap items-center gap-1 ${className}`}>
      <span className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px] font-bold text-muted">
        <Globe size={11} />
        {nationalityLabel(nationality)}
      </span>
      {showApplicant && (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
            self ? "bg-status-notice-bg text-status-notice-fg" : "bg-background text-muted"
          }`}
        >
          <UserRound size={11} />
          {applicantLabel(app)}
        </span>
      )}
    </span>
  );
}
