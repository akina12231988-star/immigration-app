-- 求人に「求人票（特定技能1号）」に書いてもらう内容を持たせる。
--
-- これまで求人詳細は求人管理簿（厚生労働省の記載事項）とFacebook掲載用の項目しか
-- 無く、会社からもらう求人票の内容（仕事内容・勤務時間・休日・手当・控除・
-- 加入保険・応募条件など）を入れる場所が無かった。
--
-- 項目が多く、これからも増えるため1列の jsonb にまとめて持つ（{} は未入力）。
-- 中身の形は src/types/recruiting.ts の PostingSheet、既定値と読み込みは
-- src/lib/posting-sheet.ts を参照。
alter table job_postings
  add column if not exists sheet jsonb not null default '{}'::jsonb;

comment on column job_postings.sheet is
  '求人票（特定技能1号）の内容。仕事内容・勤務時間・休日・手当・控除・加入保険・応募条件など。{} = 未入力';
