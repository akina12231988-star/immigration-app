-- 日本語の合格証の「合格したレベル」（N4/N3/N2/N1）を記録できるようにする。
-- 0115 で cert_exams（2件目以降の受験情報）を追加したときに、
-- 1件目のレベルを入れるこの列を入れ忘れていたため、ここで追加する。
-- 2件目以降のレベルは cert_exams の中の level に入る。
alter table workers add column if not exists cert_nihongo_level text not null default '';
