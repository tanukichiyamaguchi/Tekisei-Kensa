"use client";
// 在籍・退職の「変更」ダイアログ（11-3 §2.15・§2.22）。自分の dialog 要素（.ob-edit）を showModal で開く（Dialog は見出しの行に閉じる
// アイコンを描くので使わない。回答一覧の EmploymentDatesDialog と同じ作り）。根の .ob-root の外（後ろ）に描き、中の部品の焦点は
// 管理画面に共通の焦点の枠と同じ指定（.ob-edit :focus-visible）。dialog の内側の余白は 0 で、カードが要素いっぱいを占める。
// 区分（在籍・退職・求職者）・入社日・退職日（区分が退職のときだけ出し、隠しても入力した値は残す）を入れて「保存する」と、
// employmentFromEditDialog（lib/presentation/employment.ts）で値を決め、日付が範囲の外か実在しない日なら「日付が正しくありません。」
// （7 章の 1 の案）、退職日が入社日より前なら「退職日が入社日より前になっています。」をエラーの欄に出して閉じない（押すたびに判定し直す）。
// 日付の欄に途中までの入力や実在しない日があると、ブラウザは値を空にして validity.badInput を立てるので、空の欄と区別して
// 「日付が正しくありません。」にする（入社日を null、退職日を今日にして保存しない。§2.15 の 3）。
// 保存できる値なら、dialog を閉じてから onSave を呼ぶ（親が出す通知を開いているモーダルの中に出さないため。Toast）。
// 閉じ方は「やめる」・カードの外（押した先が dialog 自身）・Esc で、どれも保存しない。焦点は、開いたら選択中の区分のボタン、閉じたら押した
// 「変更」。区分の変更でその人がほかのタブに移り「変更」が一覧から消えたときは、親が渡す代わりの要素（今のタブのボタン）に移す
// （11 総論 8.5）。入力とエラーは開くたびに変わる key で作り直す
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { EMPLOYMENT_SCREEN_TEXTS } from "@/lib/presentation/classification-texts";
import {
  employmentFromEditDialog,
  todayInTokyo,
  type Employment,
  type EmploymentStatus,
} from "@/lib/presentation/employment";

/** 日付の入力欄の範囲（11-2 §3.1 の isValidCalendarDate と同じ） */
const DATE_MIN = "1900-01-01";
const DATE_MAX = "2100-12-31";

export interface EmploymentEditTarget {
  /** 氏名（空なら見出しは「さん」） */
  readonly name: string;
  /** 今の区分・入社日・退職日（初期値） */
  readonly employment: Employment;
}

export function EmploymentEditDialog(props: {
  /** 開いている人（閉じているときは null） */
  readonly target: EmploymentEditTarget | null;
  /** 開くたびに変わる値（入力とエラーを今の値で作り直す） */
  readonly openKey: number;
  /** 開いた要素（押した「変更」。閉じたら焦点を戻す） */
  readonly opener: HTMLElement | null;
  /** 開いた要素が一覧から消えていたときに焦点を移す要素（今のタブのボタン） */
  readonly fallbackFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onSave: (value: Employment) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const open = props.target !== null;
  const { opener, fallbackFocusRef } = props;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        returnFocus.current = opener;
        dialog.showModal();
      }
      dialog.querySelector<HTMLElement>(".pgd-seg button[aria-pressed='true']")?.focus();
      return;
    }
    // 保存のときは onSave の前に閉じている（下の save）
    if (dialog.open) dialog.close();
    const back = returnFocus.current;
    returnFocus.current = null;
    if (back === null) return;
    if (back.isConnected) back.focus();
    else fallbackFocusRef.current?.focus();
    // opener は開いたときの値だけを使う
  }, [open]);

  const save = (value: Employment) => {
    ref.current?.close();
    props.onSave(value);
  };

  return (
    <dialog
      ref={ref}
      className="ob-edit"
      data-testid="em-edit"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc。閉じる判断は親に任せる
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => {
        // カードの外（dialog 要素自身。中の .pgd-card が要素いっぱいを占める）
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      {props.target === null ? null : (
        <EditForm
          key={props.openKey}
          titleId={titleId}
          target={props.target}
          onClose={props.onClose}
          onSave={save}
        />
      )}
    </dialog>
  );
}

function EditForm(props: {
  readonly titleId: string;
  readonly target: EmploymentEditTarget;
  readonly onClose: () => void;
  readonly onSave: (value: Employment) => void;
}) {
  const t = EMPLOYMENT_SCREEN_TEXTS.edit;
  const [status, setStatus] = useState<EmploymentStatus>(props.target.employment.status);
  const [hiredOn, setHiredOn] = useState(props.target.employment.hiredOn ?? "");
  const [leftOn, setLeftOn] = useState(props.target.employment.leftOn ?? "");
  const [error, setError] = useState("");
  const hiredInput = useRef<HTMLInputElement>(null);
  const leftInput = useRef<HTMLInputElement>(null);

  const save = () => {
    // 途中までの入力・実在しない日（値は空で validity.badInput）。退職日の欄は出しているときだけ見る。前後の判定より先（§2.15 の 3）
    if (hiredInput.current?.validity.badInput || leftInput.current?.validity.badInput) {
      setError(t.invalidDate);
      return;
    }
    // 退職日の既定（空のとき）は保存する時点の Asia/Tokyo の日付（§2.15 の 2）
    const result = employmentFromEditDialog({
      status,
      hiredOn,
      leftOn,
      todayIso: todayInTokyo(new Date()),
    });
    if (!result.ok) {
      setError(result.reason === "invalid_date" ? t.invalidDate : t.leftBeforeHired);
      return;
    }
    props.onSave(result.value);
  };

  return (
    <div className="pgd-card">
      <div className="pgd-h" id={props.titleId}>
        {t.title(props.target.name)}
      </div>
      <div className="pgd-s">{t.description}</div>
      <div className="pgd-seg">
        {t.statuses.map((option) => (
          <button
            key={option.status}
            type="button"
            className={option.status === status ? "on" : undefined}
            aria-pressed={option.status === status}
            onClick={() => setStatus(option.status)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label>
        {t.hiredOn}
        <input
          ref={hiredInput}
          type="date"
          min={DATE_MIN}
          max={DATE_MAX}
          value={hiredOn}
          onChange={(event) => setHiredOn(event.target.value)}
        />
      </label>
      {status === "left" ? (
        <label>
          {t.leftOn}
          <input
            ref={leftInput}
            type="date"
            min={DATE_MIN}
            max={DATE_MAX}
            value={leftOn}
            onChange={(event) => setLeftOn(event.target.value)}
          />
        </label>
      ) : null}
      <div className="pgd-b">
        <button type="button" onClick={props.onClose}>
          {t.cancel}
        </button>
        <button type="button" className="ok" onClick={save}>
          {t.save}
        </button>
      </div>
      <div className="pgd-e" role="alert">
        {error}
      </div>
    </div>
  );
}
