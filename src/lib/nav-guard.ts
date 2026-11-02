// 保存していない変更があるときに、画面を離れる前に確認するための仕組み。
// 画面（所属機関・外国人詳細）が「今は離れる前に確認が必要」を登録し、
// サイト内の「←」ボタン（BackButton）はここを見てから移動する。
// リンクのクリックは UnsavedChangesGuard が拾う。

type Guard = (proceed: () => void) => boolean; // true を返したら移動を止めて確認を出した

// 1つの画面に確認が複数あることがある（外国人詳細の本体と「扶養家族」の枠など）ので、全部を持つ
const guards = new Set<Guard>();

// 確認を登録する。戻り値を呼ぶと外す
export function addNavGuard(guard: Guard): () => void {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

// 以前の1つだけ登録する形（null で全部外す）。テストなどで使う
export function setNavGuard(guard: Guard | null): void {
  guards.clear();
  if (guard) guards.add(guard);
}

// 移動してよいか確かめる。どれかが確認を出したら proceed を預けて false を返す
export function checkNavGuard(proceed: () => void): boolean {
  for (const g of guards) {
    if (g(proceed)) return false;
  }
  return true;
}

// クリックされたリンクを、この画面から離れるサイト内の移動として扱うか
export function isInternalNavigation(
  anchor: { href: string; target: string; hasAttribute(name: string): boolean },
  here: { origin: string; pathname: string; search: string },
  event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false; // 新しいタブで開くリンク（印刷など）は離れない
  if (anchor.hasAttribute("download")) return false;
  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return false;
  }
  if (url.origin !== here.origin) return true; // 外のサイトへ移る
  // 同じページの中の移動（#だけ違う）は離れない
  return url.pathname !== here.pathname || url.search !== here.search;
}
