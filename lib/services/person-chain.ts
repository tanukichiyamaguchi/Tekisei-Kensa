// 同じ人の受験を 1 行にまとめる（11-2 §2.2。list-01・keinen-18）。純関数で、Firestore・Next.js に触れない。
// 回答一覧（listResultRows）と受検者の更新（updatePerson）が同じ関数を使い、在籍・退職と組織内分類（11-3）・
// 比較（11-5）・経年比較（11-7）も使う。同じ人とみなすのは前回の結果（previousResultId）でつながった受験だけで、
// 氏名・電話番号の一致は使わない（参照元どおり）

export interface PersonChainNode {
  readonly resultId: string;
  readonly previousResultId: string | null;
  readonly submittedAt: Date;
}

export interface PersonRow<N extends PersonChainNode> {
  readonly head: N; // 代表の受験 = chain[0]
  readonly chain: readonly N[]; // [代表, 前回, 前々回, …]
}

/** submittedAt の降順、同じなら resultId の昇順（文字コードの順。localeCompare は使わない） */
function newestFirst(a: PersonChainNode, b: PersonChainNode): number {
  const byTime = b.submittedAt.getTime() - a.submittedAt.getTime();
  if (byTime !== 0) return byTime;
  if (a.resultId === b.resultId) return 0;
  return a.resultId < b.resultId ? -1 : 1;
}

/**
 * 閲覧範囲の受験（同じ組織・論理削除されていない・オーナー以外は受検者区分が applicant。11-2 §3.5 の手順 1）から行を作る。
 * 戻り値は代表の submittedAt の降順（同じなら resultId の昇順）。閲覧範囲の受験だけでまとめるので、閲覧範囲に無い受験
 * （オーナー以外に対する既存スタッフの受験・論理削除された受験）でつながりが切れる（11-2 §2.2、K-39 Q-35）
 */
export function buildPersonRows<N extends PersonChainNode>(
  nodes: readonly N[],
): readonly PersonRow<N>[] {
  const byId = new Map<string, N>();
  for (const node of nodes) byId.set(node.resultId, node);

  // 2. 前回が入力の中にあり自分でなければ、その前回の「次」をこの受験とする。同じ前回を指す受験が 2 つ以上あれば、
  //    submittedAt が新しい方（同じなら resultId の昇順で先の方）を残す
  const nextOf = new Map<string, N>();
  for (const node of nodes) {
    const previousResultId = node.previousResultId;
    if (previousResultId === null || previousResultId === node.resultId) continue;
    if (!byId.has(previousResultId)) continue;
    const current = nextOf.get(previousResultId);
    if (current === undefined || newestFirst(node, current) < 0) nextOf.set(previousResultId, node);
  }

  const ordered = [...nodes].sort(newestFirst);
  const placed = new Set<string>();
  const rows: PersonRow<N>[] = [];
  // 4. つながり = [代表]。前回が入力の中にあり、まだどの行にも入っていなければ末尾に足して進む。どれかの行に入っている
  //    受験に当たるか、前回が入力に無ければ止まる（たどり済みの判定は行をまたぐ。K-31 ①）
  const follow = (head: N): void => {
    const chain: N[] = [head];
    placed.add(head.resultId);
    let current = head;
    for (;;) {
      const previous =
        current.previousResultId === null ? undefined : byId.get(current.previousResultId);
      if (previous === undefined || placed.has(previous.resultId)) break;
      chain.push(previous);
      placed.add(previous.resultId);
      current = previous;
    }
    rows.push({ head, chain });
  };
  // 3. 自分を前回とする受験が無い受験を、submittedAt の降順（同じなら resultId の昇順）に代表にする
  for (const node of ordered) {
    if (!nextOf.has(node.resultId) && !placed.has(node.resultId)) follow(node);
  }
  // 5. どの行にも入っていない受験（前回のつながりが輪になったなど、起きないはずのデータ）を同じ順に代表にする
  for (const node of ordered) {
    if (!placed.has(node.resultId)) follow(node);
  }
  // 6. 行を代表の submittedAt の降順（同じなら resultId の昇順）に並べる
  return rows.sort((a, b) => newestFirst(a.head, b.head));
}

/** resultId をつながり（代表・前回のどこか）に含む行。無ければ null */
export function findPersonRow<N extends PersonChainNode>(
  rows: readonly PersonRow<N>[],
  resultId: string,
): PersonRow<N> | null {
  return rows.find((row) => row.chain.some((node) => node.resultId === resultId)) ?? null;
}
