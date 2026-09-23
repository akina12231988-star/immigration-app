-- 前回の申請（手入力。0158）に、申請内容・所属機関・使った書類の年度を足す。
--
-- ・申請内容: 例「在留資格の変更許可（特定技能）」。特定活動の申請は申請番号を転用できないので、
--   申請準備で転用できるかどうかの案内に使う
-- ・所属機関: 参考様式1-25号（支援委託契約書）は、同じ所属機関の
--   「在留資格の変更許可（特定技能）」の申請日・申請番号でだけ転用できる
-- ・書類の年度: 前回どの年度の課税証明書・納税証明書・源泉徴収票を使ったか（書類ID → 令和年）
-- 何度実行しても安全（if not exists）
alter table workers
  add column if not exists prior_application_content text not null default '',
  add column if not exists prior_application_org_id uuid references organizations(id) on delete set null,
  add column if not exists prior_application_doc_years jsonb not null default '{}'::jsonb;

comment on column workers.prior_application_content is
  '前回の申請の申請内容（手入力。例: 在留資格の変更許可（特定技能））';
comment on column workers.prior_application_org_id is
  '前回の申請の所属機関（手入力。1-25号を転用できるかの判定に使う）';
comment on column workers.prior_application_doc_years is
  '前回の申請で使った書類の年度（手入力。書類ID → 令和年。例: {"kazei": 7}）';
