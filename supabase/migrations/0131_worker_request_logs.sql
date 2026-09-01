-- 外国人ごとの対応の記録（いつ本人から依頼があって、いつ何をやったか）。
-- 外国人詳細の「記録」ボタンから時系列で残す。
-- すべて冪等（何度実行してもエラーにならない）。
create table if not exists worker_request_logs (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references workers (id) on delete cascade,
  logged_on  date not null,                          -- いつ（依頼を受けた日・対応した日）
  kind       text not null default '本人からの依頼', -- 本人からの依頼 ／ 対応したこと
  content    text not null default '',               -- 依頼・対応の内容
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_worker_request_logs_worker
  on worker_request_logs (worker_id, logged_on desc, created_at desc);

alter table worker_request_logs enable row level security;

drop policy if exists sel_worker_request_logs on worker_request_logs;
create policy sel_worker_request_logs on worker_request_logs for select
  using (my_role() is not null);
drop policy if exists ins_worker_request_logs on worker_request_logs;
create policy ins_worker_request_logs on worker_request_logs for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_worker_request_logs on worker_request_logs;
create policy upd_worker_request_logs on worker_request_logs for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_worker_request_logs on worker_request_logs;
create policy del_worker_request_logs on worker_request_logs for delete
  using (my_role() in ('admin', 'staff'));

drop trigger if exists worker_request_logs_updated on worker_request_logs;
create trigger worker_request_logs_updated before update on worker_request_logs
  for each row execute procedure moddatetime(updated_at);
