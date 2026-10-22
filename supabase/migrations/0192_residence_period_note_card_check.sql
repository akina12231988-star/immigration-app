-- 「在留期間の注意事項」と「在留カード等読取アプリケーションで照合結果」の画像。
--
-- ・在留期間の注意事項: 申請詳細の許可情報で在留期間の隣に入れる文（例: 更新は満了日の3か月前から など）。
--   申請（immigration_applications.granted_period_note）に残し、「許可情報を保存」で外国人（workers.residence_period_note）にも
--   反映する。外国人詳細の在留期間の下・書類タブ・申請準備の在留カードの欄に薄い赤の背景で出す。
-- ・照合結果: 在留カード等読取アプリケーションで照合した結果の画像。申請の添付（application_files.kind）と
--   外国人の書類（worker_documents.kind）の両方に「照合結果」を足し、在留カード・指定書と同じように保存する。
-- 何度実行しても安全（add column if not exists / 制約を作り直すだけ）。
alter table workers
  add column if not exists residence_period_note text not null default '';
comment on column workers.residence_period_note is
  '在留期間の注意事項（申請の許可情報で入れた最新の文。外国人詳細・書類タブ・申請準備に薄い赤で出す）';

alter table immigration_applications
  add column if not exists granted_period_note text not null default '';
comment on column immigration_applications.granted_period_note is
  '許可情報の在留期間の注意事項（保存時に workers.residence_period_note にも反映）';

alter table application_files drop constraint if exists application_files_kind_check;
alter table application_files add constraint application_files_kind_check
  check (kind in ('受付票', '通知書', '在留カード', '照合結果', '指定書', '追加資料通知', 'その他'));

alter table worker_documents drop constraint if exists worker_documents_kind_check;
alter table worker_documents add constraint worker_documents_kind_check
  check (
    kind in (
      '在留カード',
      '照合結果',
      '指定書',
      '雇用契約書',
      '雇用条件書',
      '雇用契約書（日付なし）',
      '雇用条件書（日付なし）',
      '雇用保険 離職票',
      '雇用保険 被保険者証'
    )
  );
