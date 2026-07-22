// Notion のリンクをブラウザではなくデスクトップアプリで開くための変換。
// https:// を notion:// に置き換えると、インストール済みの Notion アプリが該当ページを直接開く
// （www.notion.so / app.notion.com のどちらの形式でも有効）。
export function notionAppUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "notion://");
}
