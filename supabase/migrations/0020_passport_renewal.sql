-- 外国人にパスポート情報・Notion個人ページのリンク・在留更新の対応状況を追加（追加のみ）
alter table workers
  add column if not exists passport_no text not null default '',
  add column if not exists passport_expiry_date date,
  add column if not exists notion_link text not null default '',
  -- 在留更新の対応状況: '' = 未対応（対象）／準備中／転職先にて対応中／帰国
  add column if not exists residence_renewal_status text not null default '',
  -- Notion側の申請TODO番号（入力があれば「準備中」表示に使う）
  add column if not exists residence_renewal_todo text not null default '';
