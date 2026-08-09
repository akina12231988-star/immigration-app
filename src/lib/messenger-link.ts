// Messenger のリンクを、アプリではなくブラウザ（messenger.com）で開くための変換。
//
// m.me のリンクはスマホで開くと Messenger アプリに飛んでしまい、
// 端末によってアプリが開いたりブラウザが開いたりとバラバラだった。
// どの画面から開いても同じようにブラウザで開くよう、www.messenger.com の形にそろえる。
//   https://m.me/<相手>            → https://www.messenger.com/t/<相手>
//   https://m.me/j/<グループ招待>   → https://www.messenger.com/j/<グループ招待>
//   https://www.facebook.com/messages/t/<相手> → https://www.messenger.com/t/<相手>
//   すでに messenger.com の形・その他のリンクはそのまま返す
export function messengerWebUrl(link: string): string {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return link; // URLとして読めない値はそのまま（画面側の表示を壊さない）
  }
  const host = url.hostname.toLowerCase();

  if (host === "m.me" || host === "www.m.me") {
    const path = url.pathname.replace(/\/+$/, "");
    // /t/… /j/… はそのまま、/<相手> は /t/<相手> にする
    const webPath = /^\/(t|j)\//.test(path) ? path : `/t${path}`;
    return `https://www.messenger.com${webPath}${url.search}`;
  }

  if (
    (host === "facebook.com" || host === "www.facebook.com" || host === "m.facebook.com") &&
    url.pathname.startsWith("/messages/t/")
  ) {
    return `https://www.messenger.com/t/${url.pathname.slice("/messages/t/".length)}${url.search}`;
  }

  return link;
}
