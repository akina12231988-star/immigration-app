-- 外国人IDの振り直し（申請登録で作った X-… を国籍の英字に直す）。
--
-- 申請登録から外国人を作ると国籍がまだ無いためIDが X-1 のようになる。
-- これまでは後から国籍を登録してもIDが X のままだったので、
-- 国籍が入っているのにIDの英字が合っていない人と、IDがまだ無い人を対象に振り直す。
-- 英字は src/lib/worker-code.ts の NATIONALITY_LETTER と同じ対応。
-- 国籍が未入力・対応表に無い国のときは、すでに付いている国入りのIDは変えない。
--
-- 何度実行しても、ずれている人がいなければ何も変わらない。
with letters as (
  select
    id,
    created_at,
    worker_code,
    case trim(nationality)
      when 'ベトナム'      then 'V'
      when 'カンボジア'    then 'C'
      when 'フィリピン'    then 'P'
      when 'インドネシア'  then 'I'
      when 'ミャンマー'    then 'M'
      when 'ネパール'      then 'N'
      when 'タイ'          then 'T'
      when 'モンゴル'      then 'O'
      when 'スリランカ'    then 'S'
      when 'バングラデシュ' then 'B'
      when 'ラオス'        then 'L'
      when '中国'          then 'Z'
      else 'X'
    end as letter
  from workers
),
-- 振り直す人: IDが無い、または（国籍が分かっていて）IDの英字が国籍と違う
target as (
  select id, created_at, letter
  from letters
  where worker_code is null
     or (letter <> 'X' and split_part(worker_code, '-', 1) <> letter)
),
-- 英字ごとの今の最大連番（振り直し後もこの続きから採番する）
maxno as (
  select
    split_part(worker_code, '-', 1) as letter,
    max(split_part(worker_code, '-', 2)::int) as n
  from workers
  where worker_code ~ '^[A-Za-z]-[0-9]+$'
  group by 1
),
numbered as (
  select
    t.id,
    t.letter || '-' ||
      (coalesce(m.n, 0) + row_number() over (partition by t.letter order by t.created_at, t.id))
      as new_code
  from target t
  left join maxno m on m.letter = t.letter
)
update workers w
   set worker_code = n.new_code
  from numbered n
 where n.id = w.id;

-- 確認: 振り直しが残っていないか（0件になるはず）
select id, name, nationality, worker_code
  from workers
 where worker_code is null
    or (
      worker_code !~ '^[A-Za-z]-[0-9]+$'
    )
    or (
      trim(nationality) in ('ベトナム','カンボジア','フィリピン','インドネシア','ミャンマー',
                            'ネパール','タイ','モンゴル','スリランカ','バングラデシュ','ラオス','中国')
      and split_part(worker_code, '-', 1) <> case trim(nationality)
        when 'ベトナム'      then 'V'
        when 'カンボジア'    then 'C'
        when 'フィリピン'    then 'P'
        when 'インドネシア'  then 'I'
        when 'ミャンマー'    then 'M'
        when 'ネパール'      then 'N'
        when 'タイ'          then 'T'
        when 'モンゴル'      then 'O'
        when 'スリランカ'    then 'S'
        when 'バングラデシュ' then 'B'
        when 'ラオス'        then 'L'
        when '中国'          then 'Z'
      end
    )
 order by worker_code;
