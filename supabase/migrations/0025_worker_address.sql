-- 履歴書に表示する住所を workers に追加（追加のみ）
alter table workers
  add column if not exists address text not null default '';  -- 住所
