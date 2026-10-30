-- オンライン申請の受付（メールが2通に分かれて届くことに対応）。
--
-- 1通目「申請受付完了のお知らせ」: 申請種別・整理番号（登録時に入れる。リンクは email_link）
-- 2通目「申請受付番号のお知らせ」: 申請受付日・申請受付仮番号・申請種別・申請人在留カード等番号・
--   申請受付番号（application_no）・メールのリンク（届いたら申請詳細で入れる）
-- どちらもスクリーンショットを申請の画像として残せる（application_files の種別を2つ追加）。
-- 何度実行しても安全（if not exists）
alter table immigration_applications
  add column if not exists online_app_type     text not null default '',  -- 申請種別（例: 在留資格変更許可申請（区分V））
  add column if not exists online_ref_no       text not null default '',  -- 整理番号（1通目）
  add column if not exists online_received_on  date,                      -- 申請受付日（2通目）
  add column if not exists online_temp_no      text not null default '',  -- 申請受付仮番号（2通目）
  add column if not exists online_card_no      text not null default '',  -- 申請人在留カード等番号（2通目）
  add column if not exists online_mail2_link   text not null default '';  -- 2通目のメールのリンク

comment on column immigration_applications.online_ref_no is 'オンライン申請 1通目のメール（申請受付完了のお知らせ）の整理番号';
comment on column immigration_applications.online_temp_no is 'オンライン申請 2通目のメールの申請受付仮番号';

-- 0206 の「受付仮番号メール」も含めておく（0206 のあとに流し直しても、登録済みの画像で制約違反にならないように）
alter table application_files drop constraint if exists application_files_kind_check;
alter table application_files add constraint application_files_kind_check
  check (kind in ('受付票', '通知書', '在留カード', '照合結果', '指定書', '追加資料通知', '受付完了メール', '受付仮番号メール', '受付番号メール', 'その他'));
