// 帳票PDFに埋め込まれた共通データフォーマット（JSON）を取り出す純粋関数。
// 履歴書だけでなく、雇用条件書・支援計画・技能実習評価調書など今後の帳票でも
// 同じ「マーカー＋Base64(JSON)」方式を再利用できるよう docType で識別する（要件⑫⑬）。
//
// 埋め込み形式（履歴書ツール側と一致させること）:
//   @@RIREKI_JSON_V1@@<UTF-8 JSON を Base64 化した文字列>@@END@@
// PDFのテキスト層に不可視（白文字）で埋め込まれる。PDFテキスト抽出時に
// 途中で改行や空白が混入するため、Base64部分は \s を除去してからデコードする。

export const PAYLOAD_MARKER_START = "@@RIREKI_JSON_V1@@";
export const PAYLOAD_MARKER_END = "@@END@@";

// 共通ヘッダ。全ての帳票ペイロードが最低限これを満たす。
export interface DocPayloadBase {
  docType: string; // "resume" | "employment_conditions" | "support_plan" | ...
  schema?: string;
  version?: number;
  generatedAt?: string;
  sourceLang?: string;
}

export interface ExtractedPayload {
  raw: string; // 抽出したJSON文字列
  payload: DocPayloadBase & Record<string, unknown>;
}

// UTF-8安全なBase64デコード（履歴書ツールの btoa(unescape(encodeURIComponent(json))) と対）。
function decodeBase64Utf8(b64: string): string {
  const clean = b64.replace(/\s+/g, "");
  if (typeof atob === "function") {
    // ブラウザ
    return decodeURIComponent(escape(atob(clean)));
  }
  // Node（テスト実行時）
  return Buffer.from(clean, "base64").toString("utf8");
}

// テキスト全体から最初の埋め込みペイロードを取り出す。無ければ null。
// PDFのテキスト抽出はグリフ間に空白・改行を混入させ、マーカーやBase64が
// 分断されることがあるため、まず全空白を除去してから探索する（マーカーと
// Base64には本来空白が含まれないので、この正規化で分断を復元できる）。
export function extractPayload(text: string): ExtractedPayload | null {
  if (!text) return null;
  const compact = text.replace(/\s+/g, "");
  const start = compact.indexOf(PAYLOAD_MARKER_START);
  if (start === -1) return null;
  const from = start + PAYLOAD_MARKER_START.length;
  const end = compact.indexOf(PAYLOAD_MARKER_END, from);
  if (end === -1) return null;
  const b64 = compact.slice(from, end);
  try {
    const json = decodeBase64Utf8(b64);
    const payload = JSON.parse(json) as DocPayloadBase & Record<string, unknown>;
    if (!payload || typeof payload !== "object" || typeof payload.docType !== "string") {
      return null;
    }
    return { raw: json, payload };
  } catch {
    return null;
  }
}
