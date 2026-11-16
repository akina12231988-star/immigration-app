-- 参考様式（1-4号・1-5号・1-6号・1-17号・11-1号など）のひな形PDFと記入位置（申請書類作成をアプリ一本化計画）。
-- 様式（提出書類一覧表の書類のキー。例: t1-4-1）と言語ごとに1つ。全員共通で使う。
--   pdf_path   … 非公開バケット app-files の ref-forms/ に置いたPDF
--   layout     … どこに何を書くか（[{kind, page, x, y, size, text, maxWidth}]。座標はページの左上が原点の pt）
--   sign_pages … 本人の署名が要るページ（0 始まり）。「署名ページだけ」のダウンロードに使う
-- 何度実行しても安全。
create table if not exists ref_form_templates (
  id          uuid primary key default gen_random_uuid(),
  form_key    text not null,
  language    text not null default '日本語',
  pdf_path    text not null,
  pdf_name    text not null default '',
  layout      jsonb not null default '[]'::jsonb,
  sign_pages  integer[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (form_key, language)
);

alter table ref_form_templates enable row level security;

-- 閲覧: ログイン者全員 / 追加・更新: admin・staff / 削除: admin
drop policy if exists sel_ref_form_templates on ref_form_templates;
drop policy if exists ins_ref_form_templates on ref_form_templates;
drop policy if exists upd_ref_form_templates on ref_form_templates;
drop policy if exists del_ref_form_templates on ref_form_templates;
create policy sel_ref_form_templates on ref_form_templates for select using (my_role() is not null);
create policy ins_ref_form_templates on ref_form_templates for insert with check (my_role() in ('admin', 'staff'));
create policy upd_ref_form_templates on ref_form_templates for update
  using (my_role() in ('admin', 'staff')) with check (my_role() in ('admin', 'staff'));
create policy del_ref_form_templates on ref_form_templates for delete using (my_role() = 'admin');

drop trigger if exists ref_form_templates_updated on ref_form_templates;
create trigger ref_form_templates_updated before update on ref_form_templates
  for each row execute procedure moddatetime(updated_at);

notify pgrst, 'reload schema';
