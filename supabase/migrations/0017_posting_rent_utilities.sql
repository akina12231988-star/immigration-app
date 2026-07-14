-- Facebook掲載用の複数会社グリッド画像に必要な項目（家賃・光熱費）を求人に追加。

alter table job_postings
  add column if not exists rent      text not null default '', -- 家賃（Tiền nhà）
  add column if not exists utilities text not null default ''; -- 光熱費（Điện nước ga）
