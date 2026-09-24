import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PLEDGE_GUIDE_ROWS } from "@/lib/ssw2-pledge-guide";

// 「２号の誓約書（参考様式第１－３２号）の作り方」の案内。
// 所属機関 → 外国人詳細 → 申請準備 → 貼る文章のページ の順に、どこで何を入れるかを
// 画面の見本（プレビュー）付きで並べる。見本の中身は例で、実際のデータではない。
export function Ssw2PledgeGuide() {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-1 text-sm font-bold">
          ２号特定技能外国人の業務内容に関する誓約書（参考様式第１－３２号）を作るまで
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          アプリで入れた内容を、入管の様式（Word）に欄ごとに貼り付けて作ります。
          下の順番で入れていけば、最後のページで「どの欄に・何を貼るか」がそろいます。
          画面の見本は例です。オレンジの番号の欄が、入力するところです。
        </p>
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          {FLOW.map((f, i) => (
            <li key={f.title} className="rounded-xl border border-border bg-background p-2.5">
              <p className="text-[11px] font-bold text-brand">STEP {i + 1}</p>
              <p className="text-xs font-bold">{f.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{f.body}</p>
            </li>
          ))}
        </ol>
      </Card>

      {/* STEP 1 所属機関 */}
      <Step
        no={1}
        title="所属機関の情報で、会社ごとの内容を入れる（会社に1回だけ）"
        path={["メニュー", "所属機関の情報", "会社を開く", "いちばん下の「特定技能２号の指導体制」"]}
        href="/organizations"
        hrefLabel="所属機関の情報を開く"
      >
        <p className="text-[11px] leading-relaxed">
          同じ会社で２号を申請するたびに使う内容です。一度入れておけば、次の人からは入力不要です。
          会社に聞かないと分からないときは、カードの右上の
          <b>「聞き取りの質問票を印刷」</b>を印刷して、そのまま聞いてください。
        </p>
        <Mock title="特定技能２号の指導体制">
          <MockBox title="１　当該２号特定技能外国人の業務内容">
            <MockField mark="1" label="① 所属部署名" value="農業部門" />
            <MockField mark="2" label="② 役職又は地位" value="農作業員" />
            <MockField
              mark="3"
              label="③ 当該外国人が従事する具体的な職務内容"
              value="トマトをメインに栽培管理、収穫、選別、出荷等の耕種農業全般"
            />
            <MockField
              mark="4"
              label="④ 技能実習生・1号特定技能外国人との職務内容の違い"
              value="技能実習生・1号は指示に基づき作業を行う。2号は生育状況・天候を確認し、ハウスの温度管理や農薬散布などを主体的に行う…"
            />
          </MockBox>
          <MockBox title="２　指導を受ける対象者の共通の内容">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <MockField mark="5" label="事業所及び所属部署名" value="〇〇農園　農業部門" />
              <MockField mark="6" label="役職又は地位" value="耕種農業の一般社員" />
            </div>
            <MockField mark="7" label="指導を受ける職務内容" value="トマトの栽培や仕事の段取り" />
          </MockBox>
        </Mock>
        <Points
          items={[
            "①〜④は具体的に書きます（許否に大きく影響します）。③は作っている物・収穫物・作業の流れまで書きます。",
            "⑤〜⑦は、対象者が全員同じなら、ここに入れるだけで全員に入ります。人によって違うときだけ、STEP 3 でその人の欄に入れます。",
            "様式の「特定技能所属機関の氏名又は名称」は所属機関の「名称」、「作成責任者の氏名及び役職」は同じ画面の「代表者役職・氏名」から入ります。",
            "欄から離れると自動で保存されます。",
          ]}
        />
      </Step>

      {/* STEP 2 外国人詳細 */}
      <Step
        no={2}
        title="外国人詳細で、本人と対象者の登録を確認する"
        path={["メニュー", "外国人", "２号を申請する人／対象者を開く"]}
        href="/workers"
        hrefLabel="外国人の一覧を開く"
      >
        <Mock title="外国人詳細（基本情報）">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <MockField mark="1" label="氏名" value="TRAN THI VAN" />
            <MockField mark="2" label="在留カード番号" value="LJ1480****RG" />
            <MockField mark="3" label="現在の所属機関" value="〇〇農園" />
          </div>
        </Mock>
        <Points
          items={[
            "本人の氏名は、様式の冒頭「２号特定技能外国人　　との間で」に入ります。",
            "対象者（指導を受ける外国人）の在留カード番号も、それぞれの外国人詳細に入っているか確認します。対象者を選ぶと、ここから自動で入ります。",
            "所属機関が空だと、STEP 1 の内容が使えません。転職先で申請する場合は、申請準備で選んだ所属機関（転職先）の内容が使われます。",
          ]}
        />
      </Step>

      {/* STEP 3 申請準備 */}
      <Step
        no={3}
        title="申請準備で、申請種別を２号にして、指導を受ける対象者を選ぶ"
        path={["メニュー", "申請準備", "２号を申請する人を開く", "必要な書類・準備の詳細"]}
        href="/workers/renewals"
        hrefLabel="申請準備を開く"
      >
        <Mock title="申請準備 ＞ 必要な書類・準備の詳細">
          <MockField
            mark="1"
            label="申請種別"
            value="在留資格の変更許可（特定技能２号）※本人申請"
            select
          />
          <MockBox title="指導を受ける対象者（誓約書 参考様式第１－３２号）">
            <p className="mb-1.5 rounded-lg bg-background px-2 py-1 text-[11px] font-bold text-muted">
              農業は2名以上必要です。いま2名で足りています。
            </p>
            <div className="rounded-lg border border-border p-2">
              <p className="mb-1 text-[11px] font-bold text-muted">1人目</p>
              <MockField
                mark="2"
                label="この所属機関の外国人から選ぶ"
                value="HUYNH THI THANH TRUC（特定技能1号・在籍中）"
                select
              />
              <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <MockField label="対象者の氏名" value="HUYNH THI THANH TRUC" auto />
                <MockField label="在留カード番号（外国人のみ）" value="UH7439****RG" auto />
                <MockField label="事業所及び所属部署名" value="" placeholder="空なら「〇〇農園　農業部門」" />
                <MockField label="役職又は地位" value="" placeholder="空なら「耕種農業の一般社員」" />
              </div>
            </div>
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-muted">
              <Mark>3</Mark>＋ 対象者を足す
            </p>
          </MockBox>
          <p className="mt-2 inline-flex items-center gap-1 rounded-lg border border-brand bg-brand/5 px-3 py-2 text-xs font-bold text-brand">
            <Mark>4</Mark>２号の誓約書（参考様式第１－３２号）に貼る文章を開く →
          </p>
        </Mock>
        <Points
          items={[
            "申請種別を「在留資格の変更許可（特定技能２号）※本人申請」にすると、すぐ下に「指導を受ける対象者」の枠が出ます。",
            "「対象者を足す」→ 一覧から選ぶと、氏名と在留カード番号が自動で入ります。日本人従業員や登録の無い人は「選ばない」にして氏名を直接入れます。",
            "事業所・役職・職務内容は、空のままなら STEP 1 の共通の内容が使われます（欄に「空なら『…』」と出ます）。人によって違うときだけ入れます。",
            "ほかの２号申請者の対象者になっている人は選べません（様式の留意事項4）。分野ごとの必要人数（農業・建設などは2名以上）に足りないと赤く出ます。",
          ]}
        />
      </Step>

      {/* STEP 4 貼る文章 */}
      <Step
        no={4}
        title="「貼る文章」のページを開き、入管の様式（Word）に欄ごとに貼る"
        path={["申請準備", "２号の誓約書（参考様式第１－３２号）に貼る文章を開く"]}
      >
        <Mock title="２号の誓約書に貼る文章">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <MockField mark="1" label="作成年月日" value="2026/09/24" />
            <MockField mark="2" label="作成責任者の氏名及び役職" value="代表　〇〇　〇〇" />
          </div>
          <MockBox title="１　当該２号特定技能外国人の業務内容">
            <MockCopy where="「①　所属部署名」の右の欄" value="農業部門" mark="3" />
            <MockCopy where="「②　役職又は地位」の右の欄" value="農作業員" />
          </MockBox>
          <MockBox title="２　当該２号特定技能外国人に指導を受ける対象者一覧">
            <MockCopy
              where="1行目「対象者の氏名（外国人は在留カード番号も）」"
              value="HUYNH THI THANH TRUC（在留カード番号：UH7439****RG）"
            />
            <MockCopy where="1行目「事業所及び所属部署名」" value="〇〇農園　農業部門" />
          </MockBox>
        </Mock>
        <Points
          items={[
            "作成年月日と作成責任者は、このページで直せます（保存はされず、貼る文章にだけ使われます）。",
            "入管の様式（参考様式第１－３２号・Word）を開き、「貼る場所」に書いてある欄へ、右のコピーボタンで写した文章を貼ります。上から順に貼れば終わります。",
            "対象者が6人以上のときは、様式の表に行を足してから貼ります（留意事項5）。",
            "「２号特定技能外国人の署名」は本人が自分で書きます。",
            "「登録が足りないところ」が出ていたら、リンクから直してこのページを開き直します。",
          ]}
        />
      </Step>

      {/* 対応表 */}
      <Card className="p-4">
        <h2 className="mb-1 text-sm font-bold">様式の欄と、アプリで入れる場所の対応表</h2>
        <p className="mb-2 text-[11px] text-muted">様式の欄が空になっていたら、ここで入れる場所を確かめてください。</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[11px] leading-relaxed">
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-1.5 pr-2 font-bold">様式の欄</th>
                <th className="py-1.5 pr-2 font-bold">アプリで入れる場所</th>
                <th className="py-1.5 font-bold">手順</th>
              </tr>
            </thead>
            <tbody>
              {PLEDGE_GUIDE_ROWS.map((r) => (
                <tr key={r.form} className="border-b border-border align-top">
                  <td className="py-1.5 pr-2 font-bold">{r.form}</td>
                  <td className="py-1.5 pr-2">{r.where}</td>
                  <td className="whitespace-nowrap py-1.5 text-brand">STEP {r.step}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const FLOW = [
  { title: "所属機関の情報", body: "業務内容①〜④と、対象者の共通の内容を入れる（会社に1回）" },
  { title: "外国人詳細", body: "本人・対象者の氏名と在留カード番号、所属機関を確認" },
  { title: "申請準備", body: "申請種別を２号にして、指導を受ける対象者を選ぶ" },
  { title: "貼る文章のページ", body: "入管の様式（Word）に欄ごとにコピーして貼る" },
];

function Step({
  no,
  title,
  path,
  href,
  hrefLabel,
  children,
}: {
  no: number;
  title: string;
  path: string[];
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-bold text-brand">STEP {no}</p>
      <h2 className="mb-1 text-sm font-bold">{title}</h2>
      <p className="mb-2 flex flex-wrap items-center gap-1 text-[11px] text-muted">
        開く場所:
        {path.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && <span>＞</span>}
            <span className="rounded bg-background px-1.5 py-0.5 font-bold text-foreground">{p}</span>
          </span>
        ))}
        {href && (
          <Link href={href} className="ml-1 font-bold text-brand underline">
            {hrefLabel} →
          </Link>
        )}
      </p>
      <div className="space-y-2">{children}</div>
    </Card>
  );
}

// 画面の見本（実際の画面に似せた枠。操作はできない）
function Mock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div aria-label={`${title}の画面の見本`} className="rounded-xl border-2 border-dashed border-border bg-background p-3">
      <p className="mb-2 flex items-center justify-between gap-2 text-xs font-bold">
        {title}
        <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-normal text-muted">画面の見本</span>
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function MockBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-2.5">
      <p className="mb-1.5 text-[11px] font-bold">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Mark({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
      {children}
    </span>
  );
}

function MockField({
  mark,
  label,
  value,
  placeholder,
  select = false,
  auto = false,
}: {
  mark?: string;
  label: string;
  value: string;
  placeholder?: string;
  select?: boolean;
  auto?: boolean; // 自動で入る欄
}) {
  return (
    <div>
      <p className="mb-0.5 flex items-center gap-1 text-[11px] text-muted">
        {mark && <Mark>{mark}</Mark>}
        {label}
        {auto && <span className="text-[10px] text-brand">（自動で入る）</span>}
      </p>
      <p
        className={`flex min-h-[30px] items-center justify-between gap-2 rounded-lg border bg-background px-2 py-1 text-xs ${
          mark ? "border-orange-500 ring-2 ring-orange-500/30" : "border-border"
        } ${auto ? "opacity-70" : ""}`}
      >
        <span className={value ? "" : "text-muted"}>{value || placeholder}</span>
        {select && <span className="text-muted">▾</span>}
      </p>
    </div>
  );
}

function MockCopy({ where, value, mark }: { where: string; value: string; mark?: string }) {
  return (
    <div>
      <p className="mb-0.5 flex items-center gap-1 text-[11px] font-bold text-muted">
        {mark && <Mark>{mark}</Mark>}
        貼る場所: {where}
      </p>
      <p className="flex items-center gap-2">
        <span className="min-w-0 flex-1 rounded-lg bg-background px-2 py-1 text-xs">{value}</span>
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">コピー</span>
      </p>
    </div>
  );
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className="ml-4 list-disc space-y-0.5 text-[11px] leading-relaxed">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}
