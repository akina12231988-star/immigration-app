-- 見積書（新規のお客様向けの料金の一覧）と、その後のやりとりの記録。
-- 合計金額は出さず、項目ごとの金額（税抜）を一覧にする（変更申請の取次費・事前ガイダンス・
-- 生活オリエンテーション・毎月の支援代・更新申請・収入印紙代・特定技能総合保険・紹介手数料など）。
-- 宛先はアプリに登録済みの所属機関（organization_id）でも、まだ登録していない会社（名前を手で入力）でもよい。
--
-- quotes … 見積書1通ごとに1件
--   organization_id   … 登録済みの所属機関（無ければ null。所属機関を消しても見積書は残す）
--   addressee_name    … 宛先の会社名（所属機関を選んだときもその時点の名前を残す）
--   addressee_person  … 担当者・代表者（例: 代表取締役 山田太郎）
--   addressee_address … 宛先の住所
--   issued_on・number・subject … 見積日・見積書番号・件名
--   items  … 項目 [{ name, price（税抜・数字。null = 空欄）, unit（1人あたり・毎月など）, taxFree, note }]
--   notes  … 備考
--   show_stamp_table … 収入印紙代（在留期間ごと）の表を載せるか
--   status … 作成中 / 送付済 / 検討中 / 受注 / 見送り
--   events … やりとりの記録 [{ id, on（YYYY-MM-DD）, kind（送付・電話・メール・訪問…）, body }]
--   honorific … 宛先の敬称（'' = 自動（会社・法人なら御中）/ 御中 / 様 / なし）
--   online_fee … オンライン申請の決済手数料（1件・円）。印紙代の表のオンラインの金額に足して出す（null = 足さない）
--   attachment_ids … 一緒に印刷する別紙（quote_attachments の id の配列。特定技能総合保険の案内など）
--
-- quote_attachments … 見積書に付ける別紙のファイル（PDF・画像）。一度登録すれば、どの見積書にも付けられる。
--   ファイルは非公開バケット app-files の quote-attachments/ に置く
-- 何度実行しても安全。

create table if not exists quotes (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid references organizations (id) on delete set null,
  addressee_name    text not null default '',
  addressee_person  text not null default '',
  addressee_address text not null default '',
  issued_on         date,
  number            text not null default '',
  subject           text not null default '',
  items             jsonb not null default '[]'::jsonb,
  notes             text not null default '',
  show_stamp_table  boolean not null default true,
  status            text not null default '作成中',
  events            jsonb not null default '[]'::jsonb,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 2回目の適用（列を足した版）でも安全なように、あとから足した列は add column if not exists で足す
alter table quotes add column if not exists honorific text not null default '';
alter table quotes add column if not exists online_fee integer;
alter table quotes add column if not exists attachment_ids jsonb not null default '[]'::jsonb;

create table if not exists quote_attachments (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '',
  storage_path text not null,
  file_name    text not null default '',
  mime_type    text not null default '',
  uploaded_by  uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

alter table quote_attachments enable row level security;
drop policy if exists sel_quote_attachments on quote_attachments;
drop policy if exists ins_quote_attachments on quote_attachments;
drop policy if exists upd_quote_attachments on quote_attachments;
drop policy if exists del_quote_attachments on quote_attachments;
create policy sel_quote_attachments on quote_attachments for select using (my_role() is not null);
create policy ins_quote_attachments on quote_attachments for insert with check (my_role() in ('admin', 'staff'));
create policy upd_quote_attachments on quote_attachments for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_quote_attachments on quote_attachments for delete using (my_role() in ('admin', 'staff'));

create index if not exists quotes_org on quotes (organization_id, issued_on desc);
create index if not exists quotes_updated on quotes (updated_at desc);

alter table quotes enable row level security;

-- 閲覧: ログイン者全員 / 追加・更新・削除: admin・staff
drop policy if exists sel_quotes on quotes;
drop policy if exists ins_quotes on quotes;
drop policy if exists upd_quotes on quotes;
drop policy if exists del_quotes on quotes;
create policy sel_quotes on quotes for select using (my_role() is not null);
create policy ins_quotes on quotes for insert with check (my_role() in ('admin', 'staff'));
create policy upd_quotes on quotes for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_quotes on quotes for delete using (my_role() in ('admin', 'staff'));

drop trigger if exists quotes_updated on quotes;
create trigger quotes_updated before update on quotes
  for each row execute procedure moddatetime(updated_at);

notify pgrst, 'reload schema';
