-- 入管申請に、許可のときに実際にかかった収入印紙代（申請手数料）の金額を追加。
-- 申請詳細で「入管から許可がおりた通知あり」を押したあとに入力する（円。空は未入力）。
-- 何度実行しても安全（add column if not exists）。
alter table immigration_applications add column if not exists stamp_fee_amount integer;
comment on column immigration_applications.stamp_fee_amount is '許可のときにかかった収入印紙代（申請手数料）の金額（円。null は未入力）';
