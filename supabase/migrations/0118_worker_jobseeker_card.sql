-- 求職票（求職申込書）で足す項目を1つの jsonb にまとめて持つ。
--
-- 電話番号・希望勤務地・希望賃金・就業できる時期・その他の希望は、
-- 求職票にしか出てこない内容なので列を増やさず jsonb に入れる。
-- 中身の例: {"phone":"090-...","desired_location":"熊本県八代市",
--            "desired_wage":"時給1,050円","available_from":"2026-09-01","other_wish":""}
alter table workers add column if not exists jobseeker_card jsonb not null default '{}'::jsonb;
