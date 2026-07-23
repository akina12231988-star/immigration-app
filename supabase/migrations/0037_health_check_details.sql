-- 健康診断書の詳細（受診項目チェック・就労可の後日結果）。外国人1人につき1件。
-- 健康診断書ファイル自体は onboarding_documents（doc_key='kenshin'）、受診日は workers.health_check_on。
create table if not exists health_check_details (
  worker_id       uuid primary key references workers (id) on delete cascade,
  -- '' 未選択 / 'official' 公式様式(1〜3号) / 'hospital' 病院書式
  form_type       text not null default '' check (form_type in ('', 'official', 'hospital')),
  checked_items   text not null default '',   -- 病院書式のとき: 確認済み受診項目IDのカンマ区切り
  needs_followup  boolean not null default false, -- 公式様式で「要精査等・就労可を後日もらう必要」
  followup_memo   text not null default '',   -- 後日診断結果をもらう旨のメモ
  followup_result text not null default '',   -- その後の結果（就労可 など）
  updated_at      timestamptz not null default now()
);

alter table health_check_details enable row level security;

create policy sel_health_check on health_check_details for select
  using (my_role() is not null);
create policy ins_health_check on health_check_details for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_health_check on health_check_details for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));

create trigger health_check_details_updated before update on health_check_details
  for each row execute procedure moddatetime(updated_at);
