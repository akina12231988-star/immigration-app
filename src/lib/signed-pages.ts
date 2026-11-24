// 「本人に署名してもらうページだけ」の PDF に本人が署名したもの（スキャン・写真）を取り込み、
// 様式ごとの全部のページの PDF の署名ページだけを差し替える。
//
// 署名ページだけの PDF は、様式の順（ダウンロードしたときと同じ順）に、各様式の署名ページを
// ページの順に並べたもの。取り込んだ PDF のページを前から順に、同じ順で各様式の署名ページに当てはめる。

export interface SignedFormPages {
  key: string;
  pageCount: number; // 様式の全部のページの数（1-17号の名簿など、後ろに足すページも含む）
  signPages: number[] | undefined; // 署名ページ（0 始まり）。undefined = 全部のページ（署名だけの書類）
}

export interface SignedReplacePlan {
  key: string;
  // 様式のページ番号 → 取り込んだ PDF のページ番号（0 始まり）
  replace: [number, number][];
}

// 様式ごとの「どのページを、取り込んだ PDF のどのページに差し替えるか」と、取り込む PDF のページ数
export function signedReplacePlan(forms: SignedFormPages[]): { plans: SignedReplacePlan[]; total: number } {
  let next = 0;
  const plans: SignedReplacePlan[] = [];
  for (const f of forms) {
    const pages = (f.signPages ?? Array.from({ length: f.pageCount }, (_, i) => i)).filter((p) => p >= 0 && p < f.pageCount);
    if (pages.length === 0) continue;
    plans.push({ key: f.key, replace: pages.map((p) => [p, next++] as [number, number]) });
  }
  return { plans, total: next };
}

// 取り込んだページ数が合わないときの説明（例: 「署名ページは全部で5ページ（1-5号 2ページ・1-6号 1ページ…）ですが、取り込んだ PDF は4ページです」）
export function signedPageCountMessage(
  plans: SignedReplacePlan[],
  total: number,
  got: number,
  nameOf: (key: string) => string,
): string | null {
  if (total === got) return null;
  const detail = plans.map((p) => `${nameOf(p.key)} ${p.replace.length}ページ`).join("・");
  return `署名ページは全部で${total}ページ（${detail}）ですが、取り込んだファイルは${got}ページです。ダウンロードしたときと同じ順・同じページ数で取り込んでください。`;
}
