// freee販売の案件ページを、タブではなく決まった1つの別ウィンドウで開く。
// 請求書作成と横に並べて使うため: 最初のクリックで画面の右半分の大きさで開き、
// 以降はどの機関の「案件」を押しても、同じウィンドウの中身だけが切り替わる
// （タブが増えず、並べた配置もそのまま保てる）。
//
// 同じ名前のウィンドウを使い回すため noopener は付けない
// （noopener を付けると名前が無視されて毎回新しいウィンドウが開いてしまう）。
// 開く先はスタッフが所属機関に登録したリンクだけなので差し支えない。
export function openCaseWindow(url: string): void {
  const width = Math.max(480, Math.floor(window.screen.availWidth / 2));
  const height = window.screen.availHeight;
  const left = window.screen.availWidth - width;
  const win = window.open(
    url,
    "freee-case-window",
    `width=${width},height=${height},left=${left},top=0`,
  );
  // すでに開いているウィンドウを使い回したときは前に出す
  win?.focus();
}
