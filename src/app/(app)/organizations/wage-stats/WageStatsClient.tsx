"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Download, Loader2, Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatAmountInput } from "@/lib/amount-format";
import { buildXlsx, downloadBlob } from "@/lib/xlsx-export";
import {
  buildRegionStatsSheet,
  buildWageRepliesSheet,
  buildWageReplyViews,
  countByStatus,
  diffText,
  LEVEL_LABELS,
  minimumWageForRound,
  overallStat,
  parseHourlyInput,
  regionLabel,
  regionStats,
  samplesFromCurrentWages,
  samplesFromReplies,
  SOURCE_LABELS,
  WAGE_GROUPS,
  WAGE_REPLY_STATUSES,
  yen,
  type OrganizationWageReply,
  type OrgWageData,
  type RegionLevel,
  type RegionStat,
  type WageReplyStatus,
  type WageReplyView,
  type WageStatsSource,
} from "@/lib/wage-stats";
import { saveWageReplies, saveWageReply } from "./actions";

const FIELD =
  "min-h-[36px] rounded-lg border border-border bg-surface px-2 text-xs focus:border-brand focus:outline-none disabled:opacity-60";
const CHIP = "min-h-[32px] rounded-full border px-3 text-xs transition";
const CHIP_ON = "border-brand bg-brand/10 font-bold text-brand";
const CHIP_OFF = "border-border bg-background text-muted";

const STATUS_TONE: Record<WageReplyStatus, string> = {
  未送付: "bg-seal/10 text-seal",
  送付済: "bg-amber-100 text-amber-800",
  回答あり: "bg-brand/10 text-brand",
  対象外: "bg-background text-muted",
};

type StatusFilter = "すべて" | WageReplyStatus;

interface Round {
  effectiveOn: string;
  prefecture: string;
  hourly: number;
}

// 最低賃金の回答の管理（上）と、地域ごとの時給の集計（下）
export function WageStatsClient({
  data,
  replies: initialReplies,
  repliesError,
  today,
  defaultRound,
  canEdit,
}: {
  data: OrgWageData[];
  replies: OrganizationWageReply[];
  repliesError: string | null;
  today: string;
  defaultRound: Round;
  canEdit: boolean;
}) {
  const [replies, setReplies] = useState(initialReplies);
  const [effectiveOn, setEffectiveOn] = useState(defaultRound.effectiveOn);
  const [roundPrefecture, setRoundPrefecture] = useState(defaultRound.prefecture);
  const [roundHourlyText, setRoundHourlyText] = useState(defaultRound.hourly ? String(defaultRound.hourly) : "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("すべて");
  const [showEmpty, setShowEmpty] = useState(false);
  const [level, setLevel] = useState<RegionLevel>("city");
  const [source, setSource] = useState<WageStatsSource>("replies");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const round: Round = { effectiveOn, prefecture: roundPrefecture, hourly: parseHourlyInput(roundHourlyText) ?? 0 };
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(effectiveOn);

  // これまでの回（記録のある適用日）。切り替えて過去の回答状況も見られる
  const rounds = useMemo(() => {
    const set = new Set(replies.map((r) => r.effective_on));
    set.add(defaultRound.effectiveOn);
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [replies, defaultRound.effectiveOn]);

  const allViews = useMemo(() => buildWageReplyViews(data, replies, effectiveOn), [data, replies, effectiveOn]);
  // 在籍者がいない機関は既定では出さない（案内を送る相手ではないため）
  const baseViews = useMemo(
    () => allViews.filter((v) => showEmpty || v.data.workers.length > 0 || v.reply !== null),
    [allViews, showEmpty],
  );
  const counts = countByStatus(baseViews);
  const shownViews = statusFilter === "すべて" ? baseViews : baseViews.filter((v) => v.status === statusFilter);

  const samples = useMemo(
    () => (source === "replies" ? samplesFromReplies(allViews) : samplesFromCurrentWages(data)),
    [source, allViews, data],
  );
  const minimumFor = (prefecture: string) => minimumWageForRound(prefecture, round);
  const stats = regionStats(samples, level, minimumFor);
  const overall = overallStat(samples);

  const upsertLocal = (saved: OrganizationWageReply[]) =>
    setReplies((prev) => {
      const next = prev.filter((r) => !saved.some((s) => s.organization_id === r.organization_id && s.effective_on === r.effective_on));
      return [...next, ...saved];
    });

  // 未送付（在籍者あり）の機関をまとめて「送付済（今日）」にする（FAXをまとめて送ったあとに使う）
  const markAllSent = async () => {
    const targets = baseViews.filter((v) => v.status === "未送付" && v.data.workers.length > 0);
    if (targets.length === 0) return;
    if (!window.confirm(`未送付の ${targets.length}機関を、送付日 ${today} の「送付済」にします。よろしいですか？`)) return;
    setBusy(true);
    setNotice(null);
    const res = await saveWageReplies(
      targets.map((v) => ({
        organization_id: v.data.org.id,
        effective_on: effectiveOn,
        status: "送付済",
        sent_on: today,
        replied_on: v.reply?.replied_on ?? null,
        hourly_ssw1: v.reply?.hourly_ssw1 ?? null,
        hourly_ssw2: v.reply?.hourly_ssw2 ?? null,
        note: v.reply?.note ?? "",
      })),
    );
    setBusy(false);
    if (!res.ok) {
      setNotice({ ok: false, message: res.message });
      return;
    }
    upsertLocal(res.replies);
    setNotice({ ok: true, message: `${res.replies.length}機関を送付済にしました` });
  };

  const download = async () => {
    setBusy(true);
    try {
      const blob = await buildXlsx([
        buildWageRepliesSheet(baseViews, effectiveOn),
        buildRegionStatsSheet(stats, overall, level, source),
      ]);
      downloadBlob(blob, `最低賃金の回答_${effectiveOn}_${today}.xlsx`);
    } catch (err) {
      setNotice({ ok: false, message: err instanceof Error ? err.message : "Excel の作成に失敗しました" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-4 lg:px-8">
      <p className="text-xs leading-relaxed text-muted">
        最低賃金の改定ごとに、所属機関へ送った「時給のご確認」の案内の送付・返事の状況を管理し、返事のあった時給を地域ごとに集計します。
        「時給の一括登録」で改定日以降の時給を登録した機関は、自動で「回答あり」になり、その時給（いちばん多い額）が回答の額として入ります。
        返事をもらったが登録はまだ、という機関は、この画面で回答の時給を記録しておけます。
      </p>

      {repliesError && (
        <p role="alert" className="rounded-lg bg-seal/10 px-3 py-2 text-xs text-seal">
          {repliesError}
        </p>
      )}
      {notice && (
        <p role="status" className={`rounded-lg px-3 py-2 text-xs ${notice.ok ? "bg-brand/10 text-brand" : "bg-seal/10 text-seal"}`}>
          {notice.message}
        </p>
      )}

      {/* 改定の回（適用日・都道府県・改定後の最低賃金） */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-muted">改定の回:</span>
          {rounds.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={effectiveOn === r}
              onClick={() => setEffectiveOn(r)}
              className={`${CHIP} ${effectiveOn === r ? CHIP_ON : CHIP_OFF}`}
            >
              {r}から
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-[11px] font-bold text-muted">
            改定後の最低賃金の適用日（回答の回）
            <input type="date" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-muted">
            改定の都道府県
            <input value={roundPrefecture} onChange={(e) => setRoundPrefecture(e.target.value)} className={FIELD} placeholder="例: 熊本県" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-bold text-muted">
            改定後の最低賃金（時間額・円）
            <input
              value={formatAmountInput(roundHourlyText)}
              onChange={(e) => setRoundHourlyText(e.target.value)}
              inputMode="numeric"
              className={`${FIELD} tabular-nums`}
              placeholder="例: 1,092"
            />
          </label>
        </div>
        <p className="text-[11px] text-muted">
          適用日より後に適用が始まる時給が登録されている機関を「回答あり」とみなします。集計の「最低賃金との差」は、改定の都道府県はここの額、ほかの都道府県は地域別最低賃金の表の額と比べます。
        </p>
      </Card>

      {/* 回答状況 */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-bold">回答状況（{effectiveOn}からの改定）</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {canEdit && (
              <button
                type="button"
                disabled={busy || !dateOk || counts["未送付"] === 0}
                onClick={() => void markAllSent()}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-brand px-2.5 text-[11px] font-bold text-brand disabled:opacity-50"
              >
                <Send size={12} />
                未送付をまとめて送付済（今日）にする
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void download()}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-bold text-brand disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              Excel に出力
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
          {(["すべて", ...WAGE_REPLY_STATUSES] as StatusFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={statusFilter === key}
              onClick={() => setStatusFilter(key)}
              className={`${CHIP} ${statusFilter === key ? CHIP_ON : CHIP_OFF}`}
            >
              {key}
              <span className="ml-1 tabular-nums">{key === "すべて" ? baseViews.length : counts[key]}</span>
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1 text-[11px] text-muted">
            <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} className="size-3.5" />
            在籍者がいない機関も表示
          </label>
        </div>
        {shownViews.length === 0 ? (
          <p className="px-4 pb-4 text-center text-xs text-muted">該当する所属機関はありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-xs">
              <thead>
                <tr className="bg-background text-left text-[11px] text-muted">
                  <th className="px-3 py-2 font-bold">所属機関</th>
                  <th className="px-3 py-2 font-bold">地域</th>
                  <th className="px-3 py-2 text-right font-bold">在籍（1号/2号）</th>
                  <th className="px-3 py-2 font-bold">状況</th>
                  <th className="w-32 px-3 py-2 font-bold">送付日</th>
                  <th className="w-32 px-3 py-2 font-bold">回答日</th>
                  <th className="w-28 px-3 py-2 font-bold">1号の時給</th>
                  <th className="w-28 px-3 py-2 font-bold">2号の時給</th>
                  <th className="px-3 py-2 font-bold">備考</th>
                  <th className="w-20 px-3 py-2 font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {shownViews.map((v) => (
                  <ReplyRow
                    key={`${v.data.org.id}|${effectiveOn}|${v.reply?.updated_at ?? ""}`}
                    view={v}
                    effectiveOn={effectiveOn}
                    today={today}
                    canEdit={canEdit && dateOk}
                    minimum={minimumFor(v.data.region.prefecture)}
                    onSaved={(r) => upsertLocal([r])}
                    onError={(m) => setNotice({ ok: false, message: m })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 地域ごとの集計 */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-bold">地域ごとの時給</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(SOURCE_LABELS) as WageStatsSource[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={source === key}
                onClick={() => setSource(key)}
                className={`${CHIP} ${source === key ? CHIP_ON : CHIP_OFF}`}
              >
                {SOURCE_LABELS[key]}
              </button>
            ))}
            <span className="mx-1 text-muted">｜</span>
            {(Object.keys(LEVEL_LABELS) as RegionLevel[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={level === key}
                onClick={() => setLevel(key)}
                className={`${CHIP} ${level === key ? CHIP_ON : CHIP_OFF}`}
              >
                {LEVEL_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
        <p className="px-4 pt-2 text-[11px] text-muted">
          {source === "replies"
            ? "「回答あり」の機関の回答の時給（機関ごとに1号・2号それぞれ1件）を地域ごとにまとめています。件数は機関数です。"
            : "在籍中の人の登録済みの現在の時給（月給の人は年間所定労働時間で時給に換算）を地域ごとにまとめています。件数は人数です。"}
        </p>
        {samples.length === 0 ? (
          <p className="px-4 py-4 text-center text-xs text-muted">
            {source === "replies" ? "この回の「回答あり」の機関がまだありません。" : "登録済みの時給がありません。"}
          </p>
        ) : (
          <div className="overflow-x-auto px-0 pb-2">
            <table className="w-full min-w-[960px] border-collapse text-xs">
              <thead>
                <tr className="bg-background text-left text-[11px] text-muted">
                  <th className="px-3 py-2 font-bold" rowSpan={2}>地域</th>
                  <th className="px-3 py-2 text-right font-bold" rowSpan={2}>機関数</th>
                  <th className="border-l border-border px-3 py-1 text-center font-bold" colSpan={5}>特定技能1号</th>
                  <th className="border-l border-border px-3 py-1 text-center font-bold" colSpan={5}>特定技能2号</th>
                  <th className="border-l border-border px-3 py-2 text-right font-bold" rowSpan={2}>最低賃金</th>
                  <th className="px-3 py-2 text-right font-bold" rowSpan={2}>1号平均との差</th>
                </tr>
                <tr className="bg-background text-right text-[11px] text-muted">
                  {WAGE_GROUPS.map((g) => (
                    <StatHeads key={g} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map((r) => (
                  <StatRow key={r.key} stat={r} />
                ))}
                <StatRow stat={overall} bold />
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatHeads() {
  return (
    <>
      <th className="border-l border-border px-3 py-1 font-bold">件数</th>
      <th className="px-3 py-1 font-bold">平均</th>
      <th className="px-3 py-1 font-bold">中央値</th>
      <th className="px-3 py-1 font-bold">最低</th>
      <th className="px-3 py-1 font-bold">最高</th>
    </>
  );
}

function StatRow({ stat, bold = false }: { stat: RegionStat; bold?: boolean }) {
  const diff = diffText(stat.groups["1号"]?.average ?? null, stat.minimum);
  const cells = (g: RegionStat["groups"]["1号"]) =>
    g ? (
      <>
        <td className="border-l border-border px-3 py-1.5 text-right tabular-nums">{g.count}</td>
        <td className="px-3 py-1.5 text-right font-bold tabular-nums">{yen(g.average)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{yen(g.median)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{yen(g.min)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{yen(g.max)}</td>
      </>
    ) : (
      <>
        <td className="border-l border-border px-3 py-1.5 text-right text-muted">—</td>
        <td className="px-3 py-1.5" />
        <td className="px-3 py-1.5" />
        <td className="px-3 py-1.5" />
        <td className="px-3 py-1.5" />
      </>
    );
  return (
    <tr className={`border-t border-border ${bold ? "bg-background font-bold" : ""}`}>
      <td className="px-3 py-1.5">{stat.label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">{stat.orgCount}</td>
      {cells(stat.groups["1号"])}
      {cells(stat.groups["2号"])}
      <td className="border-l border-border px-3 py-1.5 text-right tabular-nums">{yen(stat.minimum)}</td>
      <td className={`px-3 py-1.5 text-right tabular-nums ${diff.startsWith("−") ? "text-seal" : ""}`}>{diff}</td>
    </tr>
  );
}

// 回答状況の1行。状況・日付・時給・備考をその場で直して「保存」
function ReplyRow({
  view,
  effectiveOn,
  today,
  canEdit,
  minimum,
  onSaved,
  onError,
}: {
  view: WageReplyView;
  effectiveOn: string;
  today: string;
  canEdit: boolean;
  minimum: number | null;
  onSaved: (reply: OrganizationWageReply) => void;
  onError: (message: string) => void;
}) {
  const r = view.reply;
  const [status, setStatus] = useState<WageReplyStatus>(r?.status ?? (view.autoReplied ? "回答あり" : "未送付"));
  const [sentOn, setSentOn] = useState(r?.sent_on ?? "");
  const [repliedOn, setRepliedOn] = useState(r?.replied_on ?? "");
  const [h1, setH1] = useState(r?.hourly_ssw1 != null ? String(r.hourly_ssw1) : "");
  const [h2, setH2] = useState(r?.hourly_ssw2 != null ? String(r.hourly_ssw2) : "");
  const [note, setNote] = useState(r?.note ?? "");
  const [busy, setBusy] = useState(false);

  const dirty =
    status !== (r?.status ?? (view.autoReplied ? "回答あり" : "未送付")) ||
    sentOn !== (r?.sent_on ?? "") ||
    repliedOn !== (r?.replied_on ?? "") ||
    (parseHourlyInput(h1) ?? null) !== (r?.hourly_ssw1 ?? null) ||
    (parseHourlyInput(h2) ?? null) !== (r?.hourly_ssw2 ?? null) ||
    note !== (r?.note ?? "");

  const save = async (over: Partial<{ status: WageReplyStatus; sentOn: string; repliedOn: string }> = {}) => {
    setBusy(true);
    const res = await saveWageReply({
      organization_id: view.data.org.id,
      effective_on: effectiveOn,
      status: over.status ?? status,
      sent_on: (over.sentOn ?? sentOn) || null,
      replied_on: (over.repliedOn ?? repliedOn) || null,
      hourly_ssw1: parseHourlyInput(h1),
      hourly_ssw2: parseHourlyInput(h2),
      note,
    });
    setBusy(false);
    if (!res.ok) {
      onError(res.message);
      return;
    }
    onSaved(res.reply);
  };

  // 状況を押すと、送付済なら送付日・回答ありなら回答日に今日を入れて保存する
  const choose = (next: WageReplyStatus) => {
    const over: Partial<{ status: WageReplyStatus; sentOn: string; repliedOn: string }> = { status: next };
    if (next === "送付済" && !sentOn) over.sentOn = today;
    if (next === "回答あり" && !repliedOn) over.repliedOn = today;
    setStatus(next);
    if (over.sentOn) setSentOn(over.sentOn);
    if (over.repliedOn) setRepliedOn(over.repliedOn);
    void save(over);
  };

  const hourlyCell = (group: "1号" | "2号", text: string, setText: (v: string) => void) => {
    const fromWages = view.hourlyFromWages[group] ? view.hourly[group] : null;
    const value = parseHourlyInput(text) ?? fromWages;
    const diff = diffText(value, minimum);
    return (
      <td className="px-3 py-1.5">
        <input
          value={formatAmountInput(text)}
          onChange={(e) => setText(e.target.value)}
          inputMode="numeric"
          disabled={!canEdit || busy}
          placeholder={fromWages != null ? `${fromWages.toLocaleString("ja-JP")}（登録済み）` : "未回答"}
          aria-label={`${view.data.org.name} の${group}の時給`}
          className={`${FIELD} w-full text-right tabular-nums`}
        />
        {diff && <span className={`block text-right text-[10px] ${diff.startsWith("−") ? "text-seal" : "text-muted"}`}>最低賃金{diff}</span>}
      </td>
    );
  };

  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-1.5">
        <Link href={`/organizations/${view.data.org.id}`} className="font-bold text-brand hover:underline">
          {view.data.org.name}
        </Link>
        {view.data.workers.length > 0 && (
          <Link href={`/organizations/${view.data.org.id}/wage-raise`} className="ml-1 text-[10px] text-muted underline">
            一括登録
          </Link>
        )}
      </td>
      <td className="px-3 py-1.5 text-muted">{regionLabel(view.data.region, "city")}</td>
      <td className="px-3 py-1.5 text-right tabular-nums">
        {view.data.workers.length}
        <span className="text-[10px] text-muted">
          （{view.counts["1号"]}/{view.counts["2号"]}）
        </span>
      </td>
      <td className="px-3 py-1.5">
        <div className="flex flex-wrap gap-1">
          {WAGE_REPLY_STATUSES.map((s) => {
            const on = status === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                disabled={!canEdit || busy}
                onClick={() => choose(s)}
                className={`rounded-full px-2 py-0.5 text-[10px] ${on ? `${STATUS_TONE[s]} font-bold` : "border border-border text-muted"} disabled:opacity-60`}
              >
                {s}
              </button>
            );
          })}
        </div>
        {view.autoReplied && !r && (
          <span className="mt-0.5 block text-[10px] text-muted">登録済みの時給から自動判定</span>
        )}
        {view.autoReplied && r && r.status !== "回答あり" && (
          <span className="mt-0.5 block text-[10px] text-muted">時給が登録済みのため回答ありとして集計</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        <input type="date" value={sentOn} onChange={(e) => setSentOn(e.target.value)} disabled={!canEdit || busy} className={`${FIELD} w-full`} />
      </td>
      <td className="px-3 py-1.5">
        <input type="date" value={repliedOn} onChange={(e) => setRepliedOn(e.target.value)} disabled={!canEdit || busy} className={`${FIELD} w-full`} />
      </td>
      {hourlyCell("1号", h1, setH1)}
      {hourlyCell("2号", h2, setH2)}
      <td className="px-3 py-1.5">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!canEdit || busy}
          placeholder="例: 電話で確認済み・11/20 再送"
          className={`${FIELD} w-full`}
        />
      </td>
      <td className="px-3 py-1.5">
        {canEdit && (
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => void save()}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-brand px-2.5 text-[11px] font-bold text-brand-foreground disabled:opacity-40"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            保存
          </button>
        )}
      </td>
    </tr>
  );
}
