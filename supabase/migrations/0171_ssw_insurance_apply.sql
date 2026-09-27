-- 特定技能総合保険の申込（申込サイトの「被保険者情報」「被保険者検索」と同じ項目）。
--  ・振込日: 保険始期希望日は振込日の翌日（土日なら翌週の月曜日）にする
--  ・加入依頼 受付番号・加入依頼日・保険始期: 申込サイトの被保険者検索の結果を控える
-- 保険終期は ssw_insurance_expiry_date、被保険者証の番号は ssw_insurance_no をそのまま使う。
alter table workers
  add column if not exists ssw_insurance_paid_on date,
  add column if not exists ssw_insurance_request_no text not null default '',
  add column if not exists ssw_insurance_requested_on date,
  add column if not exists ssw_insurance_start_on date;
comment on column workers.ssw_insurance_paid_on is '特定技能総合保険の振込日（保険始期希望日の計算に使う）';
comment on column workers.ssw_insurance_request_no is '特定技能総合保険の加入依頼 受付番号';
comment on column workers.ssw_insurance_requested_on is '特定技能総合保険の加入依頼日';
comment on column workers.ssw_insurance_start_on is '特定技能総合保険の保険始期';
