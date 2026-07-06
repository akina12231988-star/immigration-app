# 認証情報セットアップ チェックリスト

Stage 3〜7（Google ログイン、Sheets/Drive連携、OCR、Notion連携）を実装する前に、以下を準備してください。開発は並行して進められますが、実機能テストにはこれらの認証情報が必要です。

## 1. Google Cloud プロジェクト作成

1. https://console.cloud.google.com/ で新規プロジェクトを作成
2. 以下の API を有効化する
   - Google Sheets API
   - Google Drive API
   - Cloud Vision API

## 2. サービスアカウント作成（Sheets / Drive / Vision 用）

1. 「IAMと管理」→「サービスアカウント」→ 新規作成
2. ロールは最小権限で付与（Vision API 利用者、必要に応じて追加）
3. 「鍵を追加」→ JSON形式でダウンロード（**このファイルは絶対にリポジトリにコミットしない**）
4. 対象の Google スプレッドシートと Drive フォルダを、このサービスアカウントのメールアドレス（`xxxx@xxxx.iam.gserviceaccount.com`）に「編集者」として共有する

## 3. OAuth 2.0 クライアントID作成（Google ログイン用）

1. 「APIとサービス」→「認証情報」→「OAuth クライアント ID」を作成
2. アプリケーションの種類: ウェブアプリケーション
3. 承認済みのリダイレクト URI に以下を追加
   - 開発用: `http://localhost:3000/api/auth/callback/google`
   - 本番用（Vercel）: `https://<本番ドメイン>/api/auth/callback/google`
4. OAuth 同意画面で、社内利用者のみアクセスできるよう設定（テストユーザー登録 or 内部利用設定）

## 4. Notion Integration 作成

1. https://www.notion.so/my-integrations で新規 Integration を作成
2. 発行された Internal Integration Token を控える
3. 同期先にする Notion Database（またはこれから作成するテンプレート）にこの Integration を招待する（データベースページ右上の「接続」から追加）

## 5. Vercel 環境変数一覧（値は準備でき次第、後で設定）

| 環境変数名 | 用途 |
|---|---|
| `GOOGLE_CLIENT_ID` | Google ログイン (OAuth) |
| `GOOGLE_CLIENT_SECRET` | Google ログイン (OAuth) |
| `NEXTAUTH_SECRET` | NextAuth.js セッション暗号化キー |
| `NEXTAUTH_URL` | 本番URL |
| `ALLOWED_EMAIL_DOMAIN` または `ALLOWED_EMAILS` | 社内ログイン許可リスト |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | サービスアカウント |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | サービスアカウント秘密鍵 |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | 対象スプレッドシートID |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | 画像保存先ルートフォルダID |
| `GOOGLE_VISION_PROJECT_ID` | Vision API 用（サービスアカウント経由なら鍵情報と共通） |
| `NOTION_API_KEY` | Notion Integration Token |
| `NOTION_DATABASE_ID` | 同期先データベースID |

## 補足

- 上記がすべて揃っていなくても Stage 2（画面デザイン）は進行可能です
- Stage 3（Google ログイン）着手時までに 1〜3 の準備を、Stage 6（OCR）までに Vision API 有効化を、Stage 7（Notion連携）までに 4 の準備をお願いします
