"use client";
// P-03 項目一覧（06 §3.5.10）: 16 尺度を値の降順（同点は軸順）で、高い／低い場合のポジティブ・ネガティブと並べる
import { useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { TRAIT_HIGHLIGHT_TEXTS } from "@/lib/masters/texts";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { formatStep } from "@/lib/presentation/rounding";
import { traitLabel } from "@/lib/presentation/result-texts";
import { sortTraitsForList } from "@/lib/presentation/trait-highlights";
import type { TraitKey, TraitScores } from "@/lib/scoring/types";

export function TraitListButton(props: {
  readonly traits: TraitScores;
  readonly highestKey: TraitKey;
  readonly lowestKey: TraitKey;
}) {
  const [open, setOpen] = useState(false);
  const rows = sortTraitsForList(props.traits);
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {ADMIN_TEXTS.showAllTraits}
      </button>
      <Dialog
        open={open}
        title="項目一覧"
        wide
        onClose={() => setOpen(false)}
        footer={
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            閉じる
          </button>
        }
      >
        <table className="data-table trait-list">
          <thead>
            <tr>
              <th scope="col">尺度</th>
              <th scope="col">値</th>
              <th scope="col">高い場合: ポジティブ</th>
              <th scope="col">高い場合: ネガティブ</th>
              <th scope="col">低い場合: ポジティブ</th>
              <th scope="col">低い場合: ネガティブ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const texts = TRAIT_HIGHLIGHT_TEXTS[row.key];
              const mark =
                row.key === props.highestKey ? "最高" : row.key === props.lowestKey ? "最低" : null;
              return (
                <tr
                  key={row.key}
                  className={
                    row.key === props.highestKey
                      ? "trait-list__row--highest"
                      : row.key === props.lowestKey
                        ? "trait-list__row--lowest"
                        : undefined
                  }
                >
                  <th scope="row">
                    {mark ? <span className="badge">{mark}</span> : null} {traitLabel(row.key)}
                  </th>
                  <td>{formatStep(row.value)}</td>
                  <td>{texts.highPositive}</td>
                  <td>{texts.highNegative}</td>
                  <td>{texts.lowPositive}</td>
                  <td>{texts.lowNegative}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Dialog>
    </>
  );
}
