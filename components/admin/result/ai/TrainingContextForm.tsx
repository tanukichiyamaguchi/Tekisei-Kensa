"use client";
// 育成・定着の「現場の状況を入力（8項目）」の入力欄（11-6 §2.5.3。参照元定義の Group QZZZZ。見た目は別表C の C.1 の .ai-ctx）。
// 箱（.ai-ctx）に見出し h2.ai-ctx-h（生成前の案内の見出し h2 と同じ段。生成済みは案内が隠れて結果の見出し h1 の次に来るので、段を飛ば
// さない。見た目は別表C の #ai .ai-ctx-h）と、2 行 × 4 列の項目（TRAINING_CONTEXT_ROWS。1 行目は勤続年数〜最近の様子）。各項目は
// label.ai-ctx-label（for で選択欄に結び付ける）の下に .ai-ctx-sel（選択欄 select#ai-ctx-{キー} と右の山形）。
// 選択肢の先頭は値が空の「選択してください」（未選択の表示。disabled にしない: 選び直すと未選択に戻る）、続けてマスタの表示名。
// - 値が空の欄は class に is-placeholder（未選択の表示の色。別表C）。
// - aria-invalid="true" は invalid のキーの欄だけ（生成ボタンを押したときの未選択の欄。§2.5.4 の 1。赤枠と影は別表C）。
// - mode が editable でなければ disabled（生成中は選んだ値のまま、生成済みは保存した値のまま選べない。§2.3.5）。
// 選んだ値は呼ぶ側（TrainingPanel）が持ち、onChange で受け取る。選択欄の要素は selectRefs に入れる（生成ボタンを押したときに最初の
// 未選択の欄へ焦点を移すため）。ラベルと選択肢はマスタ（lib/masters/training-context.ts）の文字を React の文字として出す（K-31 ⑤）
import type { RefObject } from "react";

import { ChevronDownIcon } from "./ai-icons";
import type { TrainingContextKey } from "@/lib/masters/training-context";
import {
  TRAINING_CONTEXT_ROWS,
  type TrainingContextDraft,
  type TrainingContextMode,
} from "@/lib/presentation/ai-area";
import { AI_TEXTS } from "@/lib/presentation/ai-texts";

/** 8 項目の選択欄の要素（キーごと） */
export type TrainingContextSelectRefs = RefObject<
  Partial<Record<TrainingContextKey, HTMLSelectElement | null>>
>;

/** 選択欄の id（ラベルの for。E2E もこの id で選ぶ） */
const selectIdOf = (key: TrainingContextKey): string => `ai-ctx-${key}`;

export function TrainingContextForm(props: {
  /** 出す値（各項目の選択肢のコード。未選択は空の文字） */
  readonly values: TrainingContextDraft;
  /** 不正の表示にする欄（生成ボタンを押したときの未選択の欄） */
  readonly invalid: ReadonlySet<TrainingContextKey>;
  readonly mode: TrainingContextMode;
  readonly onChange: (key: TrainingContextKey, code: string) => void;
  readonly selectRefs: TrainingContextSelectRefs;
}) {
  const { values, invalid, mode, onChange, selectRefs } = props;
  return (
    <div className="ai-ctx">
      <h2 className="ai-ctx-h">{AI_TEXTS.trainingContext.heading}</h2>
      {TRAINING_CONTEXT_ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="ai-ctx-row">
          {row.map((field) => {
            const id = selectIdOf(field.key);
            const value = values[field.key];
            return (
              <div key={field.key} className="ai-ctx-item">
                <label className="ai-ctx-label" htmlFor={id}>
                  {field.label}
                </label>
                <div className="ai-ctx-sel">
                  <select
                    ref={(el) => {
                      selectRefs.current[field.key] = el;
                    }}
                    id={id}
                    className={value === "" ? "is-placeholder" : undefined}
                    value={value}
                    disabled={mode !== "editable"}
                    aria-invalid={invalid.has(field.key) ? "true" : undefined}
                    onChange={(event) => onChange(field.key, event.currentTarget.value)}
                  >
                    {field.choices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
