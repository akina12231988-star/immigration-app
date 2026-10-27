-- 申請準備の詳細画面（/workers/[id]/application-prep）を最後に開いた日時。
--
-- 開くたびに書き込み、TODO一覧（申請準備）で「最後に開いてから何日経っているか」を出す。
-- 入管へ申請まで進んでいないのに2週間以上開いていない人はアラートにして、
-- 放置に気づけるようにする。閲覧のみのロールでは書き込めないので、そのときは更新しない。
-- 何度実行しても安全（if not exists）
alter table workers
  add column if not exists prep_opened_at timestamptz;

comment on column workers.prep_opened_at is
  '申請準備の詳細画面を最後に開いた日時（TODO一覧で、入管へ申請まで進んでいないのに2週間以上開いていない人をアラートにする）';
