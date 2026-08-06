-- ◯月分の支援代の記録（monthly_support_registrations）にメモを追加（追加のみ）。
-- 対象の年月に支援代・サポート代を請求しない場合の理由（帰国中・休職中 など）を
-- 請求書作成の名簿の行ごとに書き残せるようにする。
alter table monthly_support_registrations
  add column if not exists note text not null default ''; -- メモ（請求しない理由など）
