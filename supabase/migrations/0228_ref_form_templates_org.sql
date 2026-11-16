-- 参考様式のひな形を所属機関別にも登録できるようにする（0227 の続き）。
-- organization_id が空のひな形は全員共通、入っているひな形はその所属機関だけで使う。
-- 作成のときは「その所属機関の版（国籍の言語 → 日本語）」→「全員共通の版（国籍の言語 → 日本語）」の順に選ぶ。
-- 様式・言語・所属機関（空は全員共通）ごとに1つ。
-- 何度実行しても安全。
alter table ref_form_templates
  add column if not exists organization_id uuid references organizations(id) on delete cascade;
comment on column ref_form_templates.organization_id is 'この所属機関だけで使うひな形（null は全員共通）';

alter table ref_form_templates drop constraint if exists ref_form_templates_form_key_language_key;
create unique index if not exists ref_form_templates_scope_key
  on ref_form_templates (form_key, language, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid));

notify pgrst, 'reload schema';
