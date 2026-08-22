-- 雇用契約書・雇用条件書の「日付なし（印鑑・署名あり）」版を保管できるようにする。
-- 一旦日付なしで印鑑・署名をもらってきたデータを保存し、あとから正式な日付入りの
-- 雇用契約書・雇用条件書（既存の種別）をアップロードして保存する流れ。
-- 何度実行しても安全（制約を作り直すだけ）。
alter table worker_documents drop constraint if exists worker_documents_kind_check;
alter table worker_documents add constraint worker_documents_kind_check
  check (
    kind in (
      '在留カード',
      '指定書',
      '雇用契約書',
      '雇用条件書',
      '雇用契約書（日付なし）',
      '雇用条件書（日付なし）',
      '雇用保険 離職票',
      '雇用保険 被保険者証'
    )
  );
