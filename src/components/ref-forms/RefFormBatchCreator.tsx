"use client";

import { useState } from "react";
import Link from "next/link";
import { RefFormCreator } from "./RefFormCreator";
import { WorkerCardCheckPanel } from "./WorkerCardCheckPanel";

export interface BatchForm {
  rowKey: string; // 提出書類一覧表の行のキー
  formKey: string; // 様式のキー（1号のキー）
  name: string; // 様式の名前（例: 参考様式第1-5号）
  label: string; // 行の名前（例: 5 特定技能雇用契約書の写し）
  attachRowKey: string | null; // 作ったPDFを添付する行（行に直接添付できないものは null）
}

// 参考様式をまとめて確認・作成する画面。様式をタブで切り替え、上の「在留カードで確かめる」は全部の様式で共通。
// タブを切り替えても入力した内容は残る（全部の様式を開いたまま、見えているものだけ出す）
export function RefFormBatchCreator({
  workerId,
  forms,
  todoNo,
  fee,
  nationality,
  gender,
  orgId,
  orgName,
}: {
  workerId: string;
  forms: BatchForm[];
  todoNo: string;
  fee: string;
  nationality: string;
  gender: string;
  orgId: string | null;
  orgName: string;
}) {
  const [active, setActive] = useState(0);
  const [reloadSignal, setReloadSignal] = useState(0);
  // 一度開いた様式だけ読み込む（最初から全部の PDF を読まない）。開いたものは入力が消えないよう残す
  const [opened, setOpened] = useState<number[]>([0]);
  const open = (i: number) => {
    setActive(i);
    setOpened((o) => (o.includes(i) ? o : [...o, i]));
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl border-2 border-dashed border-brand/50 bg-brand/5 px-3 py-2 text-xs leading-relaxed">
        <span className="font-black text-brand">🧪 試験中</span>
        ：提出書類一覧表で「有」の参考様式を、この画面で順に確かめて作ります。上のタブで様式を切り替えます（切り替えても入力した内容は残ります）。
        自動で入る所は様式にそのまま出ています。赤い点線の所に文字を入れ、○は動かしたり外したりできます。
        確かめたら、様式ごとに「内容確認」でできあがりを見て「はい」を押し、「この内容で作って、申請準備に添付する」を押してください。本人の情報が違っていたら、右の「在留カードで確かめる」で直すと、全部の様式が作り直されます。
      </p>

      {/* 様式のタブ */}
      <div className="sticky top-[68px] z-10 -mx-1 flex flex-wrap gap-1 rounded-xl bg-background/95 p-1 backdrop-blur">
        {forms.map((f, i) => (
          <button
            key={f.rowKey}
            type="button"
            onClick={() => open(i)}
            className={`min-h-[40px] rounded-lg border px-3 text-left text-xs font-bold ${
              i === active ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-foreground"
            }`}
            title={f.label}
          >
            {i + 1}. {f.name}
            <span className={`block max-w-[14rem] truncate text-[10px] font-normal ${i === active ? "opacity-80" : "text-muted"}`}>
              {f.label}
            </span>
          </button>
        ))}
      </div>

      {forms.map((f, i) =>
        opened.includes(i) ? (
          <div key={f.rowKey} className={i === active ? "" : "hidden"}>
            <h2 className="mb-2 text-sm font-black">
              {i + 1}/{forms.length}　{f.name}　<span className="font-normal text-muted">{f.label}</span>
            </h2>
            <RefFormCreator
              workerId={workerId}
              formKey={f.formKey}
              todoNo={todoNo}
              fee={f.formKey === "t1-7-1" ? fee : ""}
              attachRowKey={f.attachRowKey}
              attachLabel={f.label}
              nationality={nationality}
              gender={gender}
              orgId={orgId}
              orgName={orgName}
              embedded
              reloadSignal={reloadSignal}
              // 在留カードで確かめる（直して保存すると全部の様式を作り直し、ほかのタブの欄も読み直す）
              sidePanel={<WorkerCardCheckPanel key={reloadSignal} workerId={workerId} onSaved={() => setReloadSignal((k) => k + 1)} />}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {i > 0 && (
                <button type="button" onClick={() => open(i - 1)} className="min-h-[40px] rounded-lg border border-border bg-surface px-3 text-xs font-bold">
                  ← 前の様式
                </button>
              )}
              {i < forms.length - 1 && (
                <button type="button" onClick={() => open(i + 1)} className="min-h-[40px] rounded-lg bg-brand px-3 text-xs font-bold text-brand-foreground">
                  次の様式 →（{forms[i + 1].name}）
                </button>
              )}
            </div>
          </div>
        ) : null,
      )}

      <Link href={`/workers/${workerId}/application-prep/unified`} className="text-xs font-bold text-brand underline">
        申請準備へ戻る
      </Link>
    </div>
  );
}
