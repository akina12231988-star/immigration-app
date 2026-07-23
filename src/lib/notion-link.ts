// Notion のリンクをブラウザではなくデスクトップアプリで開くための変換。
// https:// を notion:// に置き換えると、インストール済みの Notion アプリが該当ページを直接開く
// （www.notion.so / app.notion.com のどちらの形式でも有効）。
export function notionAppUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "notion://");
}

// Notion のページURLから 32桁のページID を取り出し、ダッシュ区切りのUUIDにして返す。
// 例: https://app.notion.com/p/3a629d7ae649802d9aede82605d6e06c → 3a629d7a-...
// ダッシュ付きUUIDが含まれていればそれを優先。見つからなければ null。
export function extractNotionPageId(url: string): string | null {
  const dashed = url.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  );
  if (dashed) return dashed[0].toLowerCase();
  const plain = url.match(/[0-9a-fA-F]{32}/g);
  if (!plain) return null;
  const id = plain[plain.length - 1].toLowerCase();
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}
