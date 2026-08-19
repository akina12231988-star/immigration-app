-- 雇用保険の書類（離職票・被保険者番号がわかる書類）を外国人詳細で保管できるようにする。
--
-- ハローワークから離職票（離職証明書）や、資格取得等確認通知書・被保険者証など
-- 被保険者番号がわかる書類が届いたときに、その外国人のページへ登録できるようにする。
-- 保管先は在留カード・雇用契約書と同じ worker_documents（履歴も残る）。
--
-- 何度実行しても安全（制約を作り直すだけ）。
alter table worker_documents drop constraint if exists worker_documents_kind_check;
alter table worker_documents add constraint worker_documents_kind_check
  check (
    kind in (
      '在留カード',
      '指定書',
      '雇用契約書',
      '雇用条件書',
      '雇用保険 離職票',
      '雇用保険 被保険者証'
    )
  );

comment on column worker_documents.kind is
  '書類の種別（在留カード・指定書・雇用契約書・雇用条件書・雇用保険 離職票・雇用保険 被保険者証）';
