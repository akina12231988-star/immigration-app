-- 書類の準備状況にメモ（依頼中のやり取りなど）を持たせる。
-- note は発行依頼先・理由書などに使っているため別の列にする。
-- TODO ＞ 依頼中 の一覧で「詳細」を開いて編集・保存する。何度実行しても安全（if not exists）
alter table prep_doc_statuses
  add column if not exists memo text not null default '';

comment on column prep_doc_statuses.memo is
  '依頼中のメモ（催促した日・返事の内容など）。TODO ＞ 依頼中 の一覧で編集する';
