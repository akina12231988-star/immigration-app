"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import type { Municipality } from "@/lib/tax-cert";
import {
  groupByPrefecture,
  matchesMunicipality,
  municipalityShortName,
  type Prefecture,
} from "@/lib/prefectures";
import { PrefectureTileMap } from "./PrefectureTileMap";

// 自治体マスタの一覧（案B）: 検索欄 ＋ タイル地図 ＋ 県ごとの名札。
// 名札を押すと、その自治体の条件（所得額・課税額・納税証明書・転出届・住民票）と編集・削除がその場で開く。
export function MunicipalityBrowser({
  municipalities,
  canEdit,
  onEdit,
  onDelete,
}: {
  municipalities: Municipality[];
  canEdit: boolean;
  onEdit: (m: Municipality) => void;
  onDelete: (m: Municipality) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Prefecture | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // 検索で絞ったもの（地図の色と件数はこれで決まる）
  const searched = useMemo(
    () => municipalities.filter((m) => matchesMunicipality(m, query)),
    [municipalities, query],
  );
  const groups = useMemo(() => groupByPrefecture(searched), [searched]);
  const counts = useMemo(() => new Map(groups.map((g) => [g.prefecture, g.rows.length])), [groups]);
  // 県を押していればその県だけ
  const shown = selected ? groups.filter((g) => g.prefecture === selected) : groups;
  const prefCount = groups.filter((g) => g.prefecture !== "").length;

  return (
    <div className="space-y-3">
      <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-border bg-background px-3">
        <Search size={16} className="shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="自治体名・県名・証明書名・備考で検索（例: 熊本、新座、納税）"
          className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none"
        />
        <span className="shrink-0 text-xs text-muted tabular-nums">
          {searched.length} / {municipalities.length}件・{prefCount}都道府県
        </span>
      </label>

      <div className="grid gap-5 md:grid-cols-[minmax(280px,400px)_1fr]">
        <PrefectureTileMap counts={counts} selected={selected} onSelect={setSelected} />

        <div className="min-w-0">
          <p className="text-sm font-bold">
            {selected ? `${selected}（${counts.get(selected) ?? 0}件）` : `すべての県（${prefCount}都道府県・${searched.length}件）`}
          </p>
          <p className="mb-2 text-xs text-muted">
            {selected
              ? "もう一度タイルを押すと解除。名札を押すと条件が開きます。"
              : "地図の県を押すと、その県だけになります。名札を押すと条件が開きます。"}
          </p>

          {shown.length === 0 ? (
            <p className="rounded-xl bg-background p-6 text-center text-sm text-muted">該当する自治体がありません</p>
          ) : (
            <div className="divide-y divide-dashed divide-border">
              {shown.map((g) => (
                <div key={g.prefecture || "unknown"} className="grid grid-cols-[96px_1fr] gap-2 py-2 sm:grid-cols-[110px_1fr]">
                  <div className="text-sm font-bold">
                    {g.prefecture || "未設定"}
                    <span className="ml-1 text-[11px] font-normal text-muted tabular-nums">{g.rows.length}件</span>
                    {!g.prefecture && (
                      <p className="text-[11px] font-normal leading-tight text-muted">名前から県が分かりません。編集で都道府県を選んでください</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.rows.map((m) => {
                      const short = municipalityShortName(m.name, g.prefecture);
                      const selfOnly = m.tenshutsu_self_only || m.juminhyo_self_only;
                      const on = openId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-expanded={on}
                          onClick={() => setOpenId(on ? null : m.id)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] ${
                            on ? "border-brand bg-status-applied-bg" : "border-border bg-background"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${selfOnly ? "bg-seal" : "bg-status-reported-fg"}`} />
                          {short}
                          {short !== m.name && `${g.prefecture}${short}` !== m.name && (
                            <span className="text-[11px] text-muted">（{m.name}）</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {g.rows.filter((m) => m.id === openId).map((m) => (
                    <div key={m.id} className="col-span-2 rounded-xl bg-background px-3 py-2.5 text-sm">
                      <p className="font-bold">{m.name}</p>
                      <p className="mb-1.5 text-xs text-muted">{m.cert_name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge on={m.has_income} yes="所得額あり" no="所得額なし" />
                        <Badge on={m.has_tax} yes="課税額あり" no="課税額なし" />
                        <Badge on={m.needs_tax_payment_cert} yes="納税証明書要" no="納税証明書不要" />
                        <Badge on={m.show_asterisk} yes="＊表示する" no="＊表示しない" />
                        <Badge on={m.tenshutsu_self_only} yes="転出届 本人のみ" no="転出届 代理可" seal />
                        <Badge on={m.juminhyo_self_only} yes="住民票 本人のみ" no="住民票 代理可" seal />
                      </div>
                      {m.note && <p className="mt-1.5 text-xs text-muted">{m.note}</p>}
                      {m.website_url && (
                        <a href={m.website_url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-brand underline">
                          <ExternalLink size={12} />
                          自治体のサイトを開く
                        </a>
                      )}
                      {canEdit && (
                        <div className="mt-2 flex gap-1.5">
                          <button type="button" onClick={() => onEdit(m)} className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-bold text-muted">
                            編集
                          </button>
                          <button type="button" onClick={() => onDelete(m)} className="rounded-lg border border-seal/40 bg-surface px-2.5 py-1 text-xs font-bold text-seal">
                            削除
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-status-reported-fg" />代理人で請求できる</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-seal" />転出届か住民票が本人のみ</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Badge({ on, yes, no, seal = false }: { on: boolean; yes: string; no: string; seal?: boolean }) {
  const cls = on
    ? seal
      ? "bg-seal/10 text-seal"
      : "bg-status-reported-bg text-status-reported-fg"
    : "bg-surface text-muted";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{on ? yes : no}</span>;
}
