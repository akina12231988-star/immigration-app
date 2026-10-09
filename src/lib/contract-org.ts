// 雇用契約書・雇用条件書を「どの会社の分として登録するか」の選び方。
//
// 選択肢は2段。この外国人に関係する会社（現在の所属機関・雇用開始日を登録した機関・
// 書類がすでにある機関）を先に、そのあとに登録済みの全所属機関を並べる。
// 以前は前者に入っている会社しか選べず、後者を選んでも先頭の会社に戻ってしまっていた。

export interface ContractOrgChoice {
  id: string;
  name: string;
  current: boolean; // 現在の所属機関（申請準備の詳細では準備中の機関）
}

// 選ばれている会社。選んだ会社がどちらかの一覧にあればそれ、無ければ先頭（現在の所属機関）
export function resolveContractOrgId(
  pickedOrgId: string,
  choices: readonly ContractOrgChoice[],
  organizations: readonly { id: string }[],
): string {
  if (pickedOrgId && (choices.some((o) => o.id === pickedOrgId) || organizations.some((o) => o.id === pickedOrgId))) {
    return pickedOrgId;
  }
  return choices[0]?.id ?? "";
}

// プルダウンに並べる会社。関係する会社（現在は「（現在）」付き）→ その他の会社の順で、重複なし
export function contractOrgOptions(
  choices: readonly ContractOrgChoice[],
  organizations: readonly { id: string; name: string }[],
  currentSuffix = "（現在）",
): { id: string; name: string }[] {
  return [
    ...choices.map((o) => ({ id: o.id, name: o.name + (o.current ? currentSuffix : "") })),
    ...organizations
      .filter((o) => !choices.some((c) => c.id === o.id))
      .map((o) => ({ id: o.id, name: o.name })),
  ];
}
