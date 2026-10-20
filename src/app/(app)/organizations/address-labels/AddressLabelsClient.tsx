"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckSquare, Copy, Download, Loader2, Save, Search, Square, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { createClient } from "@/lib/supabase/client";
import { updateOrganization } from "@/lib/supabase/queries/organizations";
import { matchesOrganizationName } from "@/lib/org-search";
import { prefectureFromAddress } from "@/lib/minimum-wage";
import { downloadBlob } from "@/lib/xlsx-export";
import { dbErrorMessage } from "@/lib/errors";
import {
  addressCsvFileName,
  addressLabelText,
  buildAddressCsv,
  formatPostal,
  postalDigits,
} from "@/lib/org-address-label";
import { SUPPORT_CONTRACT_STATUSES } from "@/types/db";

export interface AddressLabelOrg {
  id: string;
  name: string;
  address: string;
  postal: string; // 登録済みの郵便番号（空なら住所から探す）
  contractStatus: string; // 支援委託の状況
  supportedCount: number; // 支援中（1号・支援対象）の人数
  activeCount: number; // 在籍中の人数
}

const CHIP = "min-h-[32px] rounded-full border px-3 text-xs transition";
const CHIP_ON = "border-brand bg-brand/10 font-bold text-brand";
const CHIP_OFF = "border-border bg-background text-muted";
const HONORIFICS = ["", "御中", "様"] as const;

// 所属機関の住所印刷。検索して1件ずつテープ用のテキストをコピーするか、
// 絞り込んで複数選び CSV にする
export function AddressLabelsClient({
  organizations,
  today,
  canEdit,
}: {
  organizations: AddressLabelOrg[];
  today: string;
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const [contractFilter, setContractFilter] = useState("すべて");
  const [onlySupported, setOnlySupported] = useState(false);
  const [onlyActive, setOnlyActive] = useState(false);
  const [prefecture, setPrefecture] = useState("");
  const [honorific, setHonorific] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // 住所から探した郵便番号（機関ごと。"" = 見つからない。未取得はキー無し）
  const [found, setFound] = useState<Record<string, string>>({});
  // 画面で保存した郵便番号（保存後は登録済みとして扱う）
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const postalOf = (o: AddressLabelOrg): string => saved[o.id] ?? o.postal ?? "";
  const isSearching = (o: AddressLabelOrg) => !postalOf(o) && !(o.id in found) && !!o.address.trim();
  const effectivePostal = (o: AddressLabelOrg): string => postalOf(o) || found[o.id] || "";

  const prefectures = useMemo(
    () => [...new Set(organizations.map((o) => prefectureFromAddress(o.address)).filter((p): p is string => !!p))].sort(),
    [organizations],
  );

  const shown = useMemo(() => {
    const q = query.trim();
    return organizations.filter((o) => {
      if (q && !matchesOrganizationName(o, q)) return false;
      if (contractFilter !== "すべて") {
        const s = o.contractStatus;
        if (contractFilter === "未設定" ? !!s : s !== contractFilter) return false;
      }
      if (onlySupported && o.supportedCount === 0) return false;
      if (onlyActive && o.activeCount === 0) return false;
      if (prefecture && prefectureFromAddress(o.address) !== prefecture) return false;
      return true;
    });
  }, [organizations, query, contractFilter, onlySupported, onlyActive, prefecture]);

  // 郵便番号が未登録の機関は、表示している順に住所から探す（同時に何件も投げない）
  const requested = useRef<Set<string>>(new Set());
  useEffect(() => {
    const targets = shown.filter((o) => isSearching(o) && !requested.current.has(o.id)).slice(0, 8);
    if (targets.length === 0) return;
    let cancelled = false;
    for (const o of targets) {
      requested.current.add(o.id);
      void fetch(`/api/postal?address=${encodeURIComponent(o.address.trim())}`)
        .then((r) => (r.ok ? r.json() : { postal: "" }))
        .then((j: { postal?: string }) => {
          if (!cancelled) setFound((prev) => ({ ...prev, [o.id]: j.postal ?? "" }));
        })
        .catch(() => {
          if (!cancelled) setFound((prev) => ({ ...prev, [o.id]: "" }));
        });
    }
    return () => {
      cancelled = true;
    };
    // isSearching は found / saved で決まるので、それらの変化でも見直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, found, saved]);

  const labelOf = (o: AddressLabelOrg) =>
    addressLabelText({ name: o.name, postal: effectivePostal(o), address: o.address }, { honorific });

  const savePostal = async (o: AddressLabelOrg, value: string) => {
    const digits = postalDigits(value);
    if (!digits) {
      setError("郵便番号は数字7桁で入れてください");
      return;
    }
    setSaving(o.id);
    setError(null);
    try {
      await updateOrganization(createClient(), o.id, { postal_code: digits });
      setSaved((prev) => ({ ...prev, [o.id]: digits }));
    } catch (err) {
      setError(dbErrorMessage(err, "0184_organization_postal_code.sql", "郵便番号を保存できませんでした"));
    } finally {
      setSaving(null);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectShown = () => setSelected((prev) => new Set([...prev, ...shown.map((o) => o.id)]));
  const selectedOrgs = organizations.filter((o) => selected.has(o.id));

  const downloadCsv = () => {
    const rows = selectedOrgs.map((o) => ({ name: o.name, postal: effectivePostal(o), address: o.address }));
    const csv = buildAddressCsv(rows, { honorific });
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), addressCsvFileName(rows.length, today));
  };
  const copyAllSelected = async () => {
    try {
      await navigator.clipboard.writeText(selectedOrgs.map(labelOf).join("\n\n----\n\n"));
      setCopiedAll("ok");
      setTimeout(() => setCopiedAll(null), 1500);
    } catch {
      setError("コピーできませんでした");
    }
  };

  return (
    <div className="space-y-3 px-4 py-4 lg:px-8">
      <p className="text-[11px] leading-relaxed text-muted">
        会社名と住所を、テープ（ラベルプリンター）に貼る形のテキストにします。1件ずつ「テープ用にコピー」してラベルソフトのテキストボックスに貼り付けるか、
        絞り込んで複数選び「CSV をダウンロード」してラベルソフトのデータベースに読み込ませてください。
        郵便番号が未登録の機関は住所から自動で探します（見つかった番号は「保存」で登録できます）。
      </p>

      {/* 検索・絞り込み */}
      <Card className="space-y-2 p-3">
        <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="会社名で検索（例: 丸尾）"
            className="min-h-[44px] w-full bg-transparent text-sm focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="検索を消す" className="text-muted">
              <X size={16} />
            </button>
          )}
        </label>
        <div className="flex flex-wrap gap-1">
          {["すべて", ...SUPPORT_CONTRACT_STATUSES, "未設定"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setContractFilter(s)}
              className={`${CHIP} ${contractFilter === s ? CHIP_ON : CHIP_OFF}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <label className="flex min-h-[32px] items-center gap-1.5">
            <input type="checkbox" checked={onlySupported} onChange={(e) => setOnlySupported(e.target.checked)} className="h-4 w-4" />
            支援中の人がいる会社だけ
          </label>
          <label className="flex min-h-[32px] items-center gap-1.5">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} className="h-4 w-4" />
            在籍者がいる会社だけ
          </label>
          {prefectures.length > 1 && (
            <label className="flex items-center gap-1.5">
              都道府県
              <select value={prefecture} onChange={(e) => setPrefecture(e.target.value)} className="min-h-[32px] rounded-lg border border-border bg-surface px-2 text-xs">
                <option value="">すべて</option>
                {prefectures.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex items-center gap-1.5">
            会社名の後
            <select value={honorific} onChange={(e) => setHonorific(e.target.value)} className="min-h-[32px] rounded-lg border border-border bg-surface px-2 text-xs">
              {HONORIFICS.map((h) => (
                <option key={h} value={h}>
                  {h || "（付けない）"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {/* 選択と CSV */}
      <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-sm">
        <span className="font-bold">
          <CheckSquare size={14} className="mr-1 inline" />
          {selected.size}件を選択中
        </span>
        <button type="button" onClick={selectShown} className="rounded-full border border-border px-2.5 py-1 font-bold text-brand">
          表示中の{shown.length}件を選ぶ
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          disabled={selected.size === 0}
          className="rounded-full border border-border px-2.5 py-1 font-bold text-muted disabled:opacity-40"
        >
          選択を解除
        </button>
        <span className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyAllSelected()}
            disabled={selected.size === 0}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-border px-3 font-bold text-brand disabled:opacity-40"
          >
            {copiedAll ? <Check size={14} /> : <Copy size={14} />}
            {copiedAll ? "コピーしました" : `まとめてコピー（${selected.size}件）`}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={selected.size === 0}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-brand px-3 font-bold text-brand-foreground disabled:opacity-40"
          >
            <Download size={14} />
            CSV をダウンロード（{selected.size}件）
          </button>
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-sm text-seal">
          {error}
        </p>
      )}

      <p className="text-xs font-bold text-muted">{shown.length}件</p>
      {shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">該当する所属機関がありません</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {shown.map((o) => {
            const on = selected.has(o.id);
            const stored = postalOf(o);
            const postal = effectivePostal(o);
            const text = labelOf(o);
            return (
              <Card key={o.id} className={`p-3 ${on ? "ring-2 ring-brand" : ""}`}>
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(o.id)}
                    aria-pressed={on}
                    aria-label={`${o.name}を${on ? "選択から外す" : "選ぶ"}`}
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      on ? "bg-brand text-brand-foreground" : "border border-border bg-surface text-muted"
                    }`}
                  >
                    {on ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{o.name}</p>
                    <p className="text-[11px] text-muted">
                      {o.contractStatus || "支援委託 未設定"}
                      {o.activeCount > 0 && ` ・ 在籍 ${o.activeCount}名`}
                      {o.supportedCount > 0 && `（支援中 ${o.supportedCount}名）`}
                    </p>
                  </div>
                </div>
                {/* テープに貼る形のテキスト */}
                <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-dashed border-border bg-background px-3 py-2 font-sans text-sm leading-relaxed">
                  {text}
                </pre>
                {!o.address.trim() && <p className="mt-1 text-[11px] text-seal">所在地が未登録です（所属機関の情報で登録してください）</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(text)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-brand px-3 text-xs font-bold text-brand-foreground"
                  >
                    <Copy size={14} />
                    テープ用にコピー
                  </button>
                  <span className="inline-flex items-center gap-1 text-muted">
                    住所だけ
                    <CopyButton value={o.address} label={`${o.name}の住所をコピー`} />
                  </span>
                  <span className="inline-flex items-center gap-1 text-muted">
                    会社名だけ
                    <CopyButton value={o.name} label={`${o.name}の会社名をコピー`} />
                  </span>
                  {/* 郵便番号: 登録済み／住所から探した／見つからない */}
                  <span className="ml-auto inline-flex items-center gap-1 text-muted">
                    〒
                    {stored ? (
                      <span className="font-bold tabular-nums text-foreground">{formatPostal(stored)}</span>
                    ) : isSearching(o) ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 size={12} className="animate-spin" />
                        住所から検索中…
                      </span>
                    ) : postal ? (
                      <>
                        <span className="font-bold tabular-nums text-foreground">{formatPostal(postal)}</span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => void savePostal(o, postal)}
                            disabled={saving === o.id}
                            className="inline-flex min-h-[28px] items-center gap-0.5 rounded-lg border border-border px-2 font-bold text-brand disabled:opacity-50"
                            title="この郵便番号を所属機関に登録する"
                          >
                            <Save size={12} />
                            {saving === o.id ? "保存中…" : "保存"}
                          </button>
                        )}
                      </>
                    ) : (
                      <PostalInput disabled={!canEdit || saving === o.id} onSave={(v) => void savePostal(o, v)} />
                    )}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 郵便番号が見つからなかったときに手で入れて保存する欄
function PostalInput({ disabled, onSave }: { disabled: boolean; onSave: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="numeric"
        placeholder="見つかりません。手で入力"
        disabled={disabled}
        className="min-h-[28px] w-40 rounded-lg border border-border bg-surface px-2 text-xs tabular-nums"
      />
      <button
        type="button"
        onClick={() => onSave(value)}
        disabled={disabled || !postalDigits(value)}
        className="inline-flex min-h-[28px] items-center gap-0.5 rounded-lg border border-border px-2 font-bold text-brand disabled:opacity-50"
      >
        <Save size={12} />
        保存
      </button>
    </span>
  );
}
