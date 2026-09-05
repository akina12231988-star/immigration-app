-- 在籍していた時（過去の在籍期間）の在留カード情報。
--
-- A4印刷（個人）で「その会社にいたときの在留カード情報」で印刷できるようにする。
-- 在留カード番号・在留資格・許可日・在留期限は workers に「今の値」しか無く、
-- 転職や更新をすると当時の内容が分からなくなるため、在籍期間ごとに残しておく。
-- 画像（在留カード・指定書）は worker_documents の effective_on で期間に振り分けており、
-- こちらはその文字の情報を入れる場所。
--
-- period_key は在籍期間の「開始日_終了日」（lib/worker-period-cards.ts の periodCardKey）。
-- 職歴を足しても番号がずれないよう、日付をキーにしている。
-- すべて冪等（何度実行してもエラーにならない）。
create table if not exists worker_period_cards (
  id                    uuid primary key default gen_random_uuid(),
  worker_id             uuid not null references workers (id) on delete cascade,
  period_key            text not null,               -- 在籍期間のキー（開始日_終了日）
  org_name              text not null default '',    -- そのときの所属機関名（表示用のスナップショット）
  period_start          date,                        -- 在籍期間の開始日
  period_end            date,                        -- 在籍期間の終了日（退職日）
  residence_card_no     text not null default '',    -- そのときの在留カード番号
  residence_status      text not null default '',    -- そのときの在留資格
  residence_permit_date date,                        -- そのときの許可日
  residence_expiry_date date,                        -- そのときの在留期限
  employment_start_on   date,                        -- そのときの雇用開始日
  leaving_on            date,                        -- 退職日
  note                  text not null default '',
  created_by            uuid references profiles (id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- 1つの在籍期間につき1件（入力し直したら上書きする）
create unique index if not exists idx_worker_period_cards_key
  on worker_period_cards (worker_id, period_key);

comment on table public.worker_period_cards is
  '在籍していた時（過去の在籍期間）の在留カード情報。A4印刷（個人）で当時の内容を出すために使う';
comment on column public.worker_period_cards.period_key is
  '在籍期間のキー（開始日_終了日）。lib/worker-period-cards.ts の periodCardKey と同じ形';

alter table worker_period_cards enable row level security;
drop policy if exists sel_worker_period_cards on worker_period_cards;
drop policy if exists ins_worker_period_cards on worker_period_cards;
drop policy if exists upd_worker_period_cards on worker_period_cards;
drop policy if exists del_worker_period_cards on worker_period_cards;
create policy sel_worker_period_cards on worker_period_cards for select
  using (my_role() is not null);
create policy ins_worker_period_cards on worker_period_cards for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_worker_period_cards on worker_period_cards for update
  using (my_role() in ('admin', 'staff'));
create policy del_worker_period_cards on worker_period_cards for delete
  using (my_role() in ('admin', 'staff'));

drop trigger if exists worker_period_cards_updated on worker_period_cards;
create trigger worker_period_cards_updated before update on worker_period_cards
  for each row execute procedure moddatetime(updated_at);
