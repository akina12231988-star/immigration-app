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

// 表示用のメッセージ（原因がわかるよう details・hint・code も添える）
export function errorMessage(err: unknown, fallback = "エラーが発生しました"): string {
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
  if (isMissingTableError(err) || isMissingColumnError(err) || isCheckConstraintError(err)) {
    return `${errorMessage(err, fallback)}／マイグレーション ${migration} が未適用の可能性があります。Supabase の SQL Editor で適用してください。`;
  }
  return errorMessage(err, fallback);
}
