"use client";
// 入社日・退職日のダイアログ（11-2 §2.14）。自分の dialog 要素を showModal で開く（Dialog は見出しの行に閉じるアイコンを描くので使わない）。
// 一覧の根（.rl-root）の中に描き、一覧の色の変数と管理画面に共通の焦点の枠を効かせる。開いたら入社日の入力欄に焦点、閉じたら開いた操作の
// 要素（⋮・区分チップ）に焦点を戻す。Esc では閉じない（cancel と Escape の keydown を止める）、暗幕を押すと閉じる（保存しない）。
// 暗幕の判定は押した先が dialog 要素自身か（dialog の内側の余白を 0 にし、余白は中の箱に付ける）。
// 保存は employmentFromDates で、退職日が入社日より前なら通知を出して閉じない（通知はこのダイアログの中に出る。Toast）。
// 日付の欄に途中までの入力や実在しない日があると、ブラウザは値を空にして validity.badInput を立てるので、空の欄（null で保存）と
// 区別して通知「日付が正しくありません」を出し、閉じない（保存しない。前後の判定より先。11-2 §2.14 の 1.3 版）
import { useEffect, useId, useRef, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import { employmentFromDates, type Employment } from "@/lib/presentation/employment";
import { RESULT_LIST_TEXTS } from "@/lib/presentation/result-list-texts";

export interface EmploymentDatesTarget {
  /** 氏名（空なら「（氏名なし）」） */
  readonly name: string;
  /** 行の区分・入社日・退職日（初期値と、保存の区分の決め方に使う） */
  readonly employment: Employment;
}

export function EmploymentDatesDialog(props: {
  readonly target: EmploymentDatesTarget | null;
  /** 開くたびに変わる値（入力欄を行の値で作り直す） */
  readonly openKey: number;
  readonly onClose: () => void;
  readonly onSave: (value: Employment) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const titleId = useId();
  const open = props.target !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current = document.activeElement;
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>("input")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    }
  }, [open]);

  useEffect(() => {
    // Esc では閉じない。Chrome は cancel を止めても、間に利用者の操作が無い 2 回目の Esc では閉じるので、閉じる要求そのものを起こさない
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="rl-dates"
      aria-labelledby={titleId}
      onCancel={(event) => event.preventDefault()}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      {props.target ? (
        <DatesForm
          key={props.openKey}
          titleId={titleId}
          target={props.target}
          onClose={props.onClose}
          onSave={props.onSave}
        />
      ) : null}
    </dialog>
  );
}

function DatesForm(props: {
  readonly titleId: string;
  readonly target: EmploymentDatesTarget;
  readonly onClose: () => void;
  readonly onSave: (value: Employment) => void;
}) {
  const t = RESULT_LIST_TEXTS.dates;
  const toast = useToast();
  const hiredId = useId();
  const leftId = useId();
  const [hiredOn, setHiredOn] = useState(props.target.employment.hiredOn ?? "");
  const [leftOn, setLeftOn] = useState(props.target.employment.leftOn ?? "");
  const hiredInput = useRef<HTMLInputElement>(null);
  const leftInput = useRef<HTMLInputElement>(null);

  const save = () => {
    // 途中までの入力・実在しない日（値は空で validity.badInput）。空の欄として保存すると日付が消えるので止める
    if (hiredInput.current?.validity.badInput || leftInput.current?.validity.badInput) {
      toast.show(RESULT_LIST_TEXTS.toast.invalidDate);
      return;
    }
    const result = employmentFromDates(
      props.target.employment,
      hiredOn === "" ? null : hiredOn,
      leftOn === "" ? null : leftOn,
    );
    if (!result.ok) {
      toast.show(RESULT_LIST_TEXTS.toast.leftBeforeHired);
      return;
    }
    props.onSave(result.value);
  };

  return (
    <div className="rl-dates__box">
      <h2 className="rl-dates__title" id={props.titleId}>
        {t.title(props.target.name)}
      </h2>
      <p className="rl-dates__desc">{t.description}</p>
      <label className="rl-dates__label" htmlFor={hiredId}>
        {t.hiredOn}
      </label>
      <input
        ref={hiredInput}
        id={hiredId}
        className="rl-dates__input"
        type="date"
        value={hiredOn}
        onChange={(event) => setHiredOn(event.target.value)}
      />
      <label className="rl-dates__label rl-dates__label--left" htmlFor={leftId}>
        {t.leftOn}
      </label>
      <input
        ref={leftInput}
        id={leftId}
        className="rl-dates__input"
        type="date"
        value={leftOn}
        onChange={(event) => setLeftOn(event.target.value)}
      />
      <div className="rl-dates__actions">
        <button
          type="button"
          className="rl-dates__btn rl-dates__btn--cancel"
          onClick={props.onClose}
        >
          {t.cancel}
        </button>
        <button type="button" className="rl-dates__btn rl-dates__btn--save" onClick={save}>
          {t.save}
        </button>
      </div>
    </div>
  );
}
