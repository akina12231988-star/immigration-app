// 保存していない変更があるときに、画面を離れる前に確認するための仕組み。
// 画面（所属機関・外国人詳細）が「今は離れる前に確認が必要」を登録し、
// サイト内の「←」ボタン（BackButton）はここを見てから移動する。
// リンクのクリックは UnsavedChangesGuard が拾う。

type Guard = (proceed: () => void) => boolean; // true を返したら移動を止めて確認を出した

let current: Guard | null = null;

export function setNavGuard(guard: Guard | null): void {
  current = guard;
}

// 移動してよいか確かめる。確認が必要なら proceed を預けて false を返す
export function checkNavGuard(proceed: () => void): boolean {
  if (!current) return true;
  return !current(proceed);
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
