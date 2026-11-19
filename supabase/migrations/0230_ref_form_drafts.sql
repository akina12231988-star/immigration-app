-- 参考様式の作成画面（申請書類作成をアプリ一本化計画・試験中）。
-- 作成画面で、記入位置を元にこの人の分を見ながら入力・○を動かして「一時保存」した内容と、
-- 所属機関の共通にした文字を持つ。
--
-- ref_form_drafts … 外国人 × 申請準備のTODO番号 × 様式ごとに1件（一時保存）
--   template_id … 作成に使ったひな形（ひな形を差し替えたら作り直しになるので控える）
--   texts       … 記入位置の項目ID → 入れた文字（自由な文字）
--   moves       … 記入位置の項目ID → 動かした位置 {x, y}（pt。ページの左上が原点）
--   off         … 書かない項目ID（外した○）
-- ref_form_org_texts … 所属機関 × ひな形ごとに1件（「所属機関の共通にする」に✓を付けた文字）
--   texts       … 記入位置の項目ID → 文字
-- 何度実行しても安全。

create table if not exists ref_form_drafts (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references workers (id) on delete cascade,
  todo_no     text not null default '',
  form_key    text not null,
  template_id uuid references ref_form_templates (id) on delete set null,
  texts       jsonb not null default '{}'::jsonb,
  moves       jsonb not null default '{}'::jsonb,
  off         jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (worker_id, todo_no, form_key)
);

create table if not exists ref_form_org_texts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  template_id     uuid not null references ref_form_templates (id) on delete cascade,
  texts           jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now(),
  unique (organization_id, template_id)
);

alter table ref_form_drafts enable row level security;
alter table ref_form_org_texts enable row level security;

-- 閲覧: ログイン者全員 / 追加・更新・削除: admin・staff
drop policy if exists sel_ref_form_drafts on ref_form_drafts;
drop policy if exists ins_ref_form_drafts on ref_form_drafts;
drop policy if exists upd_ref_form_drafts on ref_form_drafts;
drop policy if exists del_ref_form_drafts on ref_form_drafts;
create policy sel_ref_form_drafts on ref_form_drafts for select using (my_role() is not null);
create policy ins_ref_form_drafts on ref_form_drafts for insert with check (my_role() in ('admin', 'staff'));
create policy upd_ref_form_drafts on ref_form_drafts for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_ref_form_drafts on ref_form_drafts for delete using (my_role() in ('admin', 'staff'));

drop policy if exists sel_ref_form_org_texts on ref_form_org_texts;
drop policy if exists ins_ref_form_org_texts on ref_form_org_texts;
drop policy if exists upd_ref_form_org_texts on ref_form_org_texts;
drop policy if exists del_ref_form_org_texts on ref_form_org_texts;
create policy sel_ref_form_org_texts on ref_form_org_texts for select using (my_role() is not null);
create policy ins_ref_form_org_texts on ref_form_org_texts for insert with check (my_role() in ('admin', 'staff'));
create policy upd_ref_form_org_texts on ref_form_org_texts for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_ref_form_org_texts on ref_form_org_texts for delete using (my_role() in ('admin', 'staff'));

drop trigger if exists ref_form_drafts_updated on ref_form_drafts;
create trigger ref_form_drafts_updated before update on ref_form_drafts
  for each row execute procedure moddatetime(updated_at);
drop trigger if exists ref_form_org_texts_updated on ref_form_org_texts;
create trigger ref_form_org_texts_updated before update on ref_form_org_texts
  for each row execute procedure moddatetime(updated_at);

notify pgrst, 'reload schema';
