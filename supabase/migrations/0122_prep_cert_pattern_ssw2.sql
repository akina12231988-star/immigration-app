-- 合格証の組み合わせに「特定技能２号の合格証」を追加。
-- 申請種別が特定技能２号のときは、専門級・日本語・専門外・技能評価調書ではなく
-- 特定技能２号の合格証だけが要るため。0113 で付けた CHECK 制約を入れ替える。
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
      '技能評価調書',
      '特定技能2号'
    )
  );
