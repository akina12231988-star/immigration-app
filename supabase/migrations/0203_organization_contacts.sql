-- 所属機関（会社）との連絡の記録（所属機関の詳細 ＞ 「連絡の記録」タブ）。
--
-- 会社と電話・メール・Messenger・訪問などで連絡した内容を、日付ごとに残す。
-- 誰がいつ何を話したかをあとから追えるようにする（1件1行）。
-- 何度実行しても安全（if not exists）
create table if not exists organization_contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  contacted_on    date not null default current_date,  -- 連絡があった日
  method          text not null default '',            -- 連絡の方法（電話・メール・Messenger・訪問・来社・その他）
  content         text not null default '',            -- 連絡の内容
  staff           text not null default '',            -- 対応した人（こちら側）
  created_by      uuid references profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_organization_contacts_org
  on organization_contacts (organization_id, contacted_on desc);

alter table organization_contacts enable row level security;

-- 閲覧は全ロール、追加・更新・削除は admin/staff（所属機関まわりと同じ方針）
drop policy if exists sel_organization_contacts on organization_contacts;
create policy sel_organization_contacts on organization_contacts for select
  using (my_role() is not null);
drop policy if exists ins_organization_contacts on organization_contacts;
create policy ins_organization_contacts on organization_contacts for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_organization_contacts on organization_contacts;
create policy upd_organization_contacts on organization_contacts for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_organization_contacts on organization_contacts;
create policy del_organization_contacts on organization_contacts for delete
  using (my_role() in ('admin', 'staff'));

drop trigger if exists organization_contacts_updated on organization_contacts;
create trigger organization_contacts_updated before update on organization_contacts
  for each row execute procedure moddatetime(updated_at);
