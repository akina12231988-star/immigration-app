-- 旧「外国人書類（PDF・画像で保存）」カードの解体にともなうデータ移動。
-- ファイルの実体はすべて app-files バケットにあるため、メタデータの行を移すだけでよい。
--   ・パスポート（cert_passport）      → worker_passport_files（出入国の記録の「パスポートの記録」）
--   ・在留カード（cert_zairyu）        → worker_documents（在留カード・指定書の「在留カード」）
--   ・履歴書（cert_rirekisho）         → 入社書類の「履歴書」（rirekisho）へ一本化
--   ・合格証4種（cert_senmonkyu / cert_ssw2 / cert_nihongo / cert_senmongai）は
--     保存先そのまま（基本情報の各合格名の下に表示が移っただけ）
-- 何度実行しても安全（移動済みの行は対象から外れる）

-- 1) パスポート → パスポートの記録
insert into worker_passport_files (worker_id, kind, storage_path, file_name, mime_type, created_at)
select od.worker_id, 'パスポート', od.storage_path, od.file_name, od.mime_type,
       coalesce(od.uploaded_at, od.created_at)
from onboarding_documents od
where od.doc_key = 'cert_passport'
  and od.storage_path <> ''
  and not exists (
    select 1 from worker_passport_files pf where pf.storage_path = od.storage_path
  );
delete from onboarding_documents where doc_key = 'cert_passport';

-- 2) 在留カード（申請書類準備時・両面）→ 在留カード・指定書
insert into worker_documents (worker_id, kind, storage_path, file_name, mime_type, created_at)
select od.worker_id, '在留カード', od.storage_path, od.file_name, od.mime_type,
       coalesce(od.uploaded_at, od.created_at)
from onboarding_documents od
where od.doc_key = 'cert_zairyu'
  and od.storage_path <> ''
  and not exists (
    select 1 from worker_documents wd where wd.storage_path = od.storage_path
  );
delete from onboarding_documents where doc_key = 'cert_zairyu';

-- 3) 履歴書 → 入社書類の「履歴書」へ一本化
-- 3-1) 入社書類側に履歴書の行が無い人は、行ごと付け替える
update onboarding_documents od
set doc_key = 'rirekisho', label = '履歴書'
where od.doc_key = 'cert_rirekisho'
  and not exists (
    select 1 from onboarding_documents t
    where t.worker_id = od.worker_id and t.doc_key = 'rirekisho'
  );

-- 3-2) 入社書類側に行はあるがファイルが無い人は、ファイル情報だけ移す
update onboarding_documents t
set storage_path = s.storage_path,
    file_name    = s.file_name,
    mime_type    = s.mime_type,
    uploaded_at  = coalesce(s.uploaded_at, s.created_at)
from onboarding_documents s
where s.doc_key = 'cert_rirekisho'
  and t.doc_key = 'rirekisho'
  and t.worker_id = s.worker_id
  and t.storage_path = ''
  and s.storage_path <> '';

-- 3-3) 移し終えた（入社書類側にファイルがある）人と、ファイルの無い行を消す。
--      入社書類側と別のファイルが両方ある珍しいケースだけは、消さずに残す（データを失わないため）
delete from onboarding_documents od
where od.doc_key = 'cert_rirekisho'
  and (
    od.storage_path = ''
    or exists (
      select 1 from onboarding_documents t
      where t.worker_id = od.worker_id
        and t.doc_key = 'rirekisho'
        and t.storage_path in ('', od.storage_path)
    )
  );
