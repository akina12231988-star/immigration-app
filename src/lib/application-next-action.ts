import type { Application } from "@/types/application";

// 申請詳細の見やすさ改善（案C）。
//
// 申請詳細は「申請の基本情報・画像」「LINE報告文」「追加資料・郵送」「許可情報」「受領・届出」
// 「見積書の内容」「取下げ・削除」の折りたたみに分け、閉じていても見出しに要約を出す。
// 上の固定ヘッダーには「今やること」を1行で出し、今やる段階の折りたたみだけを最初から開く。
// この判定は画面の状態（status・approved など）だけで決まるので、ここに純関数として置いてテストする。

export type DetailSectionKey =
  | "basic" // 申請の基本情報・画像（受付票・通知書）
  | "line" // LINE報告文（申請）
  | "extra" // 追加資料の提出依頼・入管へ郵送
  | "approval" // 許可情報（許可処理）
  | "receive" // 在留カードの受領・届出（1の5）
  | "estimate" // 見積書の内容
  | "danger"; // 取下げ・削除

export interface NextAction {
  section: DetailSectionKey; // 最初から開いておく折りたたみ
  text: string; // ヘッダーの「今やること」に出す1行
  done: boolean; // 申請の流れが終わっている（在留カード受領済み・取下げ済み）
}

export type NextActionApp = Pick<
  Application,
  | "status"
  | "approved"
  | "lineReported"
  | "grantedCardNo"
  | "grantedPermitDate"
  | "grantedExpiryDate"
  | "cardReceivedOn"
  | "approvalDate"
  | "applicationDate"
  | "applicationNumber"
  | "assignee"
  | "isSelfApply"
  | "withdrawnOn"
>;

export interface NextActionCounts {
  extraOpen: number; // 追加資料の依頼のうち、まだ郵送していないもの
  mailPending: number; // 申請準備で「申請後に入管へ郵送する」とした書類・タスクのうち、まだ済んでいないもの
}

// 許可情報（在留カード番号・在留許可日・在留期限）のうち未入力の項目名
export function grantMissing(app: NextActionApp): string[] {
  const missing: string[] = [];
  if (!app.grantedCardNo?.trim()) missing.push("在留カード番号");
  if (!app.grantedPermitDate) missing.push("在留許可日");
  if (!app.grantedExpiryDate) missing.push("在留期限");
  return missing;
}

// 許可が下りているか（許可処理のボタンを押した／状態が許可済以降）
export function isApproved(app: NextActionApp): boolean {
  return app.approved || app.status === "許可済" || app.status === "在留カード受領";
}

export function applicationNextAction(app: NextActionApp, counts: NextActionCounts): NextAction {
  if (app.status === "取下げ") {
    return {
      section: "danger",
      text: `この申請は取下げ済みです（取下げ日: ${app.withdrawnOn ?? "不明"}）。誤って取り下げたときは「取下げを元に戻す」を押します。`,
      done: true,
    };
  }
  if (app.status === "在留カード受領") {
    return {
      section: "receive",
      text: "この申請は完了です。必要なら届出（1の5）の Excel、個人票の印刷、見積書の内容を確認します。",
      done: true,
    };
  }
  const approved = isApproved(app);
  if (approved) {
    const missing = grantMissing(app);
    if (missing.length > 0) {
      return {
        section: "approval",
        text: `許可情報（${missing.join("・")}）を入れて「許可情報を保存」を押します。保存したら在留カードを受け取ったときに「受け取った（完了）」を押します。`,
        done: false,
      };
    }
    return {
      section: "receive",
      text: "在留カードを受け取ったら「在留カードを受け取った（完了）」を押します（外国人の現在の所属機関がこの申請の所属機関になります）。",
      done: false,
    };
  }
  // 申請直後は所属機関へのLINE報告が先
  if ((app.status === "申請前" || app.status === "申請済") && !app.lineReported) {
    return {
      section: "line",
      text: "LINE報告文（申請）をコピーして所属機関へ送り、「報告済にする」を押します。",
      done: false,
    };
  }
  if (counts.extraOpen > 0) {
    return {
      section: "extra",
      text: `追加資料の依頼が${counts.extraOpen}件、まだ郵送していません。本人から資料を集めてレターパックで送り、追跡番号を入れて「郵送済み」にします。`,
      done: false,
    };
  }
  if (counts.mailPending > 0) {
    return {
      section: "extra",
      text: `申請後に入管へ郵送する書類・タスクが${counts.mailPending}件あります。発行され次第、入管へ郵送して消し込みます。`,
      done: false,
    };
  }
  if (app.status === "通知書到着") {
    return {
      section: "approval",
      text: "「入管から許可がおりた通知あり」を押し、許可情報（在留カード番号・在留許可日・在留期限）を入れて保存します。",
      done: false,
    };
  }
  return {
    section: "basic",
    text: "審査中です。通知書が届いたら「画像」の通知書に登録します（状態が「通知書到着」に進みます）。",
    done: false,
  };
}

// ---- 折りたたみの見出しに出す要約 ----

export function basicSummary(app: NextActionApp, fileCount: number): string {
  const who = app.isSelfApply ? "本人申請" : app.assignee || "担当未入力";
  return `申請日 ${app.applicationDate || "未入力"}・申請番号 ${app.applicationNumber || "未登録"}・${who}・画像 ${fileCount}枚`;
}

export function lineSummary(app: Pick<Application, "lineReported">): string {
  return app.lineReported ? "報告済み" : "まだ報告していません";
}

export interface ExtraSummaryCounts extends NextActionCounts {
  extraDone: number; // 郵送済みの追加資料の依頼
  mailings: number; // 入管へ郵送した追加資料の投函回数
}

export function extraSummary(c: ExtraSummaryCounts): string {
  const parts: string[] = [];
  if (c.extraOpen > 0) parts.push(`依頼 ${c.extraOpen}件が未郵送`);
  else if (c.extraDone > 0) parts.push(`依頼 ${c.extraDone}件は郵送済み`);
  else parts.push("依頼なし");
  if (c.mailPending > 0) parts.push(`郵送待ちの書類・タスク ${c.mailPending}件`);
  if (c.mailings > 0) parts.push(`郵送した追加資料 ${c.mailings}回`);
  return parts.join("・");
}

// 追加資料・郵送の要約を赤で出すか（まだやることが残っている）
export function extraWarn(c: NextActionCounts): boolean {
  return c.extraOpen > 0 || c.mailPending > 0;
}

export function approvalSummary(app: NextActionApp): { text: string; warn: boolean } {
  if (!isApproved(app)) {
    return { text: "許可の通知が来たら開いて「入管から許可がおりた通知あり」を押します", warn: false };
  }
  const missing = grantMissing(app);
  if (missing.length > 0) {
    return { text: `${missing.join("・")}が未入力`, warn: true };
  }
  return {
    text: `在留カード ${app.grantedCardNo?.trim()}・許可日 ${app.grantedPermitDate}・期限 ${app.grantedExpiryDate}`,
    warn: false,
  };
}

export function receiveSummary(app: NextActionApp): string {
  if (app.status === "在留カード受領") {
    return `受領日 ${app.cardReceivedOn ?? "未入力"}・届出（1の5）の Excel を作れます`;
  }
  if (isApproved(app)) return "在留カードを受け取ったら「受け取った（完了）」を押します";
  return "許可情報を保存すると開けます";
}
