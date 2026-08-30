// 資料ファイルのリンク（workers.file_link）の扱い。
//
// https:// のリンク（Google Drive など）はそのまま開けるが、パソコン上の
// フォルダ・ファイル（/Users/... や C:\...、\\サーバー\...）は、ブラウザの
// 安全上の決まりでウェブページから直接開けない。そこでパソコン上のパスの
// ときは、押すとパスをコピーして、Finder（⌘⇧G）やエクスプローラーの
// アドレス欄に貼り付けて開いてもらう。

// そのまま開けるウェブのリンクか（https:// または http://）
export function isWebFileLink(value: string): boolean {
  return /^https?:\/\//i.test((value ?? "").trim());
}

// コピーするパス。file:// の形で入っていても素のパスに直す
export function fileLinkCopyPath(value: string): string {
  const v = (value ?? "").trim();
  if (!/^file:\/\//i.test(v)) return v;
  const stripped = v.replace(/^file:\/\/(localhost)?/i, "");
  try {
    return decodeURIComponent(stripped);
  } catch {
    return stripped; // %の使い方がおかしくても、そのまま返して使えるようにする
  }
}
