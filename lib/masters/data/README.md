# lib/masters/data（生成物。編集禁止）

このディレクトリの JSON は `scripts/generate-masters.ts` が付録A・付録B から機械生成したものです（基本設計 03 §4.5、08 §7）。手で編集しないでください。

- 付録を改版したら `pnpm masters:generate` で再生成し、付録と生成物を同じ PR に含めます。
- `pnpm masters:check` は再生成結果がコミット済みの内容とバイト一致し、`sourceHash` が現在の生成元と一致することを検査します（CI で実行）。
- 採点式・配点が変わった場合は `lib/scoring/version.ts` の `SCORING_VERSION` を上げてから再生成します（00 §2.4）。

| ファイル              | 生成元                                                      | 内容                                                          |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| `questions.json`      | 付録A「設問（Q1〜Q204）」、`lib/masters/question-layout.ts` | 設問 204 件（Q1〜Q144 は出題・採点対象、Q145〜Q204 は対象外） |
| `choice-scores.json`  | 付録B §1                                                    | 選択肢 5 件 × 配点属性 9 種                                   |
| `traits.json`         | 付録B §2                                                    | 16 尺度の式                                                   |
| `compatibility.json`  | 付録B §3                                                    | 相性 5 軸の式                                                 |
| `aptitudes.json`      | 付録B §4                                                    | 資質 4 型の式                                                 |
| `risks.json`          | 付録B §5                                                    | リスク 7 項目の式                                             |
| `aptitude-types.json` | 付録B §6                                                    | 適性タイプ 16 種の式と所属分類                                |
| `social-styles.json`  | `scripts/lib/labels.ts`（00 §1.7）                          | ソーシャルスタイル 4 分類の表示名・色・並び順                 |

日本語名から識別子への写像は `scripts/lib/labels.ts` にだけ置いています（08 §7.4）。
