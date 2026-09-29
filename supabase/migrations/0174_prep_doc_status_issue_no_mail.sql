-- 申請準備の書類で「申請後に発行はするが、入管へは郵送しない」ものの印。
-- 年金記録のように、申請後に発行はして手元に置くが、入管へは出さないことがある。
-- 「申請後に郵送」（mail_after_apply）とは別の欄にして、郵送待ちと混ざらないようにする。
-- 何度実行しても安全（if not exists）
alter table prep_doc_statuses
  add column if not exists issue_no_mail boolean not null default false;

comment on column prep_doc_statuses.issue_no_mail is
  '申請後に発行するが入管へは郵送しない（申請後の郵送リストとは別の一覧に出す）';
