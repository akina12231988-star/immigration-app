-- 自治体マスタに、納税証明書の申請書（課税証明書とは別の様式の自治体用）のPDFと記入位置を追加（0215 の続き）。
-- 課税証明書と同じ申請書で請求できる自治体は使わない（今までどおり cert_form_* だけ）。
-- 何度実行しても安全（add column if not exists）。
alter table municipalities add column if not exists nozei_form_pdf_path text not null default '';
alter table municipalities add column if not exists nozei_form_pdf_name text not null default '';
alter table municipalities add column if not exists nozei_form_layout jsonb not null default '[]'::jsonb;
comment on column municipalities.nozei_form_pdf_path is '納税証明書の申請書PDFの保存先（課税証明書と別の様式のとき。app-files バケット内のパス。空は未登録）';
comment on column municipalities.nozei_form_pdf_name is '納税証明書の申請書PDFの元のファイル名';
comment on column municipalities.nozei_form_layout is '納税証明書の申請書PDFへの自動入力の記入位置（課税証明書の申請書と同じ形）';

notify pgrst, 'reload schema';
