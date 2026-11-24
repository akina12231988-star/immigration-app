import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { submissionPastDateText, type SubmissionPast, type SubmissionRow, type SubmissionTable } from "@/lib/submission-list";

// 提出書類一覧表を、入管の様式の PDF そのものに書き込む（申請書類作成をアプリ一本化計画）。
// 提出確認欄の「有」「無」の文字に丸を描き、表紙の「申請人の氏名」「特定技能所属機関の名称」の線の上に名前を書く。
// 様式の PDF は public/forms/ に置き、「有」「無」の位置は scripts/submission-pdf-layout.mjs で読み取って書き写す。
// 座標は PDF の左下が原点の pt（pdf-lib と同じ）。

export interface SubmissionPdfTemplate {
  file: string; // public 配下のパス
  // 提出確認欄の行（一覧表の書類の順と同じ）。[ページ(0始まり), 「有」の x, 「無」の x, 文字の下端の y]
  rows: [number, number, number, number][];
  markSize: number; // 「有」「無」の文字の大きさ（pt）
  // 表紙の氏名・所属機関名を書く位置（線の上。y は見出しの文字の下端）
  cover?: { page: number; x: number; nameY: number; orgY: number; maxWidth: number };
  // 「過去に提出した申請情報」の欄（pastInfo の書類の順）。
  // [ページ, 「・申請年月日」の x, 「・申請年月日」の文字の下端の y, 「・受付番号」の文字の下端の y]。斜線の欄は入れない
  past?: [number, number, number, number][];
}

// 入管の様式の PDF が入っている表。ここに無い表は、アプリで作った簡易版で印刷する
export const SUBMISSION_PDF_TEMPLATES: Partial<Record<SubmissionTable, SubmissionPdfTemplate>> = {
  // 「特定技能1号」に係る提出書類一覧表（在留資格変更許可申請用。令和8年10月9日改定）表紙＋第1表（4ページ）
  "1": {
    file: "/forms/submission-ssw1.pdf",
    markSize: 7,
    past: [[1, 448.4, 191.8, 171.5], [1, 448.4, 102.2, 81.8], [2, 448.4, 746, 725.7], [2, 448.4, 576.3, 556], [2, 448.4, 495.9, 475.6], [2, 448.4, 375.8, 355.4], [2, 448.4, 275.5, 255.2]],
    cover: { page: 0, x: 292, nameY: 92.7, orgY: 57.6, maxWidth: 262 },
    rows: [
      [1, 421.3, 436.5, 722.3],
      [1, 421.3, 436.5, 686.6],
      [1, 421.3, 436.5, 640],
      [1, 421.3, 436.5, 593.3],
      [1, 421.3, 436.5, 542.7],
      [1, 421.3, 436.5, 501.9],
      [1, 421.3, 436.5, 481.1],
      [1, 421.3, 436.5, 460.2],
      [1, 421.3, 436.5, 432.4],
      [1, 421.3, 436.5, 397.7],
      [1, 421.3, 436.5, 350.1],
      [1, 421.3, 436.5, 289.6],
      [1, 421.3, 436.5, 238.9],
      [1, 421.3, 436.5, 208.1],
      [1, 421.3, 436.5, 152.8],
      [1, 421.3, 436.5, 74.3],
      [2, 421.3, 436.5, 666.9],
      [2, 421.3, 436.5, 541.9],
      [2, 421.3, 436.5, 441.6],
      [2, 421.3, 436.5, 331.4],
      [2, 421.3, 436.5, 236.1],
      [2, 421.3, 436.5, 155.7],
      [2, 421.3, 436.5, 110],
      [2, 421.3, 436.5, 89.1],
      [2, 421.3, 436.5, 68.2],
      [3, 421.3, 436.5, 721.5],
    ],
  },
  // 農業分野に関する必要な書類（特定技能1号・直接雇用）第3表の13の1（1ページ）
  "3agri": {
    file: "/forms/submission-ssw1-agri.pdf",
    markSize: 7,
    past: [[0, 449.6, 746.2, 725.9], [0, 449.6, 586.4, 566], [0, 449.6, 505.9, 485.6]],
    rows: [
      [0, 422.5, 437.8, 672.1],
      [0, 422.5, 437.8, 551.9],
      [0, 422.5, 437.8, 471.5],
      [0, 422.5, 437.8, 419.7],
      [0, 422.5, 437.8, 396.6],
      [0, 422.5, 437.8, 369.7],
    ],
  },
  // 農業分野に関する必要な書類（特定技能2号・在留資格認定証明書交付申請及び在留資格変更許可申請・直接雇用）第3表の8の1（1ページ）
  "2-3agri": {
    file: "/forms/submission-ssw2-agri.pdf",
    markSize: 7,
    past: [[0, 446.6, 748.1, 724.3]],
    rows: [
      [0, 419.3, 434, 704],
      [0, 419.3, 434, 641.7],
      [0, 419.3, 434, 618.6],
    ],
  },
  // 「特定技能2号」に係る提出書類一覧表（在留資格変更許可申請用。令和8年8月20日改定）表紙＋第1表（4ページ）。
  // 利用者が入管のエクセルを Excel で PDF にしたもの（2026-11-17）
  "2-1": {
    file: "/forms/submission-ssw2.pdf",
    markSize: 7,
    past: [[2, 445.9, 747.4, 723.6], [2, 445.9, 657.8, 634], [2, 445.9, 590.6, 566.8], [2, 445.9, 338.6, 314.8], [2, 445.9, 225.2, 201.4], [3, 445.9, 747.4, 723.6], [3, 445.9, 596.2, 572.4]],
    cover: { page: 0, x: 292, nameY: 99.9, orgY: 64.9, maxWidth: 262 },
    rows: [
      [1, 418.6, 433.3, 734.8],
      [1, 418.6, 433.3, 690.7],
      [1, 418.6, 433.3, 638.9],
      [1, 418.6, 433.3, 587.8],
      [1, 418.6, 433.3, 524.8],
      [1, 418.6, 433.3, 474.4],
      [1, 418.6, 433.3, 449.2],
      [1, 418.6, 433.3, 424],
      [1, 418.6, 433.3, 393.9],
      [1, 418.6, 433.3, 359.6],
      [1, 418.6, 433.3, 305],
      [1, 418.6, 433.3, 229.4],
      [1, 418.6, 433.3, 179],
      [1, 418.6, 433.3, 141.2],
      [1, 418.6, 433.3, 103.4],
      [2, 418.6, 433.3, 708.9],
      [2, 418.6, 433.3, 630.5],
      [2, 418.6, 433.3, 470.9],
      [2, 418.6, 433.3, 288.2],
      [2, 418.6, 433.3, 149.6],
      [3, 418.6, 433.3, 678.1],
      [3, 418.6, 433.3, 533.2],
      [3, 418.6, 433.3, 419.8],
      [3, 418.6, 433.3, 363.1],
      [3, 418.6, 433.3, 325.3],
      [3, 418.6, 433.3, 261.6],
    ],
  },
  // 「特定技能1号」に係る提出書類一覧表（在留期間更新許可申請用。令和8年10月9日改定）表紙＋第1表（3ページ）。
  // 利用者が入管のエクセルを PDF にしたもの（2026-11-24）
  r1: {
    file: "/forms/submission-ssw1-renewal.pdf",
    markSize: 7,
    past: [[1, 445.9, 469.5, 445.7], [1, 445.9, 379.9, 356.1], [1, 445.9, 312.7, 288.9], [2, 445.9, 747.4, 723.6], [2, 445.9, 634, 610.2], [2, 445.9, 470.2, 446.4], [2, 445.9, 319, 295.2]],
    cover: { page: 0, x: 292, nameY: 99.2, orgY: 64.2, maxWidth: 262 },
    rows: [
      [1, 418.6, 433.3, 720.8],
      [1, 418.6, 433.3, 683],
      [1, 418.6, 433.3, 641],
      [1, 418.6, 433.3, 606],
      [1, 418.6, 433.3, 582.2],
      [1, 418.6, 433.3, 557],
      [1, 418.6, 433.3, 526.9],
      [1, 418.6, 433.3, 492.6],
      [1, 418.6, 433.3, 431],
      [1, 418.6, 433.3, 352.6],
      [1, 418.6, 433.3, 193],
      [2, 418.6, 433.3, 697],
      [2, 418.6, 433.3, 558.4],
      [2, 418.6, 433.3, 400.9],
      [2, 418.6, 433.3, 256],
      [2, 418.6, 433.3, 142.6],
      [2, 418.6, 433.3, 85.2],
    ],
  },
  // 農業分野に関する必要な書類（特定技能1号・在留期間更新許可申請・直接雇用）第3表の2の1（1ページ）
  r3agri: {
    file: "/forms/submission-ssw1-renewal-agri.pdf",
    markSize: 7,
    past: [[0, 448.7, 722.9, 699.1]],
    rows: [
      [0, 420.7, 436.1, 741.8],
      [0, 420.7, 436.1, 684.4],
    ],
  },
};

// この一覧表を入管の様式の PDF で作れるか（出す表が全部そろっているか）
export function canFillSubmissionPdf(rows: Pick<SubmissionRow, "table">[]): boolean {
  const tables = [...new Set(rows.map((r) => r.table))];
  return tables.length > 0 && tables.every((t) => !!SUBMISSION_PDF_TEMPLATES[t]);
}

// 書き込む表の順（表紙＋第1表 → 第3表）
export function submissionPdfTables(rows: Pick<SubmissionRow, "table">[]): SubmissionTable[] {
  const order: SubmissionTable[] = ["1", "3agri", "2-1", "2-3agri", "r1", "r3agri"];
  return order.filter((t) => rows.some((r) => r.table === t));
}

// 様式の PDF に書き込んで、1つの PDF にまとめる。templates は表ごとの様式の PDF の中身
export async function fillSubmissionPdf(input: {
  templates: Partial<Record<SubmissionTable, Uint8Array | ArrayBuffer>>;
  fontBytes: Uint8Array | ArrayBuffer;
  rows: Pick<SubmissionRow, "table" | "mark" | "key" | "pastInfo">[];
  workerName: string;
  orgName: string;
  past?: Record<string, SubmissionPast>; // 書類のキー → 過去に提出した申請情報
}): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  const black = rgb(0, 0, 0);
  for (const table of submissionPdfTables(input.rows)) {
    const tpl = SUBMISSION_PDF_TEMPLATES[table];
    const bytes = input.templates[table];
    if (!tpl || !bytes) throw new Error(`提出書類一覧表の様式（${table}）がありません`);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    doc.registerFontkit(fontkit);
    const pages = doc.getPages();
    const list = input.rows.filter((r) => r.table === table);
    if (list.length !== tpl.rows.length) {
      throw new Error(`提出書類一覧表の行の数が様式と合いません（${table}: ${list.length} 行 / 様式 ${tpl.rows.length} 行）`);
    }
    // 「有」「無」の文字を丸で囲む
    const r = tpl.markSize * 0.9;
    list.forEach((row, i) => {
      if (!row.mark) return;
      const [pageNo, yesX, noX, y] = tpl.rows[i];
      const page = pages[pageNo];
      if (!page) return;
      const x = row.mark === "有" ? yesX : noX;
      page.drawEllipse({
        x: x + tpl.markSize / 2,
        y: y + tpl.markSize * 0.42,
        xScale: r,
        yScale: r,
        borderColor: black,
        borderWidth: 0.9,
      });
    });
    // 過去に提出した申請情報（pastInfo の行の順に、欄の「・申請年月日」「・受付番号」の下に書く）
    const pastRows = list.filter((row) => row.pastInfo);
    if (tpl.past && pastRows.length === tpl.past.length && pastRows.some((row) => input.past?.[row.key])) {
      // 字形の置き換え（palt など）を切らないと、英字・ハイフンの後の数字の間が空いてしまう（R08-123456 → R0 8 -1 2 …）
      const font = await doc.embedFont(input.fontBytes, {
        subset: false,
        features: { liga: false, kern: false, calt: false, palt: false, locl: false },
      });
      pastRows.forEach((row, i) => {
        const v = input.past?.[row.key];
        if (!v) return;
        const [pageNo, x, dateY, noY] = tpl.past![i];
        const page = pages[pageNo];
        if (!page) return;
        const write = (text: string, y: number) => {
          const t = text.trim();
          if (!t) return;
          let size = 7;
          while (size > 4.5 && font.widthOfTextAtSize(t, size) > 86) size -= 0.5;
          page.drawText(t, { x: x + 5, y: y - 9.5, size, font, color: black });
        };
        write(submissionPastDateText(v.on), dateY);
        write(v.no, noY);
      });
    }
    // 表紙の氏名・所属機関名
    if (tpl.cover && pages[tpl.cover.page]) {
      // subset: true だと文字が欠けることがあるので、フォントはまるごと入れる（参考様式の書き込みと同じ）
      const font = await doc.embedFont(input.fontBytes, { subset: false });
      const page = pages[tpl.cover.page];
      const write = (text: string, y: number) => {
        const t = text.replace(/\s+/g, " ").trim();
        if (!t) return;
        let size = 11;
        while (size > 6 && font.widthOfTextAtSize(t, size) > tpl.cover!.maxWidth) size -= 0.5;
        page.drawText(t, { x: tpl.cover!.x, y, size, font, color: black });
      };
      write(input.workerName, tpl.cover.nameY);
      write(input.orgName, tpl.cover.orgY);
    }
    const copied = await out.copyPages(doc, doc.getPageIndices());
    for (const p of copied) out.addPage(p);
  }
  return out.save();
}
