-- 自治体マスタに、課税・納税証明書の申請書（交付請求書）のPDFと、自動入力の記入位置を追加。
-- PDFは非公開バケット app-files の municipal-forms/ に保存し、そのパスを持つ。
-- 記入位置（どこに氏名・住所などを書くか）は画面で置いて保存する（[{kind, page, x, y, size, ...}]）。
-- 何度実行しても安全（add column if not exists）。
alter table municipalities add column if not exists cert_form_pdf_path text not null default '';
alter table municipalities add column if not exists cert_form_pdf_name text not null default '';
alter table municipalities add column if not exists cert_form_layout jsonb not null default '[]'::jsonb;
comment on column municipalities.cert_form_pdf_path is '課税・納税証明書の申請書PDFの保存先（app-files バケット内のパス。空は未登録）';
comment on column municipalities.cert_form_pdf_name is '課税・納税証明書の申請書PDFの元のファイル名';
comment on column municipalities.cert_form_layout is '申請書PDFへの自動入力の記入位置（[{id, kind, page, x, y, size, text?, maxWidth?}]。座標はページ左上原点の pt）';
