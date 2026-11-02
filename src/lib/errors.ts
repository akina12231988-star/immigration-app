// 画面に出すエラーメッセージの取り出し。
// Supabase（PostgREST）のエラーは Error のインスタンスではなくただのオブジェクト
// （{ message, details, hint, code }）で返るため、instanceof Error だけでは
// 内容が捨てられてしまう。ここで両方に対応する。

interface PostgrestLikeError {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
}

function asPostgrestError(err: unknown): PostgrestLikeError | null {
  return err && typeof err === "object" ? (err as PostgrestLikeError) : null;
}

// テーブル未作成（マイグレーション未適用）のエラーか
export function isMissingTableError(err: unknown): boolean {
  const e = asPostgrestError(err);
  if (!e) return false;
  if (e.code === "PGRST205" || e.code === "42P01") return true;
  const text = [e.message, e.details].filter((v) => typeof v === "string").join(" ");
  return /Could not find the table|does not exist|schema cache/i.test(text);
}

// 列が無い（マイグレーション未適用）エラーか
export function isMissingColumnError(err: unknown): boolean {
  const e = asPostgrestError(err);
  if (!e) return false;
  if (e.code === "PGRST204" || e.code === "42703") return true;
  const text = [e.message, e.details].filter((v) => typeof v === "string").join(" ");
  return /Could not find the .* column|column .* does not exist/i.test(text);
}

// 選択肢のCHECK制約に引っかかったエラーか。
// アプリ側で増やした選択肢（例: 合格証の組み合わせ）が、DB側の制約にまだ無いときに出る
export function isCheckConstraintError(err: unknown): boolean {
  const e = asPostgrestError(err);
  if (!e) return false;
  if (e.code === "23514") return true;
  const text = [e.message, e.details].filter((v) => typeof v === "string").join(" ");
  return /violates check constraint/i.test(text);
}

// 必須（NOT NULL）の制約に引っかかったエラーか。
// アプリ側で空を許すようにした列（例: 賃金の適用開始日）が、DB側ではまだ必須のままのときに出る
export function isNotNullConstraintError(err: unknown): boolean {
  const e = asPostgrestError(err);
  if (!e) return false;
  if (e.code === "23502") return true;
  const text = [e.message, e.details].filter((v) => typeof v === "string").join(" ");
  return /violates not-null constraint/i.test(text);
}

// アプリの新しい版が公開されたあと、古いまま開いていた画面から保存しようとしたときのエラー
// （Next.js の「Server Action "…" was not found on the server」）。再読み込みすれば直る
export const STALE_PAGE_MESSAGE =
  "アプリが新しくなったため、この画面のままでは保存できませんでした。ページを再読み込み（Mac は ⌘+R、Windows は F5）してから、もう一度やり直してください。";
export function isStalePageError(err: unknown): boolean {
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /Server Action .* was not found on the server|failed-to-find-server-action/i.test(text);
}

// 通信が途切れて送れなかったときのエラー（ブラウザごとに文面が違う: Chrome「Failed to fetch」、
// Safari「Load failed」、Firefox「NetworkError when attempting to fetch resource」）
export function isNetworkError(message: string): boolean {
  return /Failed to fetch|Load failed|NetworkError|Network request failed/i.test(message);
}
export const NETWORK_ERROR_MESSAGE =
  "通信が途切れたため送れませんでした（スマホの電波が弱い・画面を切り替えた など）。電波のよい所で、もう一度押してください。続くときは画像を撮り直す・選び直してから押してください。";

// 表示用のメッセージ（原因がわかるよう details・hint・code も添える）
export function errorMessage(err: unknown, fallback = "エラーが発生しました"): string {
  if (isStalePageError(err)) return STALE_PAGE_MESSAGE;
  if (err instanceof Error && isNetworkError(err.message)) return NETWORK_ERROR_MESSAGE;
  if (err instanceof Error && err.message) return err.message;
  const e = asPostgrestError(err);
  if (e) {
    const parts = [e.message, e.details, e.hint].filter(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    );
    if (parts.length > 0) {
      const code = typeof e.code === "string" && e.code ? `（${e.code}）` : "";
      return `${parts.join(" / ")}${code}`;
    }
  }
  if (typeof err === "string" && err.trim() !== "") return err;
  return fallback;
}

// マイグレーション未適用のときは何を適用すればよいかまで案内する
export function dbErrorMessage(
  err: unknown,
  migration: string,
  fallback = "保存に失敗しました",
): string {
  if (
    isMissingTableError(err) ||
    isMissingColumnError(err) ||
    isCheckConstraintError(err) ||
    isNotNullConstraintError(err)
  ) {
    return `${errorMessage(err, fallback)}／マイグレーション ${migration} が未適用の可能性があります。Supabase の SQL Editor で適用してください。`;
  }
  return errorMessage(err, fallback);
}
