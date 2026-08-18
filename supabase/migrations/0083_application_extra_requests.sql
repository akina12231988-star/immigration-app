-- 審査中に入管から来る「追加資料の提出依頼」の記録。
--
-- 書類（追加資料提出通知書）で来る場合と、電話で言われる場合がある。
-- いつ来たか・審査担当者・何を求められたか・提出期限を残し、
-- 本人からの返事を記録して、レターパックで郵送したら完了にする。
-- 追跡番号を残しておけば、届いたかを日本郵便の追跡で確認できる。
create table if not exists application_extra_requests (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references immigration_applications (id) on delete cascade,
  requested_on   date not null default current_date,          -- 依頼が来た日
  method         text not null default '書類'
                   check (method in ('書類', '電話')),        -- 依頼の来かた
  officer        text not null default '',                    -- 入管の審査担当者
  due_on         date,                                        -- 提出期限
  items          text not null default '',                    -- 求められた資料
  status         text not null default '本人へ依頼中'
                   check (status in ('本人へ依頼中', '本人から受領', '書類作成中', '郵送済み')),
  worker_reply   text not null default '',                    -- 本人からどう返事が来たか
  sent_on        date,                                        -- レターパックで送った日
  tracking_no    text not null default '',                    -- レターパックの追跡番号
  note           text not null default '',
  created_by     uuid references profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_extra_requests_application
  on application_extra_requests (application_id, requested_on desc);

alter table application_extra_requests enable row level security;

-- 閲覧は全ロール、追加・更新・削除は admin/staff（申請まわりと同じ方針）
drop policy if exists sel_extra_requests on application_extra_requests;
create policy sel_extra_requests on application_extra_requests for select
  using (my_role() is not null);
drop policy if exists ins_extra_requests on application_extra_requests;
create policy ins_extra_requests on application_extra_requests for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists upd_extra_requests on application_extra_requests;
create policy upd_extra_requests on application_extra_requests for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
drop policy if exists del_extra_requests on application_extra_requests;
create policy del_extra_requests on application_extra_requests for delete
  using (my_role() in ('admin', 'staff'));

drop trigger if exists application_extra_requests_updated on application_extra_requests;
create trigger application_extra_requests_updated before update on application_extra_requests
  for each row execute procedure moddatetime(updated_at);

-- 追加資料提出通知書そのものも申請の書類として残せるようにする
alter table application_files drop constraint if exists application_files_kind_check;
alter table application_files add constraint application_files_kind_check
  check (kind in ('受付票', '通知書', '在留カード', '指定書', '追加資料通知', 'その他'));
