-- 日本語の合格証の点数（外国人詳細 ＞ 日本語の合格証の受験情報の1件目）。
-- 点数から CEFR（A1〜C1）の目安と合否を出す（JLPT は受けたレベル N1〜N5 と点数、JFT-Basic は点数）。
-- 2件目以降の受験情報の点数は workers.cert_exams（jsonb）の score に入れるので、この列は1件目だけ。
-- 何度実行しても安全。

alter table workers add column if not exists cert_nihongo_score text not null default '';

notify pgrst, 'reload schema';
