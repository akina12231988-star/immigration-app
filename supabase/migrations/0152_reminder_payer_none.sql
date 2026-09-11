-- 督促の「支払」に「なし（連絡のみ）」を追加。
-- 支払いは無いが市役所への連絡などで本人からの返事を待つ件を、金額なしで登録できるようにする
-- （一覧表には出さず、カードの一覧・返事待ちの追いかけだけに使う）。
-- 何度実行しても安全。
alter table reminders drop constraint if exists reminders_payer_check;
alter table reminders
  add constraint reminders_payer_check check (payer in ('', '本人', '代わり', 'なし'));
