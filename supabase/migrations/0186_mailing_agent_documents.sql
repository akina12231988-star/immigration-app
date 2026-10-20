-- 郵送請求の代理人（職員）の身分証明書（0186）。
-- 課税・納税証明書などを代理人として郵送請求するとき、代理人の本人確認書類の写しを同封する。
-- 代理人の名前ごとに身分証明書の画像・PDF を登録しておき、郵送請求の画面で代理人を入力したら
-- その人の身分証明書をすぐ開いて印刷できるようにする。実体は非公開バケット app-files
-- （agent-docs/...）に保存し、この表はメタデータだけ持つ。何度実行しても同じ結果になる。
create table if not exists mailing_agent_documents (
  id           uuid primary key default gen_random_uuid(),
  agent_name   text not null,                   -- 代理人の名前（郵送請求の画面の入力と突き合わせる）
  label        text not null default '',        -- 書類の種類（運転免許証（表）など）
  storage_path text not null,                   -- app-files バケット内のパス
  file_name    text not null default '',
  mime_type    text not null default '',
  uploaded_by  uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_mailing_agent_documents_name on mailing_agent_documents (agent_name);

alter table mailing_agent_documents enable row level security;

-- 閲覧は全ロール、追加・削除は admin/staff（郵送請求の添付ファイルと同じ方針）
drop policy if exists sel_mailing_agent_documents on mailing_agent_documents;
create policy sel_mailing_agent_documents on mailing_agent_documents for select
  using (my_role() is not null);
drop policy if exists ins_mailing_agent_documents on mailing_agent_documents;
create policy ins_mailing_agent_documents on mailing_agent_documents for insert
  with check (my_role() in ('admin', 'staff'));
drop policy if exists del_mailing_agent_documents on mailing_agent_documents;
create policy del_mailing_agent_documents on mailing_agent_documents for delete
  using (my_role() in ('admin', 'staff'));
