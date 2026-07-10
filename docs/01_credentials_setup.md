# 認証情報セットアップ チェックリスト

Google Cloud のプロジェクト作成・請求先アカウント登録を避けるため、Google Sheets / Drive への読み書きは **Google Apps Script（GAS）のウェブアプリ**経由で行う方式に変更した（詳細設計は [docs/00_system_design.md](./00_system_design.md) 参照）。OCRも不採用（全項目手入力）としたため、Google Cloud / Vision API のセットアップは不要。

## 1. Google Apps Script ウェブアプリ（Sheets / Drive 用・完了）

1. Googleスプレッドシートを新規作成し、シート名を「申請管理台帳」に変更
2. 「拡張機能」→「Apps Script」を開き、[docs/apps-script/Code.gs](./apps-script/Code.gs) の中身を貼り付け
3. `SECRET` 定数をランダムな文字列に変更
4. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」、実行者「自分」、アクセス「全員」で公開
5. 発行されたURL（`https://script.google.com/macros/s/.../exec`）を控える

コードを更新した場合は、「デプロイ」→「デプロイを管理」→編集→バージョン「新バージョン」→「デプロイ」で反映すること（保存だけでは公開中のURLに反映されない）。

## 2. OAuth 2.0 クライアントID作成（Google ログイン用・Stage3で使用）

1. https://console.cloud.google.com/ で新規プロジェクトを作成（こちらもAPI有効化やサービスアカウントは不要。ログイン機能のみのため請求設定も不要）
2. 「APIとサービス」→「認証情報」→「OAuth クライアント ID」を作成
3. アプリケーションの種類: ウェブアプリケーション
4. 承認済みのリダイレクト URI に以下を追加
   - 開発用: `http://localhost:3000/api/auth/callback/google`
   - 本番用（Vercel）: `https://<本番ドメイン>/api/auth/callback/google`
5. OAuth 同意画面で、社内利用者のみアクセスできるよう設定（テストユーザー登録 or 内部利用設定）

## 3. Notion Integration 作成（Stage7で使用）

1. https://www.notion.so/my-integrations で新規 Integration を作成
2. 発行された Internal Integration Token を控える
3. 同期先にする Notion Database（またはこれから作成するテンプレート）にこの Integration を招待する（データベースページ右上の「接続」から追加）

## 4. 環境変数一覧

ローカルでは `.env.local`（Git管理対象外）、本番では Vercel の Environment Variables に設定する。

| 環境変数名 | 用途 | 状態 |
|---|---|---|
| `GAS_WEB_APP_URL` | Apps ScriptウェブアプリのURL | ✅ 設定済み |
| `GAS_SECRET` | Apps Script側と共有する合言葉 | ✅ 設定済み |
| `GOOGLE_CLIENT_ID` | Google ログイン (OAuth) | 未設定 |
| `GOOGLE_CLIENT_SECRET` | Google ログイン (OAuth) | 未設定 |
| `NEXTAUTH_SECRET` | NextAuth.js セッション暗号化キー | 未設定 |
| `NEXTAUTH_URL` | 本番URL | 未設定 |
| `ALLOWED_EMAIL_DOMAIN` または `ALLOWED_EMAILS` | 社内ログイン許可リスト | 未設定 |
| `NOTION_API_KEY` | Notion Integration Token | 未設定 |
| `NOTION_DATABASE_ID` | 同期先データベースID | 未設定 |

**重要:** `GAS_WEB_APP_URL` / `GAS_SECRET` はローカルの `.env.local` には設定済みだが、**Vercel側にはまだ設定していない**。Vercelにデプロイした版でGoogleスプレッドシート連携を動かすには、Vercelのプロジェクト設定 → Environment Variables で同じ2つの値を追加する必要がある。

## 補足

- Stage 3（Google ログイン）着手時までに 2 の準備を、Stage 7（Notion連携）までに 3 の準備をお願いします
