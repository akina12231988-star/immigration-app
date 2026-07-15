// PDFのテキスト層から全文テキストを抽出する（クライアント専用）。
// OCRではなく、PDF内のテキストデータを優先して読み取る（要件⑪）。
// 履歴書ツールが埋め込んだ不可視JSONもテキスト層に含まれるため、ここで取得できる。

// pdfjs はブラウザ実行時のみ動的 import する（SSRバンドルを避ける）。
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // ワーカーをバンドル同梱の URL から読み込む（Turbopack/webpack 対応）。
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ("str" in it ? (it as { str: string }).str : ""))
      .join(" ");
    text += line + "\n";
  }
  await doc.cleanup();
  return text;
}
