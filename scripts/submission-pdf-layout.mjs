// 入管の「提出書類一覧表」の PDF から、提出確認欄の「有」「無」の位置と、表紙の氏名・所属機関名の位置を読み取る。
// 新しい一覧表（例: 特定技能2号）の PDF を public/forms/ に置いたら、これで座標を出して
// src/lib/submission-pdf.ts の SUBMISSION_PDF_TEMPLATES に書き写す。
//   node scripts/submission-pdf-layout.mjs public/forms/submission-ssw1.pdf
// 出力: 「有」「無」の行（上から順・ページごと）。右側の官用欄（x が大きい方）は除く。座標は左下が原点の pt。
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const file = process.argv[2];
if (!file) {
  console.error("使い方: node scripts/submission-pdf-layout.mjs <PDF>");
  process.exit(1);
}
const doc = await getDocument({
  data: new Uint8Array(readFileSync(file)),
  cMapUrl: new URL("../node_modules/pdfjs-dist/cmaps/", import.meta.url).pathname,
  cMapPacked: true,
}).promise;

const round = (n) => Math.round(n * 10) / 10;
const out = { rows: [], cover: null };
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const { items } = await page.getTextContent();
  const marks = items.filter((i) => /^(有|無)$/.test(i.str.trim()));
  // 提出確認欄は左側、官用欄は右側。ページの中で x が小さい方の「有」を提出確認欄とする
  const yesXs = [...new Set(marks.filter((i) => i.str.trim() === "有").map((i) => round(i.transform[4])))].sort((a, b) => a - b);
  const leftYesX = yesXs[0];
  const ys = [...new Set(marks.filter((i) => i.str.trim() === "有" && round(i.transform[4]) === leftYesX).map((i) => round(i.transform[5])))].sort((a, b) => b - a);
  for (const y of ys) {
    const yes = marks.find((i) => i.str.trim() === "有" && round(i.transform[4]) === leftYesX && round(i.transform[5]) === y);
    const no = marks
      .filter((i) => i.str.trim() === "無" && round(i.transform[5]) === y && i.transform[4] > yes.transform[4])
      .sort((a, b) => a.transform[4] - b.transform[4])[0];
    out.rows.push({ page: p - 1, yes: [round(yes.transform[4]), y], no: [round(no.transform[4]), y], size: round(yes.height) });
  }
  // 表紙: 「申請人の氏名」（1文字ずつ離れていることがある）と「特定技能所属機関の名称」
  const nameLabel = items.find((i) => i.str.trim() === "名" && items.some((j) => j.str.trim() === "申" && round(j.transform[5]) === round(i.transform[5])));
  const orgLabel = items.find((i) => i.str.includes("所属機関の名称"));
  if (nameLabel && orgLabel && !out.cover) {
    out.cover = { page: p - 1, nameY: round(nameLabel.transform[5]), orgY: round(orgLabel.transform[5]) };
  }
}
console.log(JSON.stringify(out));
