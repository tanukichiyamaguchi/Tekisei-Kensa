// 受験リンクの「amp;」の救済（11-1 §2.2.1）。&amp; に書き換えられて貼られたリンクを開き直させる。
// next を import しない純関数で、/ と /exam のページ（Server Component）がリダイレクトに使う

const stripAmp = (s: string): string => s.replaceAll("amp;", "");

/**
 * クエリの各キーと値から「amp;」をすべて取り除いたクエリ文字列（先頭の ? なし）。元と変わらなければ null。
 * 配列の値（同じ名前のパラメータが複数）は要素ごとに除いて同じ名前で並べる（値の使い方は呼び出し側が決める）。
 * 参照元は URL 全体から取り除くが、アプリの URL のパスに「amp;」は無いので結果は同じ
 */
export function stripAmpFromSearchParams(
  params: Readonly<Record<string, string | string[] | undefined>>,
): string | null {
  let changed = false;
  const stripped = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const name = stripAmp(key);
    if (name !== key) changed = true;
    for (const v of Array.isArray(value) ? value : [value]) {
      const s = stripAmp(v);
      if (s !== v) changed = true;
      stripped.append(name, s);
    }
  }
  return changed ? stripped.toString() : null;
}
