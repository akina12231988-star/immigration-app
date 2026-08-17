-- 雇用契約書・雇用条件書を所属機関ごとに保管できるようにする。
--
-- 転職すると会社ごとに契約書・条件書が発生するため、どの会社の書類かを
-- 記録しておかないと外国人詳細で混ざってしまう。
-- 在留カード・指定書は会社に関係ないので、この列は空のままで使う。
alter table worker_documents
  add column if not exists organization_id uuid references organizations (id) on delete set null;

create index if not exists idx_worker_docs_org
  on worker_documents (worker_id, organization_id, kind, created_at desc);

comment on column worker_documents.organization_id is
  'この書類の所属機関（雇用契約書・雇用条件書で使う。在留カード・指定書は null）';
