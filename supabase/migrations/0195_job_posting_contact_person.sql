-- 求人管理簿の「連絡担当者氏名」（0079 の追加）。
--
-- 求人管理簿には求人者の氏名又は名称の横に連絡担当者の氏名を出す。
-- 連絡先（電話番号）は所属機関の連絡先を使っているが、担当者の氏名は求人ごとに持てるようにする
-- （求人の登録・編集で入力する）。何度実行しても安全（add column if not exists）。
alter table job_postings
  add column if not exists contact_person text not null default '';
comment on column job_postings.contact_person is '連絡担当者氏名（求人管理簿の「連絡担当者氏名」の欄）';
