-- 生活オリエンテーションに「実施不可（早期退職）」を追加。
-- 生活オリエンテーション前に退職したケースを記録できるようにする。

alter table orientations drop constraint if exists orientations_status_check;
alter table orientations
  add constraint orientations_status_check
  check (status in ('未実施', '実施済', '実施不可（早期退職）'));
