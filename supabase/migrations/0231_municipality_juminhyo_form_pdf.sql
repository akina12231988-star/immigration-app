-- 自治体マスタに、住民票の申請書（交付請求書）と委任状のPDFと、自動入力の記入位置を追加（0215 の住民票版）。
-- PDFは非公開バケット app-files の municipal-forms/ に保存し、そのパスを持つ。
-- 何度実行しても安全（add column if not exists）。
alter table municipalities add column if not exists juminhyo_form_pdf_path text not null default '';
alter table municipalities add column if not exists juminhyo_form_pdf_name text not null default '';
alter table municipalities add column if not exists juminhyo_form_layout jsonb not null default '[]'::jsonb;
alter table municipalities add column if not exists juminhyo_proxy_form_pdf_path text not null default '';
alter table municipalities add column if not exists juminhyo_proxy_form_pdf_name text not null default '';
alter table municipalities add column if not exists juminhyo_proxy_form_layout jsonb not null default '[]'::jsonb;
comment on column municipalities.juminhyo_form_pdf_path is '住民票の申請書PDFの保存先（app-files バケット内のパス。空は未登録）';
comment on column municipalities.juminhyo_form_pdf_name is '住民票の申請書PDFの元のファイル名';
comment on column municipalities.juminhyo_form_layout is '住民票の申請書PDFへの自動入力の記入位置（課税証明書の申請書と同じ形）';
comment on column municipalities.juminhyo_proxy_form_pdf_path is '住民票の委任状PDFの保存先（app-files バケット内のパス。空は未登録）';
comment on column municipalities.juminhyo_proxy_form_pdf_name is '住民票の委任状PDFの元のファイル名';
comment on column municipalities.juminhyo_proxy_form_layout is '住民票の委任状PDFへの自動入力の記入位置';

notify pgrst, 'reload schema';
