// ブラウザでファイルを「名前を付けて」保存する。
// Supabase ストレージの署名付きURLの download 指定は日本語のファイル名が壊れる
// （「雇用契約書」が E99B87… のような文字列になる）ため、
// 一度ブラウザで中身を取ってから、こちらで決めた名前で保存する。
// 取れなかったときは代わりのURL（サーバー側で名前を付けたもの）をそのまま開く。

export async function downloadFileAs(url: string, fileName: string, fallbackUrl?: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // 保存が始まってから解放する（すぐ消すと保存に失敗するブラウザがある）
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  } catch {
    window.location.href = fallbackUrl || url;
  }
}
