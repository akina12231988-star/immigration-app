-- 合格証の組み合わせに「専門外・技能評価調書」
-- （専門級以外の分野で就職（技能評価調書あり）→ 専門外＋技能評価調書）を追加。
-- 0047 で付けた CHECK 制約を入れ替える。
alter table application_prep_checklists
  drop constraint if exists application_prep_checklists_cert_pattern_check;
alter table application_prep_checklists
  add constraint application_prep_checklists_cert_pattern_check
  check (
    cert_pattern in (
      '',
      '専門級',
      '別分野・専門級',
      '専門外・日本語',
      '専門外・技能評価調書',
      '技能評価調書'
    )
  );
