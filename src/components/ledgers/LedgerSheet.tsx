// 労働局の訪問指導（監査）で出す帳簿の印刷用の表（A4横）。
// 1枚に収まるよう横幅いっぱいの表にし、はみ出す列は折り返して見せる

export interface LedgerTable {
  header: string[];
  rows: string[][];
}

export function LedgerSheet({
  title,
  retention,
  table,
  subtitle,
  baseDate,
  empty = "対象の記録がありません。",
}: {
  title: string;
  retention: string;
  table: LedgerTable;
  // 見出しの横に出す説明（例: 当日点検 リストNo.1・3）
  subtitle?: string;
  baseDate: string;
  empty?: string;
}) {
  return (
    <section className="ledger-sheet mb-6 border border-border bg-white p-[8mm] text-black print:mb-0 print:border-0">
      <div className="mb-2 flex items-end justify-between gap-4">
        <h2 className="text-base font-black">
          {title}
          {subtitle && <span className="ml-2 text-xs font-bold">（{subtitle}）</span>}
        </h2>
        <p className="text-[10px] text-gray-500">
          {retention} ／ 出力日: {baseDate}
        </p>
      </div>
      {table.rows.length === 0 ? (
        <p className="text-xs text-gray-600">{empty}</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-[8.5px] leading-tight">
          <thead>
            <tr>
              {table.header.map((h, i) => (
                <th
                  key={`${h}-${i}`}
                  className="break-words border border-gray-400 bg-gray-100 px-[2px] py-[3px] text-left font-bold"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {table.header.map((_, j) => (
                  <td
                    key={j}
                    className="break-words border border-gray-400 px-[2px] py-[3px] align-top"
                  >
                    {row[j] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// 表に出す文字（数値・空欄もそのまま読める形にする）
export function ledgerCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}
