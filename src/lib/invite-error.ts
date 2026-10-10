// 職員の招待（Supabase の inviteUserByEmail）が失敗したときの日本語の案内。
// 英語のまま出すと何をすればよいか分からないので、よくある失敗は理由と次の手を書く

export function inviteErrorMessage(message: string | undefined): string {
  const m = message ?? "";
  if (/already been registered|already registered|already exists/i.test(m)) {
    return (
      "このメールアドレスはすでに登録されています。下の職員一覧にあれば招待は要りません（無効なら「有効化」、権限はロールの欄で変えられます）。" +
      "一覧に無い・パスワードを設定できていないときは、Supabase ダッシュボードの Authentication ＞ Users でそのメールアドレスを探し、" +
      "「Send password recovery」でパスワード設定のメールを送るか、いったん削除してからもう一度招待してください。"
    );
  }
  if (/invalid email|unable to validate email/i.test(m)) {
    return "メールアドレスの形式が正しくありません";
  }
  if (/rate limit|too many/i.test(m)) {
    return "短い時間に招待メールを送りすぎました。しばらく待ってからもう一度お試しください";
  }
  return m ? `招待に失敗しました: ${m}` : "招待に失敗しました";
}
