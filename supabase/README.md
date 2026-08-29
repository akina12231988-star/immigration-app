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

## 5. バックアップ（手動）

無料プランには自動バックアップが付かない。ダッシュボードの **Database ＞ Backups**
を開いても「Pro プラン以上で利用できます」と出るだけで、落とせるファイルは無い
（トップの `LAST BACKUP: No backups` はこのため）。

在留資格の管理データは消えると取り返しがつかないので、**月に1回**を目安に
自分で吸い出して保管する。所要時間は数分。

> **かんたんな方法（ふだんはこちら）**: アプリの
> **ホーム ＞ 特定技能・管理メニュー ＞ バックアップ**（管理者のみ）を開くと、
> 全テーブルのデータを1つの JSON ファイルでダウンロードできる。CLI は不要。
> 添付ファイル（Storage）とログインアカウントが含まれない点は下と同じ。
> 以下の CLI の手順は、SQL 形式（psql でそのまま戻せる形）が欲しいときに使う。

### 準備（初回だけ）

1. Supabase CLI を入れる

   ```bash
   npm install -g supabase
   ```

2. プロジェクトにつなぐ（`<プロジェクトRef>` は Project URL の
   `https://<ここ>.supabase.co` の部分）

   ```bash
   supabase link --project-ref <プロジェクトRef>
   ```

   データベースのパスワードを聞かれる。分からなければ
   **Settings ＞ Database ＞ Database password ＞ Reset database password** で
   作り直す（アプリは `NEXT_PUBLIC_SUPABASE_ANON_KEY` でつなぐので、
   ここを変えてもアプリは止まらない）。

### 毎回の手順

```bash
# 保管用のフォルダへ移動（例）
cd ~/Documents/immigration-app-backup

# 1) 中身（データ）… これがいちばん大事
supabase db dump -f "data-$(date +%Y%m%d).sql" --data-only

# 2) 入れもの（テーブルの形）… 作り直すときに要る
supabase db dump -f "schema-$(date +%Y%m%d).sql"
```

`data-20260827.sql` と `schema-20260827.sql` の2つができる。
この2つを Google ドライブなど、**Supabase とは別の場所**に置いておく。

### 気をつけること

- **添付ファイルは含まれない。** 在留カードの画像・PDFなどは Storage にあり、
  上のコマンドでは落ちてこない。必要なら **Storage ＞ 各バケット** から
  まとめてダウンロードする
- **ログインユーザーは含まれない。** 職員のアカウントは `auth` スキーマにあり、
  上のコマンドの対象外。人数が少ないので、消えたら招待し直せばよい
- 落としたファイルには全員分の個人情報が入っている。**共有フォルダに置かない**

### 戻すとき

```bash
psql "<Settings ＞ Database ＞ Connection string の URI>" -f schema-20260827.sql
psql "<同上>" -f data-20260827.sql
```

戻すのは事故のときだけなので、迷ったら実行する前に相談する。

## 6. 型の自動生成

スキーマ変更のたびに実行:

```bash
supabase gen types typescript --linked > src/types/supabase.ts
```
