// サイト内で表示した画面の履歴（「戻る」ボタン用）。
//
// ブラウザの履歴（history.back）は、印刷用ページや置き換え移動（replace）のあとで
// 思ったところへ戻れないことがある。そこで、表示した画面のURLを自分でも積んでおき、
// 「戻る」は1つ前に表示していた画面へ移動する。タブごとに sessionStorage に持つ。

const KEY = "nav-history";
const MAX = 50;

export function readNavHistory(): string[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeNavHistory(list: string[]): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    // 保存できなくても画面は動く（戻る先はブラウザ履歴に任せる）
  }
}

// 表示した画面を履歴に足す。
//  ・同じ画面の再表示（更新など）は足さない
//  ・1つ前の画面に戻ってきた（ブラウザの戻るなど）ときは、最後の1件を外す
export function pushNavHistory(url: string): void {
  const list = readNavHistory();
  if (list[list.length - 1] === url) return;
  if (list.length >= 2 && list[list.length - 2] === url) {
    writeNavHistory(list.slice(0, -1));
    return;
  }
  writeNavHistory([...list, url]);
}

// 「戻る」で移動する先（1つ前に表示していた画面）。無ければ null。
// 移動先を返すと同時に、今の画面を履歴から外す（戻った先が最後になる）
export function popNavHistory(current: string): string | null {
  const list = readNavHistory();
  // 末尾が今の画面なら外し、その1つ前が戻る先
  const rest = list[list.length - 1] === current ? list.slice(0, -1) : list;
  const prev = rest[rest.length - 1];
  if (!prev || prev === current) return null;
  writeNavHistory(rest);
  return prev;
}
