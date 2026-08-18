-- 申請準備の所属機関（転職の場合の転職先）
--
-- 転職の申請を準備するときは、まだ在留カードが出ていないので
-- 現在の所属機関（workers.current_organization_id）は前の会社のまま残す。
-- そこで「申請準備でどの会社として申請するか」を別の列に持ち、
-- 申請一覧の「申請前＜準備中＞」ではこちらを所属機関として表示する。
-- 許可がおりて在留カードを受け取ったら、これまでどおり
-- current_organization_id に反映される（申請詳細の在留カード受領で連動）。
--
-- 外部キー制約はあえて付けない。workers から organizations への関連が2本になると
-- PostgREST の埋め込み（organizations(name)）がどちらの関連か判断できなくなり、
-- 既存の外国人一覧の取得が壊れるため。値は organizations.id を入れる。

alter table workers
  add column if not exists application_prep_organization_id uuid;

comment on column workers.application_prep_organization_id is
  '申請準備中の所属機関（転職先）。organizations.id を入れる。許可後は current_organization_id に反映する';

create index if not exists idx_workers_prep_org
  on workers (application_prep_organization_id);
