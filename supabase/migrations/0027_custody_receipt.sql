-- 預かり証を azk-receipt と同様式でアプリ内発行するための項目（追加のみ）
-- 発行時点の記載内容をスナップショットとして保持し、再印刷しても同じ預かり証が出るようにする。
alter table custody_records
  add column if not exists holder_name text not null default '',             -- 氏名（在留カード記載のローマ字）
  add column if not exists holder_nationality text not null default '',      -- 国籍・地域
  add column if not exists holder_birth date,                                -- 生年月日
  add column if not exists holder_card_no text not null default '',          -- 在留カード番号
  add column if not exists holder_residence_status text not null default '', -- 在留資格
  add column if not exists holder_card_expire date,                          -- 在留期間（満了日）
  add column if not exists agent_cert_expire date,                           -- 申請取次者証明書 有効期限
  add column if not exists front_image_path text not null default '',        -- 在留カード表面画像（app-files）
  add column if not exists back_image_path text not null default '';         -- 在留カード裏面画像（app-files）
