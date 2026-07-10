# 認証情報セットアップ チェックリスト

Google Cloud のプロジェクト作成・請求先アカウント登録を避けるため、Google Sheets / Drive への読み書きは **Google Apps Script（GAS）のウェブアプリ**経由で行う方式に変更した（詳細設計は [docs/00_system_design.md](./00_system_design.md) 参照）。OCRも不採用（全項目手入力）としたため、Google Cloud / Vision API のセットアップは不要。

## 1. Google Apps Script ウェブアプリ（Sheets / Drive 用・完了）

1. Googleスプレッドシートを新規作成し、シート名を「申請管理台帳」に変更
2. 「拡張機能」→「Apps Script」を開き、[docs/apps-script/Code.gs](./apps-script/Code.gs) の中身を貼り付け
3. `SECRET` 定数をランダムな文字列に変更
4. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」、実行者「自分」、アクセス「全員」で公開
5. 発行されたURL（`https://script.google.com/macros/s/.../exec`）を控える

コードを更新した場合は、「デプロイ」→「デプロイを管理」→編集→バージョン「新バージョン」→「デプロイ」で反映すること（保存だけでは公開中のURLに反映されない）。

## 2. ログイン機能（社内共通ID・パスワード方式・完了）

Googleアカウント連携（OAuth）は使わず、社内共通のログインID・パスワードで保護する方式にした。

- 初回は仮のID・パスワード（`admin` / `change-me-123`）でログイン可能
- ログイン後、右上の歯車アイコン →「ログイン設定」からいつでもID・パスワードを変更できる
- パスワードはハッシュ化してGAS（PropertiesService）に保存され、平文では保存されない
- セッションの署名に使う `AUTH_SECRET` をランダムな文字列で発行し、`.env.local` に設定済み（済み・追加設定不要）

## 3. Notion Integration 作成（Stage7で使用）

1. https://www.notion.so/my-integrations で新規 Integration を作成
2. 発行された Internal Integration Token を控える
3. 同期先にする Notion Database（またはこれから作成するテンプレート）にこの Integration を招待する（データベースページ右上の「接続」から追加）

## 4. 環境変数一覧

ローカルでは `.env.local`（Git管理対象外）、本番では Vercel の Environment Variables に設定する。

| 環境変数名 | 用途 | 状態 |
|---|---|---|
| `GAS_WEB_APP_URL` | Apps ScriptウェブアプリのURL | ✅ 設定済み（ローカルのみ） |
| `GAS_SECRET` | Apps Script側と共有する合言葉 | ✅ 設定済み（ローカルのみ） |
| `AUTH_SECRET` | ログインセッションの署名鍵 | ✅ 設定済み（ローカルのみ） |
| `NOTION_API_KEY` | Notion Integration Token | 未設定 |
| `NOTION_DATABASE_ID` | 同期先データベースID | 未設定 |

**重要:** 上記3つ（`GAS_WEB_APP_URL` / `GAS_SECRET` / `AUTH_SECRET`）はローカルの `.env.local` には設定済みだが、**Vercel側にはまだ設定していない**。Vercelにデプロイした版でGoogleスプレッドシート連携・ログイン機能を動かすには、Vercelのプロジェクト設定 → Environment Variables で同じ3つの値を追加する必要がある。

## 補足

- Stage 7（Notion連携）までに 3 の準備をお願いします
