"use client";

import { useEffect, useRef } from "react";

// 外国人書類（onboarding_documents）の変更を、同じ画面の他のセクションに知らせる。
//
// 申請準備の書類チェックリストと源泉徴収票セクションは同じデータ（doc_key）を
// 別々に読んでいるため、片方で添付・削除しても、もう片方はページを開き直すまで
// 古い表示のままだった。片方が変えたらこの合図でお互いに読み直す。
const EVENT_NAME = "worker-docs-changed";

export function notifyWorkerDocsChanged(workerId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { workerId } }));
}

// 同じ外国人の書類が変わったら reload を呼ぶ（自分が出した合図でも読み直す。
// 二重読み込みになるだけで表示は崩れない）
export function useWorkerDocsChanged(workerId: string, reload: () => void): void {
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ workerId?: string }>).detail;
      if (!detail?.workerId || detail.workerId === workerId) reload();
    };
    window.addEventListener(EVENT_NAME, onChanged);
    return () => window.removeEventListener(EVENT_NAME, onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);
}

// ---- 顔写真 ----
// 顔写真も申請準備のチェックリストと外国人詳細の見出しの両方から登録できるため、
// 片方で登録したらもう片方にもすぐ最新の写真を出す
const PHOTO_EVENT_NAME = "worker-photo-changed";

export function notifyWorkerPhotoChanged(workerId: string, url: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PHOTO_EVENT_NAME, { detail: { workerId, url } }));
}

// 同じ外国人の顔写真が登録されたら、新しい表示用URLを受け取る
export function useWorkerPhotoChanged(
  workerId: string,
  apply: (url: string) => void,
): void {
  const applyRef = useRef(apply);
  // 最新の処理を効果の中から呼べるようにする（レンダー中には書き換えない）
  useEffect(() => {
    applyRef.current = apply;
  });
  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ workerId?: string; url?: string }>).detail;
      if (!detail?.url) return;
      if (!detail.workerId || detail.workerId === workerId) applyRef.current(detail.url);
    };
    window.addEventListener(PHOTO_EVENT_NAME, onChanged);
    return () => window.removeEventListener(PHOTO_EVENT_NAME, onChanged);
  }, [workerId]);
}
