-- docs/03_database_design.md §6: RLS ポリシー
-- 全業務テーブル共通: select は全ロール、insert/update/delete は admin/staff。
-- viewer（閲覧のみ）はSQLレベルで書き込み不可。

alter table profiles         enable row level security;
alter table organizations    enable row level security;
alter table workers          enable row level security;
alter table work_histories   enable row level security;
alter table job_applications enable row level security;
alter table employments      enable row level security;
alter table worker_files     enable row level security;

-- profiles: 自分の行は全員閲覧可。他人の行は admin/staff のみ閲覧、変更・削除は admin のみ
create policy sel_profiles on profiles for select
  using (id = auth.uid() or my_role() in ('admin', 'staff'));
create policy upd_profiles on profiles for update
  using (my_role() = 'admin') with check (my_role() = 'admin');
create policy del_profiles on profiles for delete
  using (my_role() = 'admin');

-- organizations
create policy sel_organizations on organizations for select
  using (my_role() is not null);
create policy ins_organizations on organizations for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_organizations on organizations for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_organizations on organizations for delete
  using (my_role() in ('admin', 'staff'));

-- workers
create policy sel_workers on workers for select
  using (my_role() is not null);
create policy ins_workers on workers for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_workers on workers for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_workers on workers for delete
  using (my_role() in ('admin', 'staff'));

-- work_histories
create policy sel_histories on work_histories for select
  using (my_role() is not null);
create policy ins_histories on work_histories for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_histories on work_histories for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_histories on work_histories for delete
  using (my_role() in ('admin', 'staff'));

-- job_applications
create policy sel_applications on job_applications for select
  using (my_role() is not null);
create policy ins_applications on job_applications for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_applications on job_applications for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_applications on job_applications for delete
  using (my_role() in ('admin', 'staff'));

-- employments
create policy sel_employments on employments for select
  using (my_role() is not null);
create policy ins_employments on employments for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_employments on employments for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_employments on employments for delete
  using (my_role() in ('admin', 'staff'));

-- worker_files（メタデータ。実体は storage.objects 側のポリシーで保護）
create policy sel_worker_files on worker_files for select
  using (my_role() is not null);
create policy ins_worker_files on worker_files for insert
  with check (my_role() in ('admin', 'staff'));
create policy upd_worker_files on worker_files for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_worker_files on worker_files for delete
  using (my_role() in ('admin', 'staff'));
