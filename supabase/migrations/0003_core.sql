-- docs/03_database_design.md §4.2〜4.4: 会社マスタ・外国人・職歴

create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  industry   text not null default '',
  address    text not null default '',
  contact    text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workers (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null check (length(name) between 1 and 100),
  kana                    text not null default '',
  nationality             text not null default '',
  birth                   date,
  residence_card_no       text not null default '',
  field                   text not null default '',
  support                 support_scope not null default '支援対象',
  status                  worker_status not null default '支援中',
  health_note             text not null default '',
  family_note             text not null default '',
  current_organization_id uuid references organizations (id) on delete set null,
  residence_status        text not null default '',
  residence_permit_date   date,
  residence_expiry_date   date,
  note                    text not null default '',
  legacy_id               text unique,
  created_by              uuid references profiles (id) on delete set null default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table work_histories (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references workers (id) on delete cascade,
  visa       visa_type not null,
  start_date date not null,
  end_date   date,
  org_name   text not null default '',
  role       text not null default '',
  note       text not null default '',
  legacy_id  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_period check (end_date is null or end_date >= start_date)
);

create index idx_histories_worker on work_histories (worker_id, start_date);
create index idx_workers_status   on workers (status);
create index idx_workers_org      on workers (current_organization_id);
create index idx_workers_expiry   on workers (residence_expiry_date);
create index idx_workers_name     on workers (name);

create trigger organizations_updated before update on organizations
  for each row execute procedure moddatetime(updated_at);
create trigger workers_updated before update on workers
  for each row execute procedure moddatetime(updated_at);
create trigger histories_updated before update on work_histories
  for each row execute procedure moddatetime(updated_at);
