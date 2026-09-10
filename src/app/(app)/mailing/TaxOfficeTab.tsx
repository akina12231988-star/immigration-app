"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import { deleteTaxOffice, insertTaxOffice, updateTaxOffice } from "@/lib/supabase/queries/tax-office";
import {
  emptyTaxOfficeInput,
  jurisdictionList,
  matchesTaxOffice,
  type TaxOffice,
  type TaxOfficeInput,
} from "@/lib/tax-office";
import { guessPrefecture, PREFECTURE_LIST } from "@/lib/prefectures";
import { dbErrorMessage } from "@/lib/errors";
import { INPUT, LABEL } from "./ui";

export const TAX_OFFICE_MIGRATION = "0148_tax_offices.sql";

// 税務署の都道府県（未設定なら名前・所在地から推定）
export function taxOfficePrefecture(o: TaxOffice): string {
  return o.prefecture || guessPrefecture(o.address) || guessPrefecture(o.name) || "";
}

export function sortTaxOffices(list: TaxOffice[]): TaxOffice[] {
  return [...list].sort(
    (a, b) =>
      taxOfficePrefecture(a).localeCompare(taxOfficePrefecture(b), "ja") ||
      a.name.localeCompare(b.name, "ja"),
  );
}

/* ============================ 税務署マスタ ============================ */
export function TaxOfficeTab({
  taxOffices,
  setTaxOffices,
  canEdit,
  showToast,
}: {
  taxOffices: TaxOffice[];
  setTaxOffices: (o: TaxOffice[]) => void;
  canEdit: boolean;
  showToast: (m: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaxOffice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaxOffice | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () => sortTaxOffices(taxOffices.filter((o) => matchesTaxOffice(o, query))),
    [taxOffices, query],
  );

  // 都道府県ごとにまとめる
  const groups = useMemo(() => {
    const map = new Map<string, TaxOffice[]>();
    for (const o of filtered) {
      const p = taxOfficePrefecture(o) || "都道府県が未設定";
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(o);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const save = async (form: TaxOfficeInput) => {
    setBusy(true);
    try {
      if (editing) {
        const updated = await updateTaxOffice(createClient(), editing.id, form);
        setTaxOffices(taxOffices.map((o) => (o.id === editing.id ? updated : o)));
        showToast("税務署の情報を更新しました");
      } else {
        const created = await insertTaxOffice(createClient(), form);
        setTaxOffices([...taxOffices, created]);
        showToast("税務署を追加しました");
      }
      setModalOpen(false);
      setEditing(null);
    } catch (e) {
      showToast(dbErrorMessage(e, TAX_OFFICE_MIGRATION, "保存に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteTaxOffice(createClient(), deleteTarget.id);
      setTaxOffices(taxOffices.filter((o) => o.id !== deleteTarget.id));
      showToast("税務署を削除しました");
      setDeleteTarget(null);
    } catch (e) {
      showToast(dbErrorMessage(e, TAX_OFFICE_MIGRATION, "削除に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {canEdit && (
          <Button onClick={() => { setEditing(null); setModalOpen(true); }}>＋ 税務署を追加</Button>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="税務署名・市区町村名で検索（例：益城）"
          className={`${INPUT} sm:max-w-xs`}
        />
        <a
          href="https://www.nta.go.jp/about/organization/access/map.htm"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold text-brand underline"
        >
          国税庁の税務署案内で所在地・管轄を確認する
        </a>
      </div>
      <p className="rounded-xl bg-background p-3 text-[11px] leading-relaxed text-muted">
        納税証明書その3の郵送請求は、外国人の現在の住所を管轄する税務署に送ります。
        「管轄区域」に市区町村名（熊本市は区まで）を「、」区切りで登録しておくと、請求フォームで住所から自動判定します。
        所在地・郵便番号は郵送の宛名に使うので、国税庁の案内で確認して登録してください。
      </p>

      {taxOffices.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          税務署が登録されていません。「税務署を追加」から登録してください（マイグレーション {TAX_OFFICE_MIGRATION} を適用すると熊本県の税務署が入ります）。
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">条件に一致する税務署がありません。</Card>
      ) : (
        groups.map(([pref, list]) => (
          <Card key={pref} className="p-4">
            <p className="mb-2 text-sm font-bold">{pref}（{list.length}）</p>
            <div className="divide-y divide-border">
              {list.map((o) => (
                <div key={o.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 text-xs leading-relaxed">
                    <p className="text-sm font-bold">{o.name}</p>
                    {o.postal_code || o.address ? (
                      <p>{o.postal_code ? `〒${o.postal_code} ` : ""}{o.address}</p>
                    ) : (
                      <p className="font-bold text-seal">所在地が未登録です（郵送の宛名に使うので登録してください）</p>
                    )}
                    {o.phone && <p className="text-muted">TEL {o.phone}</p>}
                    <p className="text-muted">
                      管轄：{jurisdictionList(o.jurisdiction).join("、") || "（未登録）"}
                    </p>
                    {o.note && <p className="text-muted">{o.note}</p>}
                    {o.website_url && (
                      <a href={o.website_url} target="_blank" rel="noopener noreferrer" className="font-bold text-brand underline">
                        案内ページを開く
                      </a>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => { setEditing(o); setModalOpen(true); }} className="rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-muted">編集</button>
                      <button type="button" onClick={() => setDeleteTarget(o)} className="rounded-lg border border-seal/40 px-2.5 py-1 text-xs font-bold text-seal">削除</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))
      )}

      {modalOpen && (
        <TaxOfficeModal
          initial={editing}
          busy={busy}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={save}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title="税務署を削除しますか？"
        message={`「${deleteTarget?.name}」を税務署マスタから削除します。この操作は元に戻せません。`}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export function TaxOfficeModal({
  initial,
  busy,
  onClose,
  onSave,
}: {
  initial: TaxOffice | null;
  busy: boolean;
  onClose: () => void;
  onSave: (form: TaxOfficeInput) => void;
}) {
  const [form, setForm] = useState<TaxOfficeInput>(
    initial
      ? {
          name: initial.name,
          prefecture: initial.prefecture ?? "",
          postal_code: initial.postal_code ?? "",
          address: initial.address ?? "",
          phone: initial.phone ?? "",
          jurisdiction: initial.jurisdiction ?? "",
          website_url: initial.website_url ?? "",
          note: initial.note ?? "",
        }
      : emptyTaxOfficeInput(),
  );
  const set = <K extends keyof TaxOfficeInput>(k: K, v: TaxOfficeInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setName = (name: string) => {
    // 名前・所在地から県を推定して入れる（手で選び直せる）
    setForm((f) => ({ ...f, name, prefecture: f.prefecture || guessPrefecture(name) }));
  };
  const setAddress = (address: string) => {
    setForm((f) => ({ ...f, address, prefecture: f.prefecture || guessPrefecture(address) }));
  };
  const canSave = form.name.trim() !== "";

  return (
    <Modal open title={initial ? "税務署を編集" : "税務署を追加"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>税務署名</span>
          <input value={form.name} onChange={(e) => setName(e.target.value)} placeholder="例：熊本東税務署" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>都道府県</span>
          <select value={form.prefecture} onChange={(e) => set("prefecture", e.target.value)} className={INPUT}>
            <option value="">（未設定）</option>
            {PREFECTURE_LIST.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>郵便番号</span>
            <input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} placeholder="862-8686" className={`${INPUT} tabular-nums`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>所在地（郵送の宛名に使う）</span>
            <input value={form.address} onChange={(e) => setAddress(e.target.value)} placeholder="例：熊本県熊本市東区東町4丁目14番35号" className={INPUT} />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>電話番号</span>
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="096-000-0000" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>管轄区域（市区町村名を「、」区切り。熊本市は区まで）</span>
          <textarea
            value={form.jurisdiction}
            onChange={(e) => set("jurisdiction", e.target.value)}
            placeholder="例：熊本市東区、上益城郡御船町、上益城郡嘉島町、上益城郡益城町"
            className={`${INPUT} min-h-[72px] py-2`}
          />
          <span className="text-[11px] text-muted">請求フォームで、外国人の現在の住所にこの市区町村名が含まれていれば自動で選びます。</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>案内ページのURL（国税庁の税務署案内など）</span>
          <input type="url" inputMode="url" value={form.website_url} onChange={(e) => set("website_url", e.target.value)} placeholder="https://www.nta.go.jp/..." className={INPUT} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL}>備考</span>
          <textarea value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="受付時間・注意事項など" className={`${INPUT} min-h-[56px] py-2`} />
        </label>
        <Button
          fullWidth
          disabled={!canSave || busy}
          onClick={() =>
            onSave({
              ...form,
              name: form.name.trim(),
              postal_code: form.postal_code.trim(),
              address: form.address.trim(),
              phone: form.phone.trim(),
              jurisdiction: form.jurisdiction.trim(),
              website_url: form.website_url.trim(),
            })
          }
        >
          {busy ? "保存中…" : "保存する"}
        </Button>
        {!canSave && <p className="text-xs font-bold text-seal">税務署名を入力すると保存できます</p>}
      </div>
    </Modal>
  );
}
