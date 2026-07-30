-- 個人番号・雇用保険番号・基礎年金番号・特定技能総合保険（加入リンク・有効期限）を workers に追加（追加のみ）
alter table workers
  add column if not exists my_number text not null default '',               -- 個人番号（マイナンバー）
  add column if not exists employment_insurance_no text not null default '', -- 雇用保険被保険者番号
  add column if not exists pension_no text not null default '',              -- 基礎年金番号
  add column if not exists ssw_insurance_link text not null default '',      -- 特定技能総合保険の加入ページリンク
  add column if not exists ssw_insurance_expiry_date date;                   -- 特定技能総合保険の有効期限
