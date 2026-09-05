-- 在留カードの内容を上書きする前に、そのときの内容を自動で残す。
--
-- 更新や資格変更で workers の在留カード番号・在留資格・在留期間・許可日・在留期限を
-- 書き換えると、それまでの内容が分からなくなる。過去に在籍していた会社の個人票など、
-- 「当時の在留カード」が必要な場面のために、書き換える直前の内容をこの表に残す。
--
-- 記録はトリガーで自動。画面から何かを操作する必要はない。
-- recorded_at は「その内容を書き換えた日時」＝その内容が使われていた最後の時点。
-- すべて冪等（何度実行してもエラーにならない）。
create table if not exists worker_card_history (
  id                    uuid primary key default gen_random_uuid(),
  worker_id             uuid not null references workers (id) on delete cascade,
  organization_id       uuid references organizations (id) on delete set null, -- 書き換え時点の所属機関
  residence_card_no     text not null default '',
  residence_status      text not null default '',
  residence_period      text not null default '',
  residence_permit_date date,
  residence_expiry_date date,
  recorded_at           timestamptz not null default now(), -- 書き換えた日時（この内容の終わり）
  changed_by            uuid references profiles (id) on delete set null default auth.uid()
);

create index if not exists idx_worker_card_history
  on worker_card_history (worker_id, recorded_at desc);

comment on table public.worker_card_history is
  '在留カードの内容を書き換える直前の内容（自動記録）。当時の在留カードを出すために使う';
comment on column public.worker_card_history.recorded_at is
  'この内容を書き換えた日時。この時点までは、この内容の在留カードだった';

alter table worker_card_history enable row level security;
drop policy if exists sel_worker_card_history on worker_card_history;
drop policy if exists del_worker_card_history on worker_card_history;
create policy sel_worker_card_history on worker_card_history for select
  using (my_role() is not null);
-- 記録はトリガー（security definer）だけが行う。間違って消すのは admin のみ
create policy del_worker_card_history on worker_card_history for delete
  using (my_role() = 'admin');

-- 在留カードの項目が変わるときだけ、変わる前の内容を残す。
-- どの項目も空だった（まだ何も入っていない）ときは残さない
create or replace function record_worker_card_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(old.residence_card_no, '') = '' and
     coalesce(old.residence_status, '') = '' and
     coalesce(old.residence_period, '') = '' and
     old.residence_permit_date is null and
     old.residence_expiry_date is null then
    return new;
  end if;

  insert into worker_card_history (
    worker_id, organization_id, residence_card_no, residence_status,
    residence_period, residence_permit_date, residence_expiry_date
  ) values (
    old.id, old.current_organization_id, coalesce(old.residence_card_no, ''),
    coalesce(old.residence_status, ''), coalesce(old.residence_period, ''),
    old.residence_permit_date, old.residence_expiry_date
  );
  return new;
end;
$$;

drop trigger if exists workers_card_history on workers;
create trigger workers_card_history
  before update on workers
  for each row
  when (
    old.residence_card_no is distinct from new.residence_card_no or
    old.residence_status is distinct from new.residence_status or
    old.residence_period is distinct from new.residence_period or
    old.residence_permit_date is distinct from new.residence_permit_date or
    old.residence_expiry_date is distinct from new.residence_expiry_date
  )
  execute procedure record_worker_card_history();
