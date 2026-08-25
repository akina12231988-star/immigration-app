// 作ったファイル（PDF・画像など）を端末に保存する／そのまま送る。
//
// iPhone・iPad の Safari は <a download> が効かず、ファイルではなく blob: のリンクが
// 共有されてしまう（共有シートに「1個のリンク」と出て、LINEやMessengerへ送れない）。
// そこで、ファイルを共有できる端末では共有シートにファイルそのものを渡し、
// できない端末（パソコンのブラウザなど）はこれまでどおりダウンロードする。

export type FileSaveResult = "shared" | "canceled" | "downloaded";

// 共有シートにファイルを渡せる端末か
export function canShareFile(file: File): boolean {
  const nav = typeof navigator === "undefined" ? null : navigator;
  if (!nav?.share || !nav.canShare) return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

// ダウンロード（パソコンのブラウザ向け）
function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // すぐ消すと保存が始まらない端末があるため、少し待ってから片づける
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function saveOrShareFile(
  blob: Blob,
  fileName: string,
  mimeType: string,
): Promise<FileSaveResult> {
  const file = new File([blob], fileName, { type: mimeType });
  if (canShareFile(file)) {
    try {
      // files だけを渡す（title や url を一緒に渡すと、iPhoneでリンクの共有に化けることがある）
      await navigator.share({ files: [file] });
      return "shared";
    } catch (err) {
      // 共有シートを閉じただけのときは、続けてダウンロードしない
      if (err instanceof DOMException && err.name === "AbortError") return "canceled";
      // 共有できなかったときはダウンロードで保存する
    }
  }
  download(blob, fileName);
  return "downloaded";
}

// 保存・共有のあとに画面へ出す案内
export function fileSaveMessage(result: FileSaveResult, fileName: string): string | null {
  if (result === "canceled") return null;
  if (result === "shared") return `${fileName} を渡しました（保存先やアプリは共有画面で選べます）`;
  return `${fileName} を保存しました`;
}
