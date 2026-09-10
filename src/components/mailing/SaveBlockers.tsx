// 「保存」「判定する」が押せない理由を赤字で出す（理由が無ければ何も出さない）
export function SaveBlockers({ reasons, className = "" }: { reasons: string[]; className?: string }) {
  if (reasons.length === 0) return null;
  return (
    <div role="alert" className={`rounded-xl bg-seal/10 px-3 py-2 text-xs font-bold text-seal ${className}`}>
      <p>ボタンが押せない理由：</p>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
        {reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
