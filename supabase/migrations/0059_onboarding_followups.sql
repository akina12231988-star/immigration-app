-- 入社書類メールの訂正・追送の送付履歴。
-- 「いつ・何を・どの理由で」訂正版/追加資料を送ったかを外国人ごとに記録する。
create table if not exists onboarding_followups (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references workers (id) on delete cascade,
  sent_on    date,                            -- 送った日
  reason     text not null default '',        -- 訂正・追送の理由（例: 雇用開始年月日の訂正）
  docs       jsonb not null default '[]'::jsonb, -- 送った書類 [{label, kind, note}]（kind: 訂正版 / 追加）
  created_at timestamptz not null default now()
);
create index if not exists idx_onboarding_followups_worker
  on onboarding_followups (worker_id, created_at desc);

alter table onboarding_followups enable row level security;

-- 閲覧は全ロール、追加・削除は admin/staff（onboarding_records と同方針）
create policy sel_onboarding_followups on onboarding_followups for select
  using (my_role() is not null);
create policy ins_onboarding_followups on onboarding_followups for insert
  with check (my_role() in ('admin', 'staff'));
create policy del_onboarding_followups on onboarding_followups for delete
  using (my_role() in ('admin', 'staff'));
