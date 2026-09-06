-- 在留資格の履歴に、手で入れる分を足せるようにする。
--
-- 申請一覧の許可欄や在留カードの記録が無い昔の分（特定活動の許可・1号の許可など）は
-- 自動では出せないため、ここに入れて履歴に並べられるようにする。
-- 自動で出る分と、許可日＋在留資格が同じときは、手で入れたほうを使う。
-- すべて冪等（何度実行してもエラーにならない）。
create table if not exists worker_visa_history (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references workers (id) on delete cascade,
  permit_date date not null,                       -- 許可日
  status      text not null default '',            -- 在留資格（特定技能1号 など）
  kind        text not null default 'ビザ許可',     -- ビザ許可 / 更新許可 / 認定
  expiry_date date,                                -- 在留期限
  card_no     text not null default '',            -- そのときの在留カード番号
  note        text not null default '',
  created_by  uuid references profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_worker_visa_history
  on worker_visa_history (worker_id, permit_date);

alter table worker_visa_history drop constraint if exists worker_visa_history_kind_check;
alter table worker_visa_history add constraint worker_visa_history_kind_check
  check (kind in ('ビザ許可', '更新許可', '認定'));

comment on table public.worker_visa_history is
  '在留資格の履歴のうち、手で入れた分（昔の許可など。自動で出る分より優先される）';

alter table worker_visa_history enable row level security;
drop policy if exists sel_worker_visa_history on worker_visa_history;
drop policy if exists ins_worker_visa_history on worker_visa_history;
drop policy if exists upd_worker_visa_history on worker_visa_history;
drop policy if exists del_worker_visa_history on worker_visa_history;
create policy sel_worker_visa_history on worker_visa_history for select
  using (my_role() is not null);
create policy ins_worker_visa_history on worker_visa_history for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_worker_visa_history on worker_visa_history for update
  using (my_role() in ('admin', 'staff'));
create policy del_worker_visa_history on worker_visa_history for delete
  using (my_role() in ('admin', 'staff'));

drop trigger if exists worker_visa_history_updated on worker_visa_history;
create trigger worker_visa_history_updated before update on worker_visa_history
  for each row execute procedure moddatetime(updated_at);
