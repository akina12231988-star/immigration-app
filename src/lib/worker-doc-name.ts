// 外国人の書類（雇用契約書・雇用条件書・在留カードなど）をダウンロードするときのファイル名。
// 「氏名_書類名.拡張子」にする（例: PHAM MANH DUC_雇用契約書.pdf）。
// ファイル名に使えない文字は中黒に置き換える。

export function workerDocFileName(workerName: string, kind: string, original: string): string {
  const dot = original.lastIndexOf(".");
  const ext = dot > 0 ? original.slice(dot + 1) : "";
  const stem = dot > 0 ? original.slice(0, dot) : original;
  const safe = (v: string) => v.replace(/[\\/:*?"<>|]/g, "・").trim();
  const base = [safe(workerName), safe(kind)].filter(Boolean).join("_");
  const name = base || safe(stem) || "document";
  return ext ? `${name}.${ext.toLowerCase()}` : name;
}
