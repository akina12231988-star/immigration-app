-- 「２号特定技能外国人の業務内容に関する誓約書」（参考様式第１－３２号）の
-- 「１ 当該２号特定技能外国人の業務内容」を、所属機関ごとに一度登録しておくための欄。
--
-- 同じ会社で２号の申請をするたびに書き直さなくてよいよう、会社側に雛形として持たせ、
-- 誓約書の出力ページに自動で反映する。
-- 中身の例:
--   {"department":"製造部 加工課","position":"班長",
--    "duties":"野菜の選別・箱詰め、機械の点検…","difference":"1号は選別のみを行い、…"}
alter table organizations
  add column if not exists ssw2_duties jsonb not null default '{}'::jsonb;
