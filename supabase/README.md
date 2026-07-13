# Supabase セットアップ手順

DBの設計意図は `docs/03_database_design.md` を参照。

## 1. プロジェクト作成

1. https://supabase.com/dashboard で新規プロジェクトを作成（リージョン: **Northeast Asia (Tokyo)**）
2. Authentication → Providers → **Email** を有効化（メール＋パスワードログイン）。Confirm email は社内運用に合わせて任意
3. Authentication → Sign In / Up → **Allow new users to sign up を無効化**（職員は管理者の招待制のため）

## 2. マイグレーション適用

方法A（推奨・Supabase CLI）:

```bash
supabase link --project-ref <プロジェクトRef>
supabase db push
```

方法B（ダッシュボード）: SQL Editor で `migrations/0001` から最新番号まで番号順に実行する。
（適用済みの環境に新しいマイグレーションが増えた場合は、その番号のファイルだけを実行すればよい）

## 3. 最初の管理者を作成

1. Authentication → Users → **Invite user** で自分のメールを招待し、パスワードを設定
2. SQL Editor で管理者に昇格:

```sql
update profiles set role = 'admin' where email = '<自分のメールアドレス>';
```

以降の職員追加・権限変更はアプリの `/admin/users` 画面（Phase 2 実装）から行える。

## 4. 環境変数（`.env.local` / Vercel）

| 変数 | 取得場所 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同 → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | 同 → service_role key（**サーバー専用・絶対に公開しない**） |

## 5. 型の自動生成

スキーマ変更のたびに実行:

```bash
supabase gen types typescript --linked > src/types/supabase.ts
```
