-- docs/03_database_design.md §4.5〜4.6: 求職管理簿・採用管理

create table job_applications (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references workers (id) on delete cascade,
  organization_id uuid not null references organizations (id),
  applied_on      date not null,
  interview_on    date,
  result_on       date,
  result          application_result not null default '選考中',
  note            text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint result_needs_date check (result = '選考中' or result_on is not null)
);

create table employments (
  id              uuid primary key default gen_random_uuid(),
  worker_id       uuid not null references workers (id) on delete cascade,
  organization_id uuid not null references organizations (id),
  hired_on        date not null,
  job_role        text not null default '',
  industry        text not null default '',
  left_on         date,
  note            text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint valid_employment check (left_on is null or left_on >= hired_on)
);

create index idx_apps_worker        on job_applications (worker_id, applied_on desc);
create index idx_apps_result        on job_applications (result);
create index idx_employments_worker on employments (worker_id, hired_on desc);

create trigger job_applications_updated before update on job_applications
  for each row execute procedure moddatetime(updated_at);
create trigger employments_updated before update on employments
  for each row execute procedure moddatetime(updated_at);

-- 採用登録で現在所属機関を自動更新。退職日が入り在籍レコードが無くなったら所属を外す
create function apply_employment_to_worker() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.left_on is null then
    update workers
      set current_organization_id = new.organization_id,
          status = '支援中'
      where id = new.worker_id;
  elsif tg_op = 'UPDATE' and new.left_on is not null and old.left_on is null then
    if not exists (
      select 1 from employments e
      where e.worker_id = new.worker_id and e.left_on is null and e.id <> new.id
    ) then
      update workers
        set current_organization_id = null,
            status = '退職'
        where id = new.worker_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger employments_apply
  after insert or update on employments
  for each row execute procedure apply_employment_to_worker();
