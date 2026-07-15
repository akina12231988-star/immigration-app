// 帳票インポートの共通エントリポイント。
// PDFから抽出したテキスト → 埋め込みJSON → docType別ハンドラ、という流れ（要件⑩⑪⑫）。
// 新しい帳票（雇用条件書・支援計画・技能実習評価調書など）は DOC_HANDLERS に
// docType を追加するだけで対応できる。

import { extractPayload, type DocPayloadBase } from "./payload";
import { resumePayloadToWorker, type ImportedWorker } from "./resume";

export type { ImportedWorker, ImportedHistory } from "./resume";
export { extractPayload } from "./payload";

// 対応済み帳票の一覧（UI表示・拡張の指針用）。
export const SUPPORTED_DOC_TYPES: Record<string, string> = {
  resume: "特定技能外国人の履歴書",
  // 今後追加予定:
  // employment_conditions: "雇用条件書",
  // support_plan: "支援計画",
  // skill_evaluation: "技能実習評価調書",
};

export interface ImportedDocument {
  docType: string;
  docLabel: string;
  workers: ImportedWorker[]; // 帳票から得られた外国人（履歴書は1件、将来の帳票では複数もあり得る）
  warnings: string[];
}

type DocHandler = (payload: DocPayloadBase & Record<string, unknown>) => ImportedDocument;

const DOC_HANDLERS: Record<string, DocHandler> = {
  resume: (payload) => {
    const { worker, warnings } = resumePayloadToWorker(payload);
    return { docType: "resume", docLabel: SUPPORTED_DOC_TYPES.resume, workers: [worker], warnings };
  },
};

export type ImportParseError =
  | { kind: "no-payload" }
  | { kind: "unsupported"; docType: string };

export type ImportParseResult =
  | { ok: true; document: ImportedDocument }
  | { ok: false; error: ImportParseError };

// PDF等から抽出したテキスト全体を受け取り、埋め込みデータを取り込み用に変換する。
export function parseDocumentText(text: string): ImportParseResult {
  const extracted = extractPayload(text);
  if (!extracted) return { ok: false, error: { kind: "no-payload" } };

  const docType = extracted.payload.docType;
  const handler = DOC_HANDLERS[docType];
  if (!handler) return { ok: false, error: { kind: "unsupported", docType } };

  return { ok: true, document: handler(extracted.payload) };
}
