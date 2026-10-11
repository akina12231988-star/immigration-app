# 認証メールの日本語テンプレート

Supabase が送る認証メール（職員の招待・パスワードの再設定など）は、初期設定では英語の文面
（「You've been invited」「Reset Password」）です。
このフォルダの HTML を Supabase のダッシュボードに貼り付けると、日本語の文面になります。

メールの文面はコードからは変えられず、ダッシュボードで設定します（一度設定すれば以後ずっと有効）。

## 設定手順（約5分）

1. https://supabase.com/dashboard でプロジェクトを開く
2. 左メニュー **Authentication → URL Configuration** を開き、**Site URL** が
   アプリのアドレス（例: `https://＜アプリのドメイン＞`。末尾の `/` は付けない）になっているか確認する。
   違っていれば直して Save する（メールのリンク先はこの Site URL から作られる）
3. 左メニュー **Authentication → Emails**（古い画面では Email Templates）を開く
4. 下の表の各テンプレートについて、**Subject heading**（件名）を書き換え、**Message body（Source）** の中身を
   同じ名前の HTML ファイルの内容で**すべて置き換えて** Save する

| テンプレート（ダッシュボードの名前） | 件名に入れる文 | 貼り付けるファイル |
|---|---|---|
| Invite user | 【在留資格申請管理システム】職員としての招待 | `invite.html` |
| Reset password | 【在留資格申請管理システム】パスワードの再設定 | `recovery.html` |
| Magic Link | 【在留資格申請管理システム】ログイン用のリンク | `magic_link.html` |
| Confirm signup | 【在留資格申請管理システム】メールアドレスの確認 | `confirmation.html` |
| Change email address | 【在留資格申請管理システム】メールアドレスの変更の確認 | `email_change.html` |
| Reauthentication | 【在留資格申請管理システム】本人確認のコード | `reauthentication.html` |

ふだん使うのは **Invite user** と **Reset password** の2つです。残りは使う場面がほぼ無いので、後回しでもかまいません。

## このテンプレートのリンクの仕組み

リンクは `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=…` の形にしています。
初期設定の `{{ .ConfirmationURL }}` と違い、**メールを開いた端末がどれでも**（パソコンで送ってスマホで開いても）
そのままパスワードを決められます。アプリ側（`/reset-password`）はどちらの形のリンクでも受け取れるので、
テンプレートを変える前に送ったメールのリンクもそのまま使えます。

## 差出人の名前（任意）

差出人が「Supabase Auth」と出るのは Supabase の共用メールサーバーを使っているためです。
差出人名を会社名にしたいときは **Project Settings → Authentication → SMTP Settings** で
自社のメール（Google Workspace など）を「Custom SMTP」として設定します（設定しなくてもメールは届きます）。
