-- 外国人の状態「支援中」を「在籍中」へ統一する。
-- 支援しているかどうかは支援区分（support）で管理しているため、
-- 状態（status）は在籍しているかどうかに一本化し、画面の選択肢からも「支援中」を外す。
-- （worker_status 型から値そのものは削除できないが、今後は使わない）
update workers set status = '在籍中' where status = '支援中';
alter table workers alter column status set default '在籍中';

-- 採用登録の自動更新（0004_recruiting.sql の関数）も「在籍中」を使うよう置き換える
create or replace function apply_employment_to_worker() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.left_on is null then
    update workers
      set current_organization_id = new.organization_id,
          status = '在籍中'
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
