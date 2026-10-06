-- 在留資格の履歴で、自動で出ている行（申請一覧・在留カードの記録から作られる行）を
-- 「削除」できるようにする。元のデータは消さず、同じ許可日＋在留資格の行を hidden = true で
-- 記録して履歴から外す（あとから戻せる）。何度実行しても安全。
alter table worker_visa_history
  add column if not exists hidden boolean not null default false; -- true: この許可を履歴に出さない
