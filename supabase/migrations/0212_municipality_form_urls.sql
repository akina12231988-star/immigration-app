-- 自治体マスタに、証明書の申請書（交付請求書）をダウンロードするページのURLを追加。
-- 証明書類の請求の「住所の確認」で、年度ごとの請求先の自治体の申請書ページをそのまま開けるようにする。
--   cert_form_url     … 課税・納税証明書の申請書のページ
--   juminhyo_form_url … 住民票・転出届の申請書のページ
-- 何度実行しても安全（add column if not exists）。
alter table municipalities add column if not exists cert_form_url text not null default '';
alter table municipalities add column if not exists juminhyo_form_url text not null default '';
comment on column municipalities.cert_form_url is '課税・納税証明書の申請書（交付請求書）のページのURL（空は未登録）';
comment on column municipalities.juminhyo_form_url is '住民票・転出届の申請書のページのURL（空は未登録）';
