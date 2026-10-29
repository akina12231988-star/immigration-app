-- 所属機関との連絡の記録に「こちらの回答・対応」を足す。
-- 会社からの相談・連絡（content）に対して、対応した人がどう答えたか・どう対応したかを残す。
-- 何度実行しても安全（if not exists）
alter table organization_contacts
  add column if not exists reply text not null default '';

comment on column organization_contacts.reply is
  'こちらの回答・対応（会社からの連絡・相談に対して、対応した人がどう答えたか）';
