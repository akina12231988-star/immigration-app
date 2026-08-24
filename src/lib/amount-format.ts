// 金額の入力欄で、打ちながら3桁ごとに「,」を入れて桁数がすぐ分かるようにするための整形。
//
// 金額の欄は「150000」のように数字だけ入れるものと、「無し」「約1万円」のように
// 文字で書くものが混ざっている（求人票の通信費など）。数字だけのときにだけ「,」を入れ、
// 文字が混じっているものは打ったままにする。
//
// 保存される値も「,」入りになるが、金額を読むところ（parseAmount / parseYen /
// wage-calc の numValue など）は「,」を取り除いてから数値にするため計算は変わらない。

// 全角数字を半角にする
function toHalfWidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

// 「,」を取り除く（数値にするとき・保存前の比較に使う）。全角の「，」も同じ扱いにする
export function stripAmountCommas(value: string): string {
  return value.replace(/[,，]/g, "");
}

// 数字だけの入力か（「,」と全角数字、小数点は許す）。
// 「無し」「約1万円」「なし」などが混じっているときは false
function isNumericAmount(value: string): boolean {
  const half = toHalfWidthDigits(value.trim());
  return half !== "" && /^[0-9,，]*\.?[0-9]*$/.test(half) && /[0-9]/.test(half);
}

// 入力欄に出す文字。数字だけのときは3桁ごとに「,」を入れる（小数はそのまま後ろに付ける）
export function formatAmountInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? (value === 0 ? "" : String(value)) : value;
  if (!isNumericAmount(text)) return text;

  const half = toHalfWidthDigits(text.trim());
  const [intPart = "", decimalPart] = stripAmountCommas(half).split(".");
  // 先頭の余分な0は残す（「0」「007」と打った内容を勝手に変えない）
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimalPart === undefined ? grouped : `${grouped}.${decimalPart}`;
}

// value を持たない入力欄（defaultValue と onBlur で保存する一覧の欄）で、
// 打ちながら「,」を入れるためのもの。打っていた位置（数字の何個目か）に戻す
export function formatAmountWhileTyping(el: HTMLInputElement): void {
  const next = formatAmountInput(el.value);
  if (next === el.value) return;
  const caret = el.selectionStart ?? el.value.length;
  const digitsBefore = stripAmountCommas(el.value.slice(0, caret)).length;
  el.value = next;
  let pos = 0;
  let seen = 0;
  while (pos < next.length && seen < digitsBefore) {
    if (next[pos] !== ",") seen += 1;
    pos += 1;
  }
  el.setSelectionRange(pos, pos);
}
