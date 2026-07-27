"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import {
  deleteOrganization,
  insertOrganization,
  updateOrganization,
} from "@/lib/supabase/queries/organizations";
import { SSW_INDUSTRIES, categoriesFor } from "@/lib/industries";
import {
  FINANCIAL_YEAR_LABELS,
  emptyJapaneseStaff,
  emptyOfficer,
  emptyOrganizationIntake,
  normalizeOrganizationIntake,
} from "@/lib/organization-intake";
import type {
  OrgFinancialYear,
  OrgJapaneseStaff,
  OrgOfficer,
  Organization,
  OrganizationInput,
  OrganizationIntake,
} from "@/types/db";

const EMPTY: OrganizationInput = {
  name: "",
  industry: "",
  business_category: "",
  address: "",
  contact: "",
  corporate_no: "",
  note: "",
  intake: emptyOrganizationIntake(),
};

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-xl border border-border bg-background px-3 text-sm focus:border-brand focus:outline-none";

export function OrganizationsAdmin({ organizations }: { organizations: Organization[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState<Organization | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (org: Organization) => {
    setEditing(org);
    setFormOpen(true);
  };

  const handleSubmit = async (input: OrganizationInput) => {
    const supabase = createClient();
    if (editing) {
      await updateOrganization(supabase, editing.id, input);
    } else {
      await insertOrganization(supabase, input);
    }
    setFormOpen(false);
    setNotice({ ok: true, message: editing ? "更新しました" : "登録しました" });
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteOrganization(createClient(), deleting.id);
      setNotice({ ok: true, message: `${deleting.name} を削除しました` });
      router.refresh();
    } catch (err) {
      setNotice({
        ok: false,
        message: `削除に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${
            notice.ok ? "bg-brand/10 text-brand" : "bg-seal/10 text-seal"
          }`}
        >
          {notice.message}
        </p>
      )}

      <Button fullWidth icon={<Plus size={20} />} onClick={openNew}>
        会社・機関を追加
      </Button>

      {organizations.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          まだ登録がありません。外国人の所属先となる会社・機関を追加してください。
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {organizations.map((org) => (
            <Card key={org.id} className="p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Building2 size={16} className="shrink-0 text-muted" />
                  <p className="truncate font-bold">{org.name}</p>
                </div>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label="編集"
                    onClick={() => openEdit(org)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="削除"
                    onClick={() => setDeleting(org)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-seal"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
              <p className="text-xs text-muted">
                {[org.industry, org.business_category, org.address, org.contact].filter(Boolean).join(" ・ ") ||
                  "詳細未登録"}
              </p>
              {org.note && <p className="mt-0.5 text-xs text-muted">{org.note}</p>}
            </Card>
          ))}
        </div>
      )}

      {formOpen && (
        <OrganizationFormModal
          initial={editing}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="会社・機関を削除"
        message={
          deleting
            ? `「${deleting.name}」を削除します。この機関に所属中の外国人は「未所属」になります。`
            : ""
        }
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function OrganizationFormModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial: Organization | null;
  onClose: () => void;
  onSubmit: (input: OrganizationInput) => Promise<void>;
}) {
  const [form, setForm] = useState<OrganizationInput>(
    initial
      ? {
          name: initial.name,
          industry: initial.industry,
          business_category: initial.business_category,
          address: initial.address,
          contact: initial.contact,
          corporate_no: initial.corporate_no,
          note: initial.note,
          intake: normalizeOrganizationIntake(initial.intake),
        }
      : { ...EMPTY, intake: emptyOrganizationIntake() },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof OrganizationInput>(key: K, value: OrganizationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // 申込書の内容（intake）の編集ヘルパー
  const intake = normalizeOrganizationIntake(form.intake);
  const setIntake = (patch: Partial<OrganizationIntake>) =>
    setForm((f) => ({ ...f, intake: { ...normalizeOrganizationIntake(f.intake), ...patch } }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ ...form, name: form.name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setBusy(false);
    }
  };

  return (
    <Modal open title={initial ? "会社・機関を編集" : "会社・機関を追加"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        {error && (
          <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
            {error}
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">名称（必須）</span>
          <input
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="株式会社◯◯食品"
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">業種（特定技能 産業分野）</span>
          <select
            value={form.industry}
            onChange={(e) => {
              // 分野を変えたら業務区分をリセット
              setForm((f) => ({ ...f, industry: e.target.value, business_category: "" }));
            }}
            className={INPUT_CLASS}
          >
            <option value="">選択してください</option>
            {SSW_INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </label>
        {form.industry && categoriesFor(form.industry).length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-muted">業務区分</span>
            <select
              value={form.business_category}
              onChange={(e) => set("business_category", e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">選択してください</option>
              {categoriesFor(form.industry).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">所在地</span>
          <input
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            className={INPUT_CLASS}
          />
          <span className="text-[11px] leading-relaxed text-muted">
            法人で支店などがある場合は本店の所在地を記載してください。
            個人事業主の場合は事業主の免許証の住所を記載してください。
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">連絡先</span>
          <input
            value={form.contact}
            onChange={(e) => set("contact", e.target.value)}
            placeholder="電話番号など"
            className={INPUT_CLASS}
          />
          <span className="text-[11px] leading-relaxed text-muted">
            入管から連絡が来ても対応できる連絡先を記載してください。
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">法人番号（13桁・法人でない場合は空欄）</span>
          <input
            value={form.corporate_no}
            onChange={(e) => set("corporate_no", e.target.value)}
            placeholder="1234567890123"
            inputMode="numeric"
            maxLength={13}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">備考</span>
          <input
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <IntakeSection intake={intake} setIntake={setIntake} />

        <Button type="submit" fullWidth disabled={busy} className="mt-1">
          {busy ? "保存中…" : initial ? "更新する" : "登録する"}
        </Button>
      </form>
    </Modal>
  );
}

const GROUP_CLASS = "mt-1 text-xs font-bold text-brand";
const HINT_CLASS = "text-[11px] leading-relaxed text-muted";

// 申込書の1入力欄（テキスト）
function IntakeField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
      {hint && <span className={HINT_CLASS}>{hint}</span>}
    </label>
  );
}

// 申込書の1入力欄（選択式）
function IntakeSelect({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS}>
        <option value="">選択してください</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {hint && <span className={HINT_CLASS}>{hint}</span>}
    </label>
  );
}

// 登録支援機関への申込書の内容。項目が多いため折りたたみで表示する
function IntakeSection({
  intake,
  setIntake,
}: {
  intake: OrganizationIntake;
  setIntake: (patch: Partial<OrganizationIntake>) => void;
}) {
  const setFinancial = (i: number, patch: Partial<OrgFinancialYear>) =>
    setIntake({
      financials: intake.financials.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    });
  const setStaff = (i: number, patch: Partial<OrgJapaneseStaff>) =>
    setIntake({
      japanese_staff: intake.japanese_staff.map((row, idx) =>
        idx === i ? { ...row, ...patch } : row,
      ),
    });
  const setOfficer = (i: number, patch: Partial<OrgOfficer>) =>
    setIntake({
      officers: intake.officers.map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    });

  return (
    <details className="rounded-xl border border-border">
      <summary className="cursor-pointer select-none px-3 py-3 text-sm font-bold">
        申込書の情報（登録支援機関への申込書）
      </summary>
      <div className="flex flex-col gap-2.5 border-t border-border p-3">
        <p className={GROUP_CLASS}>会社の情報</p>
        <IntakeField label="名称のフリガナ" value={intake.kana} onChange={(v) => setIntake({ kana: v })} />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <IntakeField label="電話番号" value={intake.phone} onChange={(v) => setIntake({ phone: v })} />
          <IntakeField label="FAX" value={intake.fax} onChange={(v) => setIntake({ fax: v })} />
          <IntakeField label="Email" value={intake.email} onChange={(v) => setIntake({ email: v })} />
          <IntakeSelect
            label="資料のやりとり方法"
            value={intake.contact_method}
            onChange={(v) => setIntake({ contact_method: v })}
            options={["FAX", "グループLINE", "email"]}
          />
          <IntakeSelect
            label="保険（事業所としての適用内容）"
            value={intake.health_insurance}
            onChange={(v) => setIntake({ health_insurance: v })}
            options={["国民健康保険", "社会保険", "その他"]}
          />
          <IntakeSelect
            label="年金（事業所としての適用内容）"
            value={intake.pension}
            onChange={(v) => setIntake({ pension: v })}
            options={["国民年金", "厚生年金"]}
          />
        </div>
        <IntakeField
          label="作業する住所（会社の住所と別の場合）"
          value={intake.work_address}
          onChange={(v) => setIntake({ work_address: v })}
          placeholder="〒　住所"
        />
        <IntakeField
          label="作業する住所のTEL・FAX"
          value={intake.work_contact}
          onChange={(v) => setIntake({ work_contact: v })}
        />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <IntakeField label="代表者フリガナ" value={intake.rep_kana} onChange={(v) => setIntake({ rep_kana: v })} />
          <IntakeField
            label="代表者役職・氏名"
            value={intake.rep_name}
            onChange={(v) => setIntake({ rep_name: v })}
            placeholder="例: 代表取締役 ◯◯ ◯◯"
          />
          <IntakeField
            label="資本金（法人）"
            value={intake.capital}
            onChange={(v) => setIntake({ capital: v })}
            placeholder="例: 3,000,000円"
          />
          <IntakeField
            label="決算月（法人）"
            value={intake.fiscal_month}
            onChange={(v) => setIntake({ fiscal_month: v })}
            placeholder="例: 3月"
          />
        </div>

        <p className={GROUP_CLASS}>常勤職員数（専従者も含む）</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <IntakeField label="日本人" value={intake.staff_japanese} onChange={(v) => setIntake({ staff_japanese: v })} />
          <IntakeField label="技能実習生" value={intake.staff_trainee} onChange={(v) => setIntake({ staff_trainee: v })} />
          <IntakeField label="特定技能1号" value={intake.staff_ssw1} onChange={(v) => setIntake({ staff_ssw1: v })} />
          <IntakeField label="特定技能2号" value={intake.staff_ssw2} onChange={(v) => setIntake({ staff_ssw2: v })} />
          <IntakeField label="特定活動" value={intake.staff_katsudo} onChange={(v) => setIntake({ staff_katsudo: v })} />
        </div>

        <p className={GROUP_CLASS}>決算情報（直近3年分）</p>
        <p className={HINT_CLASS}>
          個人事業主は、売上高＝青色決算書の「売上（収入）金額」、経常損益＝「所得金額」、
          純資産＝貸借対照表の「元入金」を記入してください（純損益は記載不要）。
        </p>
        {intake.financials.map((row, i) => (
          <div key={FINANCIAL_YEAR_LABELS[i] ?? i} className="rounded-xl border border-border p-2.5">
            <p className="mb-1.5 text-xs font-bold">{FINANCIAL_YEAR_LABELS[i] ?? `${i + 1}年前`}</p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              <IntakeField label="令和◯年度" value={row.year} onChange={(v) => setFinancial(i, { year: v })} />
              <IntakeField label="売上高" value={row.sales} onChange={(v) => setFinancial(i, { sales: v })} />
              <IntakeField label="経常損益" value={row.ordinary} onChange={(v) => setFinancial(i, { ordinary: v })} />
              <IntakeField label="純損益" value={row.net} onChange={(v) => setFinancial(i, { net: v })} />
              <IntakeField label="純資産" value={row.assets} onChange={(v) => setFinancial(i, { assets: v })} />
            </div>
          </div>
        ))}

        <p className={GROUP_CLASS}>一緒に働く日本人常勤職員（専従者）</p>
        <p className={HINT_CLASS}>記入した職員については、定期報告の際に賃金台帳を提出します。</p>
        {intake.japanese_staff.map((row, i) => (
          <div key={i} className="rounded-xl border border-border p-2.5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <IntakeField label="氏名" value={row.name} onChange={(v) => setStaff(i, { name: v })} />
              <IntakeField
                label="役職・職務内容・責任程度"
                value={row.role}
                onChange={(v) => setStaff(i, { role: v })}
              />
              <IntakeField
                label="年齢・性別・経験年数"
                value={row.profile}
                onChange={(v) => setStaff(i, { profile: v })}
                placeholder="例: 45歳・男・経験10年"
              />
              <IntakeField
                label="報酬（月給/時給）"
                value={row.pay}
                onChange={(v) => setStaff(i, { pay: v })}
                placeholder="例: 月給250,000円"
              />
            </div>
            {intake.japanese_staff.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setIntake({ japanese_staff: intake.japanese_staff.filter((_, idx) => idx !== i) })
                }
                className="mt-1.5 text-[11px] font-bold text-seal"
              >
                この職員を削除
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setIntake({ japanese_staff: [...intake.japanese_staff, emptyJapaneseStaff()] })}
          className="self-start text-xs font-bold text-brand"
        >
          ＋ 職員を追加
        </button>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted">
            特定技能外国人の報酬が日本人と同等以上であると考えられる理由
          </span>
          <textarea
            value={intake.wage_parity_reason}
            onChange={(e) => setIntake({ wage_parity_reason: e.target.value })}
            rows={3}
            className={`${INPUT_CLASS} min-h-[70px] py-2 leading-relaxed`}
          />
        </label>

        <p className={GROUP_CLASS}>労災保険・雇用保険</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <IntakeSelect
            label="労災保険の適用事業所か"
            value={intake.rosai_covered}
            onChange={(v) => setIntake({ rosai_covered: v })}
            options={["はい", "いいえ"]}
            hint="民間の労災保険に加入の場合は、保険証の写しをもらってください。"
          />
          <IntakeField
            label="労働保険番号"
            value={intake.rosai_no}
            onChange={(v) => setIntake({ rosai_no: v })}
          />
          <IntakeSelect
            label="雇用保険の適用事業所か"
            value={intake.koyo_covered}
            onChange={(v) => setIntake({ koyo_covered: v })}
            options={["はい", "いいえ"]}
          />
          <IntakeField
            label="雇用保険適用事業所番号"
            value={intake.koyo_no}
            onChange={(v) => setIntake({ koyo_no: v })}
            hint="末尾4桁は割り振られている場合のみ記入。"
          />
        </div>

        <p className={GROUP_CLASS}>その他</p>
        <IntakeField
          label="特定技能外国人の宿泊住所"
          value={intake.lodging_address}
          onChange={(v) => setIntake({ lodging_address: v })}
          placeholder="〒　住所"
          hint="賃貸物件の場合は賃貸契約書の写しをもらってください。"
        />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <IntakeField
            label="労働者の雇用開始日（国籍問わず・大体で可）"
            value={intake.first_hired_on}
            onChange={(v) => setIntake({ first_hired_on: v })}
            placeholder="例: 2015年4月頃〜"
          />
          <IntakeField
            label="過去1年間の行方不明者数（特定技能）"
            value={intake.missing_ssw}
            onChange={(v) => setIntake({ missing_ssw: v })}
          />
          <IntakeField
            label="過去1年間の行方不明者数（技能実習生）"
            value={intake.missing_trainee}
            onChange={(v) => setIntake({ missing_trainee: v })}
          />
        </div>
        <IntakeField
          label="協議会の加入・協力確認書（提出先・提出日など）"
          value={intake.council_note}
          onChange={(v) => setIntake({ council_note: v })}
          hint="協議会の加入通知書などがある場合はコピーをもらってください。"
        />

        <p className={GROUP_CLASS}>所属役員（法人の場合）</p>
        <p className={HINT_CLASS}>
          特定技能外国人の受入れ業務の執行に直接関与しない役員はチェックしてください。
        </p>
        {intake.officers.map((row, i) => (
          <div key={i} className="rounded-xl border border-border p-2.5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <IntakeField label="ふりがな" value={row.kana} onChange={(v) => setOfficer(i, { kana: v })} />
              <IntakeField label="氏名" value={row.name} onChange={(v) => setOfficer(i, { name: v })} />
              <IntakeField label="役職" value={row.title} onChange={(v) => setOfficer(i, { title: v })} />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={row.not_involved}
                  onChange={(e) => setOfficer(i, { not_involved: e.target.checked })}
                  className="h-4 w-4"
                />
                受入れ業務の執行に直接関与しない
              </label>
              {intake.officers.length > 1 && (
                <button
                  type="button"
                  onClick={() => setIntake({ officers: intake.officers.filter((_, idx) => idx !== i) })}
                  className="text-[11px] font-bold text-seal"
                >
                  この役員を削除
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setIntake({ officers: [...intake.officers, emptyOfficer()] })}
          className="self-start text-xs font-bold text-brand"
        >
          ＋ 役員を追加
        </button>
      </div>
    </details>
  );
}
