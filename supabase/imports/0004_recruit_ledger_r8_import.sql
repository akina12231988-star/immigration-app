-- 求人管理簿・求職管理簿の過去データ（2026年4月〜2027年3月）の取り込み【その2: 本体】
--
-- その1（0003_recruit_ledger_r8_check.sql）の確認結果に合わせた取り込みです。
--   求人 21件 / 求職者 72名 / 紹介 76件
--
-- することは4つだけです。
--   1. 会社・機関マスタに無い求人者を追加する（確認結果のとおり）
--   2. 求人（job_postings）を追加する（求人受理番号 R8KJN-◯◯ ごとに1件）
--   3. 外国人に無い求職者を追加する（在籍状況「求職活動中」・支援対象外・
--      備考に「求職管理簿の過去データ」と入れるので、現在の在籍者と混ざりません）
--   4. 求職受付番号・受付日・有効期間を外国人に入れ、紹介（応募）の実績を追加する
--
-- 既に入っているものは飛ばすので、何度実行しても二重登録になりません。
-- 実行すると Supabase が「destructive operations」と出しますが、消しているのは
-- この SQL の中だけで使う作業用の一時表（imp_posting / imp_seeker）です。
-- 「Run without RLS」で実行してください。
-- ※ この年度の求人票には「有効期間」の欄が無いため、受付日から3か月後を有効期間として入れます
--   （前年度の求人管理簿と同じ扱い）。

-- 取り込むデータ（CSVそのまま。この接続の中だけで使う一時表）。
-- 何度でも実行できるよう、先に作り直す。
drop table if exists imp_posting;
drop table if exists imp_seeker;

create temp table imp_posting (
  acceptance_no text, org_name text, employer text,
  received_on date, valid_until date, openings int,
  job_type text, work_location text, org_address text,
  employment_period text, contact text, wage_kind text, wage_amount int
);
insert into imp_posting values
  ('R8KJN-18', '井上 雅夫', '井上 雅夫', '2026-05-01', '2026-08-01', 1, '耕種農業', '熊本県八代市郡築十一番町115-2', '熊本県八代市郡築十一番町115-2', '有期', '0965-37-0545', '時給', 1060),
  ('R8KJN-9', '井上雅夫', '井上雅夫', '2026-04-03', '2026-07-03', 1, '耕種農業', '熊本県八代市郡築十一番町115-2', '熊本県八代市郡築十一番町115-2', '有期', '0965-37-0545', '時給', 1060),
  ('R8KJN-15', '井上 洋介', '井上 洋介', '2026-06-01', '2026-09-01', 1, 'トマトの栽培と収穫', '〒866-0002 熊本県八代市郡築十一番町79-2', '〒866-0002 熊本県八代市郡築十一番町79-2', '有期', '0965-37-0553', '時給', 1050),
  ('R8KJN-6', '稲田 哲也', '稲田 哲也', '2026-04-02', '2026-07-02', 2, '耕種農業', '熊本県八代市郡築６番町35-2', '熊本県八代市郡築６番町35-2', '有期', '0965-37-0230', '月給', 196000),
  ('R8KJN-8', '岩下 みちる', '岩下 みちる', '2026-04-06', '2026-07-06', 1, '耕種農業', '熊本県八代市郡築十二番町29-2', '熊本県八代市郡築十二番町29-2', '有期', '0965-37-0826', '時給', 1050),
  ('R8KJN-4', '岩崎恭志', '岩崎恭志', '2026-04-02', '2026-07-02', 1, '農業', '〒866-0824 熊本県八代市上日置町４２６４−３', '〒866-0824 熊本県八代市上日置町４２６４−３', '有期', '090-1169-6043', '月給', 180000),
  ('R8KJN-25', '高濱 拓己', '高濱 拓己', '2026-06-01', '2026-09-01', 1, '野菜の収穫と栽培', '熊本県八代市昭和同仁町338番地202', '熊本県八代市昭和同仁町338番地202', '有期', '0965-37-2245', '時給', 1070),
  ('R8KJN-11', '三山 圭史', '三山 圭史', '2026-04-15', '2026-07-15', 1, '耕種農業', '熊本県八代市郡築十番町172-2', '熊本県八代市郡築十番町172-2', '有期', '0965-62-9420', '時給', 1050),
  ('R8KJN-14', '西田 博幸', '西田 博幸', '2026-05-25', '2026-08-25', 1, '耕種農業', '〒869-4801 熊本県八代郡氷川町新田681', '〒869-4801 熊本県八代郡氷川町新田681', '有期', '0965-52-7167', '時給', 1060),
  ('R8KJN-17', '西田 博幸', '西田 博幸', '2026-05-05', '2026-08-05', 1, 'いちご', '熊本県八代郡氷川町新田681', '熊本県八代郡氷川町新田681', '有期', '0965-52-7167', '時給', 1060),
  ('R8KJN-16', '西田 祐一', '西田 祐一', '2026-05-01', '2026-08-01', 1, '耕種農業', '〒869-4702 熊本県八代市千丁町吉王丸1426', '〒869-4702 熊本県八代市千丁町吉王丸1426', '有期', '0965-46-0348', '月給', 185500),
  ('R8KJN-7', '藤本 未和', '藤本 未和', '2026-04-13', '2026-07-13', 1, '耕種農業', '熊本県阿蘇郡西原村大字小森383番地', '熊本県阿蘇郡西原村大字小森383番地', '有期', '096-279-3534', '時給', 1034),
  ('R8KJN-10', '片山 大輔', '片山 大輔', '2026-04-14', '2026-07-14', 1, '耕種農業', '熊本県八代市郡築一番町298-2', '熊本県八代市郡築一番町298-2', '有期', '0965-37-0107', '時給', 1070),
  ('R8KJN-13', '有限会社徳永蒲鉾店', '有限会社徳永蒲鉾店', '2026-04-08', '2026-07-08', 1, '食品製造業', '熊本県玉名郡長洲町大字長洲833-1-1', '熊本県玉名郡長洲町大字長洲833-1-1', '有期', '0968-78-0007', '時給', 1050),
  ('R8KJN-3', '有限会社國崎青果', '有限会社國崎青果', '2026-04-02', '2026-07-02', 20, '農業分野', '季節に応じて、各地に行く', '長崎県雲仙市南串山町丙１９３９', '有期', '0965-32-5337', '時給', 1050),
  ('R8KJN-20', '大家 聖矢', '大家 聖矢', '2026-07-05', '2026-10-05', 3, '耕種農業', '熊本県玉名市横島町共栄61', '熊本県玉名市横島町共栄61', '有期', '0968-51-3453', '時給', 1042),
  ('R8KJN-19', '藤吉 淳', '藤吉 淳', '2026-05-29', '2026-08-29', 2, '耕種農業', '熊本県八代市郡築三番町１７５の２', '熊本県八代市郡築三番町１７５の２', '有期', '0965-37-0901', '時給', 1050),
  ('R8KJN-22', '宮本 浩光', '宮本 浩光', '2026-05-29', '2026-08-29', 1, '耕種農業', '熊本県八代市鏡町宝出296', '熊本県八代市鏡町宝出296', '有期', '0965-52-3133', '時給', 1050),
  ('R8KJN-12', 'BASE株式会社', 'BASE株式会社', '2026-04-28', '2026-07-28', 5, '耕種農業', null, null, '有期', null, '時給', null),
  ('R8KJN-21', '三山 圭史', '三山 圭史', '2026-05-29', '2026-08-29', 2, '耕種農業', '熊本県八代市郡築十番町172-2', '熊本県八代市郡築十番町172-2', '有期', '0965-62-9420', '時給', 1050),
  ('R8KJN-2', '高濱伸吉', '高濱伸吉', '2026-04-02', '2026-07-02', 1, '農業', '〒866-0008 熊本県八代市郡築五番町126-2', '〒866-0008 熊本県八代市郡築五番町126-2', '有期', '090-1088-1864', '時給', 1050);

create temp table imp_seeker (
  jobseeker_no text, name text, address text, birth date, field text,
  accepted_on date, valid_until date,
  acceptance_no text, applied_on date, result text, result_on date, employment_term text
);
insert into imp_seeker values
  ('R8KS-2', 'NGUYEN QUANG LAN', '熊本県玉名市横島町共栄60番地（大家方）', '1995-09-13', '耕種農業', '2026-04-01', '2026-07-01', 'R8KJN-2', '2026-04-03', '採用', '2026-04-04', '有期'),
  ('R8KS-3', 'LE DINH TIEN', '熊本県玉名市横島町共栄60番地（大家方）', '1987-10-03', '耕種農業', '2026-04-01', '2026-07-01', 'R8KJN-4', '2026-04-03', '採用', '2026-04-04', '有期'),
  ('R8KS-4', 'LE DUY TUNG', '大分県国東市国東町浜崎2535番地3　シーサイドコー浜崎Ⅱ203号', '1995-03-12', '耕種農業', '2026-04-01', '2026-07-01', 'R8KJN-6', '2026-04-02', '採用', '2026-04-03', '有期'),
  ('R8KS-5', 'NGUYEN THI HANH', '大分県国東市国東町浜崎3090番地2（株）ハマノ果香園実習生宿舎', '1991-08-12', '耕種農業', '2026-04-01', '2026-07-01', 'R8KJN-6', '2026-04-02', '採用', '2026-04-03', '有期'),
  ('R8KS-6', 'PREAP KUNTHEA', '岡山県津山市西中355番地1 第28ASKコーポ302号室', '1995-11-30', '耕種農業', '2026-04-01', '2026-07-01', 'R8KJN-3', '2026-04-03', '採用', '2026-04-04', '有期'),
  ('R8KS-7', 'PHAM MANH DUC', '東京都世田谷区駒沢1丁目6番4号　オオツハウス駒沢107', '2004-01-03', '耕種農業', '2026-04-01', '2026-07-01', 'R8KJN-3', '2026-04-03', '採用', '2026-04-04', '有期'),
  ('R8KS-8', 'TRAN THI THUY', '熊本県阿蘇市内牧269番地3', '1985-04-20', '耕種農業', '2026-04-01', '2026-07-01', 'R8KJN-3', '2026-04-03', '採用', '2026-04-04', '有期'),
  ('R8KS-10', 'CHHOURN SOMONNY', '千葉県船橋市高野台2丁目１７番２０号', '1996-05-13', '耕種農業', '2026-04-08', '2026-07-08', 'R8KJN-3', '2026-04-10', '採用', '2026-04-11', '有期'),
  ('R8KS-11', 'CHIB SARIN', '茨城県東茨城郡大洗町成田町788番地　宮部弘己方', '2001-04-11', '耕種農業', '2026-04-08', '2026-07-08', 'R8KJN-3', '2026-04-10', '採用', '2026-04-11', '有期'),
  ('R8KS-12', 'CHHENG CHRAY', '愛知県田原市赤羽根町道亀原145', '1994-05-10', '耕種農業', '2026-04-06', '2026-07-06', 'R8KJN-3', '2026-04-08', '採用', '2026-04-10', '有期'),
  ('R8KS-13', 'JAB SARON', '茨城県東茨城郡大洗町成田町788番地　宮部 弘己方', '1998-06-10', '耕種農業', '2026-04-06', '2026-07-06', 'R8KJN-3', '2026-04-10', '採用', '2026-04-11', '有期'),
  ('R8KS-14', 'HOANG CONG HUY', '埼玉県草加市谷塚町1435番地1 レオパレスバリオヴェルデ212号', '2005-11-27', '耕種農業', '2026-04-10', '2026-07-10', 'R8KJN-7', '2026-04-12', '採用', '2026-04-13', '有期'),
  ('R8KS-15', 'NGUYEN CHI TOAN', '栃木県宇都宮市茂原1丁目3番4号　ワコーハイツⅡ105', '1986-03-24', '耕種農業', '2026-04-06', '2026-07-06', 'R8KJN-3', '2026-04-13', '不採用', null, null),
  ('R8KS-16', 'TRUONG THI QUYNH', '茨城県神栖市若松中央5丁目58番地 ハートハイツB様5号', '1994-02-03', '耕種農業', '2026-04-01', '2026-07-01', 'R8KJN-8', '2026-04-09', '採用', '2026-04-13', '有期'),
  ('R8KS-17', 'CHU THI SAM', null, null, null, null, null, 'R8KJN-9', null, '不採用', null, null),
  ('R8KS-18', 'CHU THI SAM', '熊本県八代市古関浜町3448番地60', '1990-02-22', '耕種農業', '2026-04-01', '2026-07-01', 'R8KJN-3', '2026-04-03', '採用', '2026-04-04', '有期'),
  ('R8KS-20', 'NGUYEN THI NA', '富山県南砺市福光 6633', '1982-12-08', '耕種農業', '2026-04-20', '2026-07-20', 'R8KJN-3', '2026-04-16', '採用', '2026-04-18', '有期'),
  ('R8KS-21', 'NGUYEN DUC CHIEN', '福岡県福岡市城南区樋井川2丁目2番30号AGAO ANNEX DAIREL 406号', '2004-07-21', '耕種農業', '2026-04-13', '2026-07-13', 'R8KJN-3', '2026-04-20', '採用', '2026-04-22', '有期'),
  ('R8KS-22', 'LE THI HA', '東京都青梅市師岡町４丁目２番地の7　川杉マンション507', '2004-02-20', '耕種農業', '2026-04-06', '2026-07-06', 'R8KJN-3', '2026-04-23', '採用', '2026-04-25', '有期'),
  ('R8KS-24', 'DUONG VAN HOAN', null, null, null, null, null, 'R8KJN-10', null, '不採用', null, null),
  ('R8KS-25', 'DUONG VAN HOAN', '熊本県玉名市横島町共栄60番地（大家方）', '1985-04-08', '耕種農業', '2026-04-06', '2026-07-06', 'R8KJN-10', '2026-04-23', '採用', '2026-04-25', '有期'),
  ('R8KS-26', 'LY RATANA', '千葉県八街市八街へ199番地1109 土居アパート102', '1990-10-19', '耕種農業', '2026-04-22', '2026-07-22', 'R8KJN-3', '2026-04-24', '採用', '2026-04-25', '有期'),
  ('R8KS-28', 'NGUYEN THI VAN ANH', '熊本県八代市郡築八番町57番地2', '1990-12-18', '耕種農業', '2026-04-10', '2026-07-10', 'R8KJN-11', '2026-04-23', '採用', '2026-04-25', '有期'),
  ('R8KS-29', 'HOANG VAN HIEN', '熊本県玉名市滑石3337番地3　（株）カワカミ寮', '1997-12-13', '耕種農業', '2026-04-08', '2026-07-08', 'R8KJN-3', '2026-04-23', '採用', '2026-04-27', '有期'),
  ('R8KS-30', 'HAM SYNA', '岐阜県岐阜市西荘3番地1　クレールアビタシオン202号室', '2003-10-03', '耕種農業', '2026-05-01', '2026-08-01', 'R8KJN-3', '2026-05-04', '採用', '2026-05-07', '有期'),
  ('R8KS-31', 'DANG CONG AN', '北海道虻田郡京極町字三崎127番地 コーポはまなす右手14号室', '1999-07-14', '食品製造業', '2026-04-15', '2026-07-15', 'R8KJN-13', '2026-04-29', '採用', '2026-05-02', '有期'),
  ('R8KS-32', 'SIM HIENGSOPHEAK', '愛知県豊川市当古町西船渡17番地', '2002-07-28', '耕種農業', '2026-05-13', '2026-08-13', 'R8KJN-3', '2026-05-15', '採用', '2026-05-18', '有期'),
  ('R8KS-33', 'TO SREYTOCH', null, null, null, null, null, 'R8KJN-3', null, '不採用', null, null),
  ('R8KS-34', 'TO SREYTOCH', '青森県黒石市大字上十川字留岡六番 3番地1', '1985-10-10', '耕種農業', '2026-05-06', '2026-08-06', 'R8KJN-3', '2026-05-10', '採用', '2026-05-15', '有期'),
  ('R8KS-35', 'SAM SREYLEAB', '青森県黒石市大字上十川字留岡六番3番地1', '1989-08-10', '耕種農業', '2026-05-11', '2026-08-11', 'R8KJN-3', '2026-05-13', '採用', '2026-05-15', '有期'),
  ('R8KS-36', 'CHHOEM SOPANHA', '沖縄県中頭郡読谷村字古堅928番地3 　クレイノRAMA204', '2004-02-23', '耕種農業', '2026-05-11', '2026-08-11', 'R8KJN-3', '2026-05-14', '採用', '2026-05-16', '有期'),
  ('R8KS-37', 'SAN NAISORN', '沖縄県中頭郡読谷村宇楚辺2149番地1', '2000-05-02', '耕種農業', '2026-05-11', '2026-08-11', 'R8KJN-3', '2026-05-15', '採用', '2026-05-16', '有期'),
  ('R8KS-38', 'TRAN QUANG NGUYEN', '栃木県宇都宮市茂原1丁目3番4号　ワコーハイツⅡ105', '1997-08-20', '耕種農業', '2026-04-03', '2026-07-03', 'R8KJN-3', '2026-04-07', '採用', '2026-04-09', '有期'),
  ('R8KS-39', 'PHAT CHANNY', '長崎県雲仙市小浜町富津3780番地', '1988-08-18', '耕種農業', '2026-05-31', '2026-08-31', 'R8KJN-3', '2026-06-02', '採用', '2026-06-03', '有期'),
  ('R8KS-40', 'YEUN TIKRECH', '沖縄県中頭郡読谷村字古堅928番地3　クレイノRAMA204', '2000-07-13', '耕種農業', '2026-06-01', '2026-09-01', 'R8KJN-3', '2026-06-04', '採用', '2026-06-06', '有期'),
  ('R8KS-41', 'NGUYEN THI MONG DAO', '京都府京都市伏見区横大路下三栖山殿5番地130', '1989-01-01', '耕種農業', '2026-06-01', '2026-09-01', 'R8KJN-14', '2026-06-02', '採用', '2026-06-05', '有期'),
  ('R8KS-42', 'CHHEANGY SREYTOUCH', '熊本県八代市鏡町下村1420番地14', '1994-06-01', '耕種農業', '2026-06-01', '2026-09-01', 'R8KJN-3', '2026-06-03', '採用', '2026-06-05', '有期'),
  ('R8KS-43', 'KPA PHI LA', '熊本県八代市郡築十番町90番地2', '1993-11-23', '耕種農業', '2026-06-08', '2026-09-08', 'R8KJN-15', '2026-06-15', '採用', '2026-06-17', '有期'),
  ('R8KS-44', 'FARREL ZIMRAAN ARDANI', 'インドネシア、西スマトラ州、アガム市', '2006-06-15', '耕種農業', '2026-06-18', '2026-09-18', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-45', 'ZIKRIYUL FAHMI', null, '2007-03-19', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-46', 'RAFIQ ALFALQI', null, '2005-10-23', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-47', 'HAIDAR HAFIDZ', null, '2003-12-28', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-18', '採用', '2026-06-22', '有期'),
  ('R8KS-48', 'FIKRI SETIAWAN', null, '2002-01-05', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-18', '採用', '2026-06-22', '有期'),
  ('R8KS-49', 'HOTSAN FIRMANSYAH ARUAN', null, '2003-05-01', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-50', 'ADITIAWARMAN', null, '2006-01-21', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-51', 'DIAN RANGKUTI', null, '1996-07-21', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-52', 'MARHAN SAPUTRA', null, '2006-08-20', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-53', 'MANGGA SATRIA DAMANIK', null, '2005-10-25', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-55', 'RAFI IRSYAD KHADAFI', null, '2005-08-31', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-56', 'MUHAMMAD JEFRI', null, '2006-10-07', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-57', 'WILKI KRISMA YANDRA', null, '1999-01-27', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-58', 'AXEL TRIMANDA', null, '2001-09-16', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-59', 'IRPAS SEPTARIA ILAHI', null, '2004-09-25', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-60', 'BAGAS STEVANO', null, '2003-12-28', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-61', 'MUHAMMAD FARHAN', null, '2006-05-05', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-62', 'FEBRIAN AGIL SAPUTRA', null, '2003-02-05', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-63', 'GEMA YOGI SAPUTRA', null, '2004-09-11', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-64', 'ANHAR', null, '1992-04-30', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-65', 'RAHMADANI ZEKI', null, '1985-06-16', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-66', 'ADRIAN HABIBULLAH', null, '2002-10-12', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-67', 'MUHAMMAD FAREL', null, '2003-04-02', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-68', 'TEGUH RIZKI', null, '2005-06-01', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-69', 'EDRIANO PUTRA ZIKRI', null, '2005-09-15', '耕種農業', '2026-06-15', '2026-09-15', 'R8KJN-3', '2026-06-19', '採用', '2026-06-22', '有期'),
  ('R8KS-70', 'LE THI DIU', '熊本県八代市新浜町1番1号', null, '耕種農業', '2026-05-15', '2026-08-15', 'R8KJN-17', null, '不採用', null, null),
  ('R8KS-71', 'LE THI DIU', '熊本県八代市新浜町1番1号', '1994-08-02', '耕種農業', '2026-05-15', '2026-08-15', 'R8KJN-17', '2026-05-18', '採用', '2026-05-21', '有期'),
  ('R8KS-73', 'HOANG KIM HUONG', '長崎県西海市大瀬戸町瀬戸坂浦郷770番地1', '2004-06-23', null, null, null, 'R8KJN-18', null, '不採用', null, null),
  ('R8KS-75', 'NGUYEN VAN TINH', '北海道虻田郡京極町字三崎127番地 コーポはまなす左24号', '1990-02-20', '耕種農業', '2026-05-01', '2026-08-01', 'R8KJN-12', '2026-05-05', '採用', '2026-05-15', '有期'),
  ('R8KS-76', 'NGET CHITTHA', '熊本県八代市鏡町北新地1249番地2', '2002-04-09', '耕種農業', '2026-05-01', '2026-08-01', 'R8KJN-12', '2026-05-11', '採用', '2026-05-13', '有期'),
  ('R8KS-77', 'NGUYEN HOAI THUONG', '東京都青海市師岡町４丁目２番地の７川杉マンション507', '2004-08-14', '耕種農業', '2026-05-04', '2026-08-04', 'R8KJN-3', '2026-05-14', '採用', '2026-05-15', '有期'),
  ('R8KS-78', 'HOL SINET', '愛知県あま市七宝町桂親田８番地　DAIMAN HOUSE七宝301号', '2001-03-06', '耕種農業', '2026-05-01', '2026-08-01', 'R8KJN-3', '2026-05-11', '採用', '2026-05-15', '有期'),
  ('R8KS-79', 'TRUNOG THI DUYEN', '熊本県八代市郡築十二番町279番地2', '2004-08-03', '耕種農業', '2026-06-01', '2026-09-01', 'R8KJN-25', '2026-06-11', '採用', '2026-06-15', '有期'),
  ('R8KS-81', 'NGUYEN THI ANH', null, '2000-05-29', '耕種農業', '2026-06-29', '2026-09-29', 'R8KJN-22', '2026-05-29', '採用', '2026-07-30', '有期'),
  ('R8KS-82', 'MEAS SREYPICH', '沖縄県中頭郡読谷村字古堅９２８番地３　Kureino RAMA204', '1990-04-24', '耕種農業', '2026-05-01', '2026-08-01', 'R8KJN-3', '2026-05-20', '採用', '2026-05-22', '有期'),
  ('R8KS-83', 'VU TA DUNG', '東京都荒川区町屋４丁目２番２１号　コーポ竹島３０２', '1996-06-06', '耕種農業', '2026-04-02', '2026-07-02', 'R8KJN-3', '2026-04-09', '採用', '2026-04-10', '有期'),
  ('R8KS-84', 'MA THI HA', '宮崎県小林市真方８１９番地１', '2001-02-09', '耕種農業', '2026-05-01', '2026-08-01', 'R8KJN-3', '2026-05-05', '採用', '2026-05-15', '有期'),
  ('R8KS-85', 'BOY SAMNANG', '愛知県弥富加稲二丁目32番地　加稲H・Sマンション1B', '1999-12-12', '耕種農業', '2026-05-14', '2026-08-14', 'R8KJN-3', '2026-05-18', '採用', '2026-05-20', '有期');

-- 氏名の突き合わせ用（空白・記号を取り除いて比べる）
create or replace function pg_temp.norm(t text) returns text language sql immutable as $fn$
  -- 空白・記号を取り除き、漢字の異体字（髙・高、﨑・崎、濵・濱 など）もそろえて比べる
  select upper(translate(
    regexp_replace(coalesce(t, ''), '[[:space:]　・（）()、。，,.]', '', 'g'),
    '髙﨑濵栁桒邊邉齋齊',
    '高崎濱柳桑辺辺斎斉'
  ))
$fn$;


-- ============================================================
-- 1) 会社・機関マスタに無い求人者を追加する
-- ============================================================
insert into organizations (name, address, contact, note)
select distinct on (pg_temp.norm(p.org_name))
       p.org_name, coalesce(p.org_address, ''), coalesce(p.contact, ''),
       '求人管理簿の過去データ（2026年4月〜2027年3月）で登録'
from imp_posting p
where not exists (
  select 1 from organizations o
  where pg_temp.norm(o.name) = pg_temp.norm(p.org_name)
     or pg_temp.norm(o.name) = pg_temp.norm(p.employer)
     or pg_temp.norm(o.name) like '%' || pg_temp.norm(p.org_name) || '%'
     or pg_temp.norm(o.name) like '%' || pg_temp.norm(p.employer) || '%'
)
order by pg_temp.norm(p.org_name), p.received_on nulls last;

-- 求人者と会社・機関マスタの対応表（このあとずっと使う）
drop table if exists imp_org_map;
create temp table imp_org_map as
select p.acceptance_no, o.id as organization_id
from imp_posting p
left join lateral (
  select o.id, o.name
  from organizations o
  where pg_temp.norm(o.name) = pg_temp.norm(p.org_name)
     or pg_temp.norm(o.name) = pg_temp.norm(p.employer)
     or pg_temp.norm(o.name) like '%' || pg_temp.norm(p.org_name) || '%'
     or pg_temp.norm(o.name) like '%' || pg_temp.norm(p.employer) || '%'
  order by length(o.name)
  limit 1
) o on true;

-- 連絡先が空の会社にだけ、求人票の電話番号を入れる（入っている会社は触らない）
update organizations o
set contact = m.contact
from (
  select distinct on (map.organization_id) map.organization_id, p.contact
  from imp_posting p
  join imp_org_map map on map.acceptance_no = p.acceptance_no
  where coalesce(p.contact, '') <> '' and map.organization_id is not null
  order by map.organization_id, p.received_on nulls last
) m(organization_id, contact)
where o.id = m.organization_id and coalesce(o.contact, '') = '';

-- ============================================================
-- 2) 求人（求人管理簿）を追加する
-- ============================================================
insert into job_postings (
  organization_id, acceptance_no, received_on, valid_until, openings,
  job_type, work_location, employment_period, wage_kind, wage_amount,
  contact, status, note
)
select
  map.organization_id,
  p.acceptance_no,
  -- 受付日が空の求人は、その求人への最初の紹介日で代用する
  coalesce(
    p.received_on,
    (select min(coalesce(s.applied_on, s.accepted_on, s.result_on))
       from imp_seeker s where s.acceptance_no = p.acceptance_no),
    current_date
  ),
  p.valid_until,
  greatest(coalesce(p.openings, 1), 1),
  coalesce(p.job_type, ''),
  coalesce(p.work_location, ''),
  coalesce(p.employment_period, ''),
  coalesce(p.wage_kind, '時給')::wage_type,
  p.wage_amount,
  coalesce(p.contact, ''),
  case when p.valid_until is null or p.valid_until >= current_date then '募集中' else '終了' end::posting_status,
  '過去データ取込（2026年4月〜2027年3月 求人管理簿）'
from imp_posting p
join imp_org_map map on map.acceptance_no = p.acceptance_no
where map.organization_id is not null
  and not exists (select 1 from job_postings jp where jp.acceptance_no = p.acceptance_no);

-- ============================================================
-- 3) 外国人に無い求職者を追加する
-- ============================================================
insert into workers (name, address, birth, field, status, support, note)
select distinct on (pg_temp.norm(s.name))
       s.name, coalesce(s.address, ''), s.birth, coalesce(s.field, ''),
       '求職活動中'::worker_status, '支援対象外'::support_scope,
       '求職管理簿の過去データ（2026年4月〜2027年3月）で登録'
from imp_seeker s
where coalesce(s.name, '') <> ''
  and not exists (
    select 1 from workers w
    where pg_temp.norm(w.name) = pg_temp.norm(s.name)
       or pg_temp.norm(w.name) like pg_temp.norm(s.name) || '%'
  )
order by pg_temp.norm(s.name), s.accepted_on nulls last;

-- 求職者と外国人の対応表
drop table if exists imp_worker_map;
create temp table imp_worker_map as
select s.name, w.id as worker_id
from (select distinct name from imp_seeker where coalesce(name, '') <> '') s
left join lateral (
  select w.id
  from workers w
  where pg_temp.norm(w.name) = pg_temp.norm(s.name)
     or pg_temp.norm(w.name) like pg_temp.norm(s.name) || '%'
  order by length(w.name)
  limit 1
) w on true;

-- ============================================================
-- 4) 求職受付（求職管理簿）と紹介の実績を入れる
-- ============================================================
-- 置き換え前の求職受付番号を控える（前年度の番号が入っていた人を最後に報告する）
drop table if exists imp_prev_no;
create temp table imp_prev_no as
select w.id as worker_id, w.name, w.jobseeker_no as before_no
from workers w
join imp_worker_map m on m.worker_id = w.id
where coalesce(w.jobseeker_no, '') <> '';

-- 求職受付番号は1人に1つしか持てないので、いちばん新しい受付（今年度）を入れる。
-- 前年度の番号が入っている人は、今年度の番号に置き換える
update workers w
set jobseeker_no = latest.jobseeker_no,
    jobseeker_accepted_on = latest.accepted_on,
    jobseeker_valid_until = latest.valid_until,
    -- 住所・生年月日・希望職種は、まだ空のときだけ埋める
    address = case when coalesce(w.address, '') = '' then coalesce(latest.address, '') else w.address end,
    birth = coalesce(w.birth, latest.birth),
    field = case when coalesce(w.field, '') = '' then coalesce(latest.field, '') else w.field end
from (
  select distinct on (m.worker_id)
         m.worker_id, s.jobseeker_no, s.accepted_on, s.valid_until, s.address, s.birth, s.field
  from imp_seeker s
  join imp_worker_map m on m.name = s.name
  where m.worker_id is not null and coalesce(s.jobseeker_no, '') <> ''
  order by m.worker_id, s.accepted_on desc nulls last, s.jobseeker_no desc
) latest
where w.id = latest.worker_id
  and (
    coalesce(w.jobseeker_no, '') = ''
    or w.jobseeker_accepted_on is null
    or latest.accepted_on > w.jobseeker_accepted_on
  );

-- 紹介（応募）の実績。求人受理番号が入っている行だけ入れる
insert into job_applications (
  worker_id, organization_id, job_posting_id, applied_on, result, result_on, employment_term, note
)
select
  m.worker_id,
  jp.organization_id,
  jp.id,
  coalesce(s.applied_on, s.result_on, s.accepted_on, jp.received_on),
  s.result::application_result,
  -- 「不採用」は日付が無いことがあるので、紹介日で代用する（様式には出ません）
  case when s.result = '採用' then s.result_on
       else coalesce(s.result_on, s.applied_on, s.accepted_on, jp.received_on) end,
  coalesce(s.employment_term, ''),
  '過去データ取込（2026年4月〜2027年3月 求職管理簿）'
from imp_seeker s
join imp_worker_map m on m.name = s.name and m.worker_id is not null
join job_postings jp on jp.acceptance_no = s.acceptance_no
where coalesce(s.acceptance_no, '') <> ''
  and coalesce(s.result, '') <> ''
  and not exists (
    select 1 from job_applications a
    where a.worker_id = m.worker_id and a.job_posting_id = jp.id
  );

-- ============================================================
-- 5) 取り込み結果（この表を送ってください）
-- ============================================================
select '1. 求人（求人管理簿）' as 項目,
       (select count(*)::text from job_postings jp join imp_posting p on jp.acceptance_no = p.acceptance_no)
       || ' / ' || (select count(*)::text from imp_posting) || ' 件' as 取り込み済み
union all
select '2. 求職受付（求職管理簿）',
       (select count(distinct w.id)::text from workers w
          join imp_worker_map m on m.worker_id = w.id
         where coalesce(w.jobseeker_no, '') <> '')
       || ' / ' || (select count(distinct name)::text from imp_seeker) || ' 人'
union all
select '3. 紹介の実績',
       (select count(*)::text from job_applications a where a.note = '過去データ取込（2026年4月〜2027年3月 求職管理簿）')
       || ' / ' || (select count(*)::text from imp_seeker where coalesce(acceptance_no, '') <> '') || ' 件'
union all
select '4. 新しく作った会社',
       coalesce((select string_agg(o.name, ' / ' order by o.name) from organizations o
                 where o.note = '求人管理簿の過去データ（2026年4月〜2027年3月）で登録'), '（なし）')
union all
select '5. 新しく作った外国人（求職活動中・支援対象外）',
       coalesce((select string_agg(w.name, ' / ' order by w.name) from workers w
                 where w.note = '求職管理簿の過去データ（2026年4月〜2027年3月）で登録'), '（なし）')
union all
select '6. 求人に結びつかなかった紹介（求人受理番号なし）',
       (select count(*)::text from imp_seeker where coalesce(acceptance_no, '') = '' and coalesce(name, '') <> '') || ' 件（不採用の記録。求職管理簿には受付だけ載ります）'
union all
select '7. 前年度の求職受付番号を今年度のものに置き換えた人',
       coalesce((select string_agg(p.name || '（' || p.before_no || '→' || w.jobseeker_no || '）', ' / ' order by p.name)
                 from imp_prev_no p join workers w on w.id = p.worker_id
                 where w.jobseeker_no <> p.before_no), '（なし）')
union all
select '8. 外国人に結びつかなかった求職者',
       coalesce((select string_agg(name, ' / ') from imp_worker_map where worker_id is null), '（なし）');
