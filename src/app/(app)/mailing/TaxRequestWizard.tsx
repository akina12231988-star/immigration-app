"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { SaveBlockers } from "@/components/mailing/SaveBlockers";
import { createClient } from "@/lib/supabase/client";
import { insertJudgmentRecord, insertMunicipality } from "@/lib/supabase/queries/tax-cert";
import { listWorkerAddresses } from "@/lib/supabase/queries/worker-addresses";
import { addressOnDate, type WorkerAddress } from "@/lib/worker-address";
import { municipalityOptionLabel, suggestMunicipalityForAddress } from "@/lib/prefectures";
import { taxSaveBlockers } from "@/lib/mailing-save-check";
import { dbErrorMessage } from "@/lib/errors";
import {
  collectionLabel,
  formatDateJP,
  fiscalYearLabel,
  todayISO,
  yearWithReiwa,
  type CollectionType,
  type JudgmentRecord,
  type MoneyOrder,
  type Municipality,
  type MunicipalityInput,
  type RecipientType,
  type RequestMethod,
  type YearType,
} from "@/lib/tax-cert";
import {
  buildTaxRequestPlan,
  muniMoneyOrderGroup,
  planFiscalYears,
  suggestRequestedYears,
  taxPlanBlockers,
  yearLabelOf,
} from "@/lib/tax-request-plan";
import { MoneyOrderFields } from "./MoneyOrderFields";
import {
  buildMethodInfo,
  checkMethodValid,
  DocList,
  MethodToggleSection,
  MunicipalityModal,
  MunicipalitySiteLinks,
  ResultStamp,
} from "./tax-parts";
import { INPUT, LABEL, Pill, type MailingWorker } from "./ui";

// 郵送請求 ＞ 課税証明書と納税証明書（手順式）。
// ① 住所の確認 → ② 年度ごとの自治体 → ③ 年度ごとの徴収区分 → ④ 申請予定日 →
// ⑤ 年度ごとの国保加入 → ⑥ 判定結果（自治体ごとに何年度を請求するか・定額小為替）の順に進む。
// 自治体マスタに無い自治体はポップアップで登録でき、閉じるとそのまま選んだ状態で入力に戻れる

const YEARS: YearType[] = ["new", "prev"];
const STEP_TITLES = ["住所の確認", "年度ごとの自治体", "徴収区分", "申請予定日", "国民健康保険の加入", "判定結果"];

type PerYear<T> = Record<YearType, T>;
// 自治体の登録ポップアップをどの欄から開いたか
type MuniSlot = "new" | "prev" | "nhi-new" | "nhi-prev";

interface Props {
  municipalities: Municipality[];
  setMunicipalities: (m: Municipality[]) => void;
  records: JudgmentRecord[];
  setRecords: (r: JudgmentRecord[]) => void;
  personName: string;
  workerId: string;
  todoNumber: string;
  worker: MailingWorker | null;
  canEdit: boolean;
  showToast: (m: string) => void;
}

// 保存後に「続けて別の請求を入力」で最初からやり直せるように、中身を key で作り直す
export function TaxRequestWizard(props: Props) {
  const [round, setRound] = useState(0);
  return <WizardBody key={round} {...props} onReset={() => setRound((n) => n + 1)} />;
}

function WizardBody({
  municipalities,
  setMunicipalities,
  records,
  setRecords,
  personName,
  workerId,
  todoNumber,
  worker,
  canEdit,
  showToast,
  onReset,
}: Props & { onReset: () => void }) {
  const [step, setStep] = useState(1);
  const [appDate, setAppDate] = useState(todayISO());
  const appDateObj = new Date((appDate || todayISO()) + "T00:00:00");
  const fy = planFiscalYears(appDateObj);

  // ① 住所歴（人を切り替えたら読み直す）
  const [addresses, setAddresses] = useState<WorkerAddress[] | null>(null);
  useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    listWorkerAddresses(createClient(), workerId)
      .then((rows) => {
        if (!cancelled) setAddresses(rows);
      })
      .catch(() => {
        if (!cancelled) setAddresses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workerId]);
  const currentAddress = worker?.address ?? "";
  // 年度ごとの1月1日時点の住所と、当てはまる自治体
  const yearAddress = (y: YearType) => {
    const on = `${fy[y]}-01-01`;
    const hit = addresses ? addressOnDate(addresses, on) : null;
    const address = hit?.address ?? (addresses && addresses.length === 0 ? currentAddress : "");
    const fallback = !hit && !!address;
    const suggested = address ? suggestMunicipalityForAddress(address, municipalities) : null;
    return { address, fallback, suggested };
  };
  const currentSuggested = currentAddress ? suggestMunicipalityForAddress(currentAddress, municipalities) : null;

  // ② 年度ごとの自治体
  const [sameMuni, setSameMuni] = useState<boolean | null>(null);
  const [muniIds, setMuniIds] = useState<PerYear<string>>({ new: "", prev: "" });
  const muniOf = (id: string) => municipalities.find((m) => m.id === id) ?? null;
  const newMuni = muniOf(muniIds.new);
  const prevMuni = sameMuni ? newMuni : muniOf(muniIds.prev);
  const yearMuni: PerYear<Municipality | null> = { new: newMuni, prev: prevMuni };

  // ③ 年度ごとの徴収区分
  const [collection, setCollection] = useState<PerYear<CollectionType>>({ new: "special", prev: "special" });

  // ⑤ 年度ごとの国保加入と、国保税の納税証明書の請求先
  const [nhi, setNhi] = useState<PerYear<boolean>>({ new: false, prev: false });
  const [nhiMuniIds, setNhiMuniIds] = useState<PerYear<string>>({ new: "", prev: "" });

  // ⑥ 請求する年度（目安から外したり足したりできる）
  const [requestedOverride, setRequestedOverride] = useState<Partial<PerYear<boolean>>>({});
  const suggestion = newMuni ? suggestRequestedYears({ newMuni, newCollection: collection.new, appDate: appDateObj }) : null;
  const requested: PerYear<boolean> = {
    new: requestedOverride.new ?? suggestion?.new ?? false,
    prev: requestedOverride.prev ?? suggestion?.prev ?? false,
  };

  // 受領方法・定額小為替
  const [method, setMethod] = useState<RequestMethod>("mail");
  const [mailDate, setMailDate] = useState(todayISO());
  const [recipient, setRecipient] = useState<RecipientType>("self");
  const [agent, setAgent] = useState("");
  const [moneyOrders, setMoneyOrders] = useState<MoneyOrder[]>([]);
  const [mainAlt, setMainAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<JudgmentRecord | null>(null);

  // 自治体マスタへの登録ポップアップ
  const [addFor, setAddFor] = useState<{ slot: MuniSlot; name: string } | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const pickSlot = (slot: MuniSlot, id: string) => {
    if (slot === "new" || slot === "prev") setMuniIds((m) => ({ ...m, [slot]: id }));
    else setNhiMuniIds((m) => ({ ...m, [slot === "nhi-new" ? "new" : "prev"]: id }));
  };
  const createMunicipality = async (form: MunicipalityInput) => {
    if (!addFor) return;
    setAddBusy(true);
    try {
      const created = await insertMunicipality(createClient(), form);
      setMunicipalities([...municipalities, created].sort((a, b) => a.name.localeCompare(b.name, "ja")));
      pickSlot(addFor.slot, created.id);
      setAddFor(null);
      showToast(`自治体マスタに「${created.name}」を登録し、選択しました`);
    } catch (e) {
      showToast(dbErrorMessage(e, "0145_municipality_prefecture.sql", "自治体の登録に失敗しました"));
    } finally {
      setAddBusy(false);
    }
  };

  const muniOptions = useMemo(
    () => municipalities.map((m) => ({ id: m.id, label: municipalityOptionLabel(m) })),
    [municipalities],
  );

  const yearInputs = YEARS.map((y) => ({
    yearType: y,
    nhi: nhi[y],
    nhiMuni: muniOf(nhiMuniIds[y]),
  }));
  const planReasons = taxPlanBlockers({ newMuni, prevMuni, appDate, years: yearInputs });
  const plan =
    newMuni && prevMuni && appDate
      ? buildTaxRequestPlan({
          appDate: appDateObj,
          years: YEARS.map((y) => ({
            yearType: y,
            muni: yearMuni[y] as Municipality,
            collectionType: collection[y],
            requested: requested[y],
            nhi: nhi[y],
            nhiMuni: muniOf(nhiMuniIds[y]),
          })),
        })
      : null;

  // ①→②: 住所から当てはまる自治体を先に入れておく（選び直せる）
  const goStep2 = () => {
    const sNew = yearAddress("new").suggested;
    const sPrev = yearAddress("prev").suggested;
    setMuniIds((m) => ({ new: m.new || sNew?.id || "", prev: m.prev || sPrev?.id || "" }));
    if (sameMuni === null && sNew && sPrev) setSameMuni(sNew.id === sPrev.id);
    setStep(2);
  };
  // ④→⑤: 国保税の請求先は、最新年度は今の住所の自治体、前年度はその年度の自治体を先に入れておく
  const goStep5 = () => {
    setNhiMuniIds((m) => ({
      new: m.new || currentSuggested?.id || newMuni?.id || "",
      prev: m.prev || prevMuni?.id || "",
    }));
    setStep(5);
  };

  const step2Reasons = [
    ...(sameMuni === null ? ["最新年度と前年度が同じ自治体かを選んでください"] : []),
    ...(!newMuni ? [sameMuni ? "自治体を選んでください" : "最新年度の自治体を選んでください"] : []),
    ...(sameMuni === false && !prevMuni ? ["前年度の自治体を選んでください"] : []),
  ];

  const saveReasons = [
    ...taxSaveBlockers({
      canEdit,
      saved: !!saved,
      personName,
      method,
      mailDate,
      recipient,
      agent,
      hasNhi: false,
      nhiSameAsMain: true,
      nhiMethod: method,
      nhiMailDate: mailDate,
      nhiRecipient: recipient,
      nhiAgent: agent,
    }),
    ...(plan && plan.docs.length === 0 ? ["請求する年度（または国保税の納税証明書）を1つ以上選んでください"] : []),
  ];

  const save = async () => {
    if (!plan || !newMuni || !prevMuni) return;
    if (!checkMethodValid(method, mailDate, recipient, agent)) return showToast("受領方法の入力を確認してください");
    const first = plan.years[0];
    const both = plan.years.length === 2;
    const nhiFirst = plan.nhiYears[0];
    const mainInfo = buildMethodInfo(method, mailDate, recipient, agent);
    const groups = new Set(plan.groups.map((g) => muniMoneyOrderGroup(g.muni.id)));
    const record: JudgmentRecord = {
      id: "",
      createdAt: "",
      // 以前の記録と同じ項目にも入れておく（記録一覧の絞り込み・表示用）
      municipalityId: first?.municipalityId ?? newMuni.id,
      municipalityName: first?.municipalityName ?? newMuni.name,
      collectionType: collection.new,
      appDate,
      hasNhi: plan.nhiYears.length > 0,
      nhiMunicipalityId: nhiFirst?.municipalityId ?? "",
      nhiMunicipalityName: nhiFirst?.municipalityName ?? "",
      nhiFiscalStartYear: nhiFirst?.fiscalStartYear ?? null,
      yearType: first?.yearType ?? "new",
      fiscalStartYear: first?.fiscalStartYear ?? fy.new,
      yearReason: suggestion?.reason ?? "",
      timingStatus: plan.years.some((y) => y.timingStatus === "warn") ? "warn" : "ok",
      timingLabel: first?.timingLabel ?? "",
      timingDetail: first?.timingDetail ?? "",
      docs: plan.docs,
      requestBothYears: both,
      prevMunicipalityId: both ? plan.years[1].municipalityId : undefined,
      prevMunicipalityName: both ? plan.years[1].municipalityName : undefined,
      prevFiscalStartYear: both ? plan.years[1].fiscalStartYear : undefined,
      yearRequests: plan.years,
      nhiYears: plan.nhiYears,
      personName: personName.trim(),
      workerId: workerId || undefined,
      todoNumber: todoNumber.trim(),
      workerAddress: currentAddress,
      mainAlternativeNote: mainAlt.trim(),
      nhiAlternativeNote: "",
      ...mainInfo,
      nhiRequestMethod: mainInfo.requestMethod,
      nhiMailRequestDate: mainInfo.mailRequestDate,
      nhiRecipientType: mainInfo.recipientType,
      nhiAgentName: mainInfo.agentName,
      nhiSameAsMain: true,
      // 今の判定結果に無い自治体の分は残さない
      moneyOrders: method === "mail" ? moneyOrders.filter((o) => groups.has(o.group as `muni:${string}`)) : [],
    };
    setBusy(true);
    try {
      const created = await insertJudgmentRecord(createClient(), record);
      setRecords([created, ...records]);
      setSaved(created);
      showToast("請求を記録しました");
    } catch (e) {
      showToast("保存に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  if (municipalities.length === 0 && !addFor) {
    return (
      <Card className="p-4">
        <p className="rounded-xl bg-background p-6 text-center text-sm text-muted">
          自治体マスタが未登録です。「自治体マスタ」タブで追加するか、
          <button type="button" onClick={() => setAddFor({ slot: "new", name: "" })} className="font-bold text-brand underline">
            ここから登録
          </button>
          してください。
        </p>
      </Card>
    );
  }

  const muniPicker = (slot: MuniSlot, value: string) => (
    <div className="flex flex-col gap-1">
      <Combobox
        options={muniOptions}
        value={value}
        onChange={(id) => pickSlot(slot, id)}
        onCreate={canEdit ? (name) => setAddFor({ slot, name }) : undefined}
        createLabel="を自治体マスタに登録"
        placeholder="自治体名・県名を入力して検索"
      />
      {canEdit && (
        <button
          type="button"
          onClick={() => setAddFor({ slot, name: "" })}
          className="flex items-center gap-1 self-start text-xs font-bold text-brand"
        >
          <Plus size={13} />
          一覧に無いときは自治体マスタに登録（入力中の内容は消えません）
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <StepIndicator step={step} onJump={(n) => n < step && setStep(n)} />

      {/* ① 住所の確認 */}
      <StepCard n={1} step={step}>
        <p className="mb-2 text-xs text-muted">
          課税・納税証明書は、その年度の1月1日時点に住んでいた自治体が発行します。住所の記録から年度ごとの住所を確認してください。
        </p>
        {!workerId ? (
          <p className="rounded-xl bg-background p-3 text-sm text-muted">
            上の「対象者情報」で外国人を選ぶと、住所の記録が表示されます（選ばずに進むこともできます）。
          </p>
        ) : (
          <div className="rounded-xl border border-border bg-background p-3 text-xs leading-relaxed">
            <p className="mb-1 flex items-center gap-1 text-sm font-bold">
              <MapPin size={14} />
              住所の記録
            </p>
            <p>
              <span className="font-bold">現在の住所：</span>
              {currentAddress || <span className="text-muted">未登録</span>}
            </p>
            {addresses === null ? (
              <p className="mt-1 text-muted">住所歴を読み込み中…</p>
            ) : addresses.length === 0 ? (
              <p className="mt-1 text-muted">住所歴が未登録です（外国人詳細の住所歴で転入日ごとに登録できます）。</p>
            ) : (
              <ul className="mt-1 flex flex-col gap-0.5">
                {[...addresses]
                  .sort((a, b) => b.moved_on.localeCompare(a.moved_on))
                  .map((a) => (
                    <li key={a.id}>
                      <span className="tabular-nums text-muted">{formatDateJP(a.moved_on)} 転入</span>　{a.address}
                    </li>
                  ))}
              </ul>
            )}
            {addresses !== null && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {YEARS.map((y) => {
                  const ya = yearAddress(y);
                  return (
                    <div key={y} className="rounded-lg bg-surface px-2.5 py-2">
                      <p className="font-bold">
                        {yearLabelOf(y)}（{yearWithReiwa(fy[y])}）＝ {fy[y]}年1月1日時点の住所
                      </p>
                      <p className={ya.address ? "" : "text-muted"}>
                        {ya.address || "住所歴に該当する住所がありません"}
                        {ya.fallback && <span className="text-status-notice-fg">（住所歴が未登録のため現在の住所。要確認）</span>}
                      </p>
                      <p className="mt-0.5">
                        {yearLabelOf(y)}の対象の自治体：
                        {ya.suggested ? (
                          <span className="font-bold">{ya.suggested.name}</span>
                        ) : (
                          <span className="text-muted">自治体マスタに当てはまるものがありません（次の手順で選ぶか登録）</span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {step === 1 && (
          <Button fullWidth className="mt-3" onClick={goStep2}>
            次へ（自治体を選ぶ）
          </Button>
        )}
      </StepCard>

      {/* ② 年度ごとの自治体 */}
      {step >= 2 && (
        <StepCard n={2} step={step}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className={LABEL}>
                最新年度（{yearWithReiwa(fy.new)}）と前年度（{yearWithReiwa(fy.prev)}）の自治体
              </span>
              <div className="flex gap-2">
                <Pill active={sameMuni === true} onClick={() => setSameMuni(true)}>同じ自治体</Pill>
                <Pill active={sameMuni === false} onClick={() => setSameMuni(false)}>年度ごとに違う自治体</Pill>
              </div>
            </div>
            {sameMuni === true && (
              <label className="flex flex-col gap-1">
                <span className={LABEL}>両年度の自治体（{fy.prev}年・{fy.new}年の1月1日時点の住所地）</span>
                {muniPicker("new", muniIds.new)}
              </label>
            )}
            {sameMuni === false &&
              YEARS.map((y) => (
                <label key={y} className="flex flex-col gap-1">
                  <span className={LABEL}>
                    {yearLabelOf(y)}（{yearWithReiwa(fy[y])}）の自治体 ＝ {fy[y]}年1月1日時点の住所地
                  </span>
                  {muniPicker(y, muniIds[y])}
                </label>
              ))}
            <MunicipalitySiteLinks municipalities={municipalities} ids={[newMuni?.id ?? "", prevMuni?.id ?? ""]} />
            {step === 2 && (
              <>
                <Button fullWidth disabled={step2Reasons.length > 0} onClick={() => setStep(3)}>
                  次へ（徴収区分）
                </Button>
                <SaveBlockers reasons={step2Reasons} />
              </>
            )}
          </div>
        </StepCard>
      )}

      {/* ③ 年度ごとの徴収区分 */}
      {step >= 3 && (
        <StepCard n={3} step={step}>
          <div className="flex flex-col gap-3">
            {YEARS.map((y) => (
              <div key={y} className="flex flex-col gap-1">
                <span className={LABEL}>
                  {yearLabelOf(y)}（{yearWithReiwa(fy[y])}・{yearMuni[y]?.name ?? "自治体未選択"}）の徴収区分
                </span>
                <div className="flex gap-2">
                  <Pill active={collection[y] === "special"} onClick={() => setCollection((c) => ({ ...c, [y]: "special" }))}>
                    特別徴収
                  </Pill>
                  <Pill active={collection[y] === "normal"} onClick={() => setCollection((c) => ({ ...c, [y]: "normal" }))}>
                    普通徴収
                  </Pill>
                </div>
              </div>
            ))}
            {step === 3 && (
              <Button fullWidth onClick={() => setStep(4)}>
                次へ（申請予定日）
              </Button>
            )}
          </div>
        </StepCard>
      )}

      {/* ④ 申請予定日 */}
      {step >= 4 && (
        <StepCard n={4} step={step}>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>申請予定日</span>
            <input type="date" value={appDate} onChange={(e) => setAppDate(e.target.value)} className={INPUT} />
            <span className="text-[11px] text-muted">在留資格の申請を行う予定の日付を選択してください</span>
          </label>
          {appDate && planFiscalYears(new Date(todayISO() + "T00:00:00")).new !== fy.new && (
            <p className="mt-2 rounded-xl bg-status-notice-bg px-3 py-2 text-xs font-bold text-status-notice-fg">
              申請予定日の時点では最新年度が {yearWithReiwa(fy.new)} になります（6月に切り替わります）。
              ①②の住所・自治体が合っているか確認してください。
            </p>
          )}
          {step === 4 && (
            <Button fullWidth className="mt-3" disabled={!appDate} onClick={goStep5}>
              次へ（国民健康保険）
            </Button>
          )}
        </StepCard>
      )}

      {/* ⑤ 年度ごとの国保加入 */}
      {step >= 5 && (
        <StepCard n={5} step={step}>
          <p className="mb-2 text-xs text-muted">
            国民健康保険に加入していた年度は、その年度の国民健康保険税の納税証明書も請求します。
            請求先は国保に加入していた自治体です（最新年度は今の住所の自治体を先に入れています）。
          </p>
          <div className="flex flex-col gap-3">
            {YEARS.map((y) => (
              <div key={y} className="rounded-xl bg-background p-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={nhi[y]}
                    onChange={(e) => setNhi((v) => ({ ...v, [y]: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  {yearLabelOf(y)}（{yearWithReiwa(fy[y])}）に国民健康保険に加入していた
                </label>
                {nhi[y] && (
                  <div className="mt-2 flex flex-col gap-1">
                    <span className={LABEL}>国保税の納税証明書の請求先</span>
                    {muniPicker(y === "new" ? "nhi-new" : "nhi-prev", nhiMuniIds[y])}
                  </div>
                )}
              </div>
            ))}
            {step === 5 && (
              <>
                <Button fullWidth disabled={planReasons.length > 0} onClick={() => setStep(6)}>
                  判定する
                </Button>
                <SaveBlockers reasons={planReasons} />
              </>
            )}
          </div>
        </StepCard>
      )}

      {/* ⑥ 判定結果（自治体ごと） */}
      {step >= 6 && plan && newMuni && (
        <StepCard n={6} step={step}>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border p-3">
              <p className="mb-1 text-sm font-bold">請求する年度（課税証明書・市県民税納税証明書）</p>
              {suggestion && (
                <p className="mb-2 text-xs text-muted">
                  目安：{suggestion.new ? `最新年度（${yearWithReiwa(fy.new)}）` : `前年度（${yearWithReiwa(fy.prev)}）`}。
                  {suggestion.reason}
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                {YEARS.map((y) => (
                  <label key={y} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={requested[y]}
                      onChange={(e) => setRequestedOverride((o) => ({ ...o, [y]: e.target.checked }))}
                      className="h-4 w-4"
                    />
                    {yearLabelOf(y)}（{fiscalYearLabel(fy[y])}）：{yearMuni[y]?.name}（{collectionLabel(collection[y])}）
                    {suggestion?.[y] && <span className="text-[11px] font-bold text-brand">目安</span>}
                  </label>
                ))}
              </div>
            </div>

            {plan.years.map((y) => (
              <ResultStamp
                key={y.yearType}
                warn={y.timingStatus === "warn"}
                title={`${y.municipalityName}：${yearLabelOf(y.yearType)}（${fiscalYearLabel(y.fiscalStartYear)}）の証明書を取得`}
                label={y.timingLabel}
                notes={[y.timingDetail]}
              />
            ))}

            <MethodToggleSection
              title="受領方法"
              method={method}
              setMethod={setMethod}
              mailDate={mailDate}
              setMailDate={setMailDate}
              recipient={recipient}
              setRecipient={setRecipient}
              agent={agent}
              setAgent={setAgent}
            />

            {plan.groups.map((g) => (
              <div key={g.muni.id} className="overflow-hidden rounded-xl border border-border">
                <div className="border-b border-border bg-brand/10 px-4 py-2.5 text-sm font-bold text-brand">
                  {g.muni.name} に請求する書類（{g.docs.length}通）
                </div>
                <div className="p-3">
                  <MunicipalitySiteLinks municipalities={municipalities} ids={[g.muni.id]} />
                  <DocList docs={g.docs} />
                  {method === "mail" && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-sm font-bold text-muted">{g.muni.name} に同封した定額小為替</p>
                      <MoneyOrderFields
                        titles={g.docs.map((d) => d.title)}
                        orders={moneyOrders}
                        onChange={setMoneyOrders}
                        group={muniMoneyOrderGroup(g.muni.id)}
                        canEdit={canEdit && !saved}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {plan.docs.length === 0 && (
              <p className="rounded-xl bg-background p-3 text-sm text-muted">請求する書類がありません。上で請求する年度を選んでください。</p>
            )}

            <label className="flex flex-col gap-1">
              <span className={LABEL}>代替対応の備考</span>
              <textarea
                value={mainAlt}
                onChange={(e) => setMainAlt(e.target.value)}
                placeholder="判定年度で発行できなかった場合の対応内容（任意）"
                className={`${INPUT} min-h-[56px] py-2`}
              />
            </label>

            {saved ? (
              <div className="space-y-2">
                <p className="flex items-center gap-1 rounded-xl bg-status-reported-bg p-3 text-sm font-bold text-status-reported-fg">
                  <Check size={15} />
                  記録しました。届いた証明書・領収書は「記録一覧」や外国人詳細から添付できます。
                </p>
                <Button fullWidth variant="secondary" onClick={onReset}>
                  続けて別の請求を入力
                </Button>
              </div>
            ) : (
              canEdit && (
                <Button fullWidth disabled={busy || saveReasons.length > 0} onClick={save}>
                  {busy ? "保存中…" : "この結果を記録として保存"}
                </Button>
              )
            )}
            <SaveBlockers reasons={saved ? [] : saveReasons} />
          </div>
        </StepCard>
      )}

      {addFor && (
        <MunicipalityModal
          initial={null}
          initialName={addFor.name}
          busy={addBusy}
          onClose={() => setAddFor(null)}
          onSave={(form) => void createMunicipality(form)}
        />
      )}
    </div>
  );
}

function StepIndicator({ step, onJump }: { step: number; onJump: (n: number) => void }) {
  return (
    <ol className="flex flex-wrap gap-1.5">
      {STEP_TITLES.map((t, i) => {
        const n = i + 1;
        const done = n < step;
        const cur = n === step;
        return (
          <li key={t}>
            <button
              type="button"
              onClick={() => onJump(n)}
              disabled={!done}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                cur
                  ? "bg-brand text-brand-foreground"
                  : done
                    ? "bg-brand/10 text-brand"
                    : "bg-background text-muted"
              }`}
            >
              {n}. {t}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({ n, step, children }: { n: number; step: number; children: React.ReactNode }) {
  return (
    <Card className={`p-4 ${n === step ? "ring-2 ring-brand/40" : ""}`}>
      <p className="mb-2 flex items-center gap-2 text-sm font-bold">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
            n < step ? "bg-brand/15 text-brand" : "bg-brand text-brand-foreground"
          }`}
        >
          {n < step ? <Check size={13} /> : n}
        </span>
        {STEP_TITLES[n - 1]}
      </p>
      {children}
    </Card>
  );
}
