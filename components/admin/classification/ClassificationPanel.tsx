"use client";
// 組織内分類の詳細パネル（11-3 §2.12）。画面に 1 つの dialog（showModal で開くモーダル）を、根の .ob-root の外（後ろ）に描き、
// 中身を分類のパネルとキャラクターのパネルで描き分ける。背景は暗くしない。開いたら本文を先頭まで戻して「×」に焦点を移す（分類から
// キャラクターに切り替えたときも同じ）。「×」・Esc・パネルの外（押した先が dialog 自身）で閉じ、閉じたら最初に開いた要素（凡例・見出し・枠。
// 切り替えの後も最初の要素）に焦点を戻す。開いている間はデータを読み直さない。回答者の一覧は今の絞り込み（チーム・対象）の後の人で、
// 氏名は結果詳細へのリンクにせず、除外中の札を出さない（除外した受験は人に入らない。§2.2）。
// 分類ごとの色は CSS 変数で style 属性に置く（上部の --qc・--qbg、本文の --qd・--qn）。位置の箱の印は style の color（K-49）。
// キャラクターのパネルの本文は中に焦点を受ける部品が無いので、はみ出して動くときだけ本文が焦点を受ける（tabIndex 0・role="region"・
// 見出しの読み上げ名。はみ出しは ResizeObserver で見る。axe の scrollable-region-focusable。焦点の枠は本文の内側に縁から 1px
// あけて描く（app/(admin)/admin.css）。11 総論 8.5）
import { useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from "react";

import { Illustration } from "@/components/ui/Illustration";
import {
  CLASSIFICATION_EMPTY_MESSAGE,
  CLASSIFICATION_TEXTS,
  TYPE_TEXTS,
} from "@/lib/masters/texts";
import { CLASSIFICATION_SCREEN_TEXTS } from "@/lib/presentation/classification-texts";
import {
  aptitudeHeadingPlain,
  CHARACTER_CELLS,
  miniMapColors,
  panelMemberCells,
  panelMembers,
  percentOf,
  QUADRANTS,
  type CharacterCell,
  type ClassificationMode,
  type ClassificationSummary as SummaryValues,
  type TeamFilter,
} from "@/lib/presentation/classification-view";
import type { AptitudeTypeKey, SocialStyleKey } from "@/lib/scoring/types";
import type { ClassificationPersonDto } from "@/lib/services/dto/admin";

/** CSS 変数を置く style 属性 */
type StyleWithVars = CSSProperties & Readonly<Record<`--${string}`, string>>;

/** パネルの中身（分類か、キャラクター） */
export type ClassificationPanelTarget =
  | { readonly kind: "quadrant"; readonly quadrant: SocialStyleKey }
  | { readonly kind: "type"; readonly type: AptitudeTypeKey };

function cellOf(type: AptitudeTypeKey): CharacterCell {
  const cell = CHARACTER_CELLS.find((c) => c.type === type);
  if (cell === undefined) throw new RangeError(`キャラクターの枠がありません: ${type}`);
  return cell;
}

export function ClassificationPanel(props: {
  /** 開いている中身（閉じているときは null） */
  readonly target: ClassificationPanelTarget | null;
  /** 最初に開いた要素（閉じたら焦点を戻す） */
  readonly opener: HTMLElement | null;
  readonly people: readonly ClassificationPersonDto[];
  /** 正規化したチーム */
  readonly team: TeamFilter;
  readonly mode: ClassificationMode;
  readonly summary: SummaryValues;
  /** 分類のパネルの 4 タイプのボタン（キャラクターのパネルに切り替える） */
  readonly onSelectType: (type: AptitudeTypeKey) => void;
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const { target } = props;

  // 開く・中身を切り替える: 本文を先頭まで戻し、「×」に焦点を移す。閉じる: 最初に開いた要素に焦点を戻す
  const targetKey =
    target === null
      ? null
      : target.kind === "quadrant"
        ? `q:${target.quadrant}`
        : `t:${target.type}`;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (targetKey !== null) {
      if (!dialog.open) {
        returnFocus.current = props.opener;
        dialog.showModal();
      }
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
      closeRef.current?.focus();
    } else if (dialog.open) {
      dialog.close();
      returnFocus.current?.focus();
      returnFocus.current = null;
    }
    // opener は開いたときの値だけを使う（中身を切り替えても、焦点を戻す先は最初に開いた要素のまま）
  }, [targetKey]);

  const bodyProps: PanelBodyProps = {
    people: props.people,
    team: props.team,
    mode: props.mode,
    summary: props.summary,
    onSelectType: props.onSelectType,
    onClose: props.onClose,
    titleId,
    bodyRef,
    closeRef,
  };

  return (
    <dialog
      ref={ref}
      className="ob-panel"
      data-testid="ob-panel"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Esc。閉じる判断は親に任せる
        event.preventDefault();
        props.onClose();
      }}
      onClick={(event) => {
        // パネルの外（dialog 要素自身。中の .in がパネルいっぱいを占める）
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      {target === null ? null : (
        <div className="in">
          {target.kind === "quadrant" ? (
            <QuadrantPanel {...bodyProps} quadrant={target.quadrant} />
          ) : (
            <TypePanel {...bodyProps} type={target.type} />
          )}
        </div>
      )}
    </dialog>
  );
}

interface PanelBodyProps {
  readonly people: readonly ClassificationPersonDto[];
  readonly team: TeamFilter;
  readonly mode: ClassificationMode;
  readonly summary: SummaryValues;
  readonly onSelectType: (type: AptitudeTypeKey) => void;
  readonly onClose: () => void;
  readonly titleId: string;
  readonly bodyRef: RefObject<HTMLDivElement | null>;
  readonly closeRef: RefObject<HTMLButtonElement | null>;
}

function CloseButton(props: {
  readonly closeRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
}) {
  const t = CLASSIFICATION_SCREEN_TEXTS.panel;
  return (
    <button
      ref={props.closeRef}
      type="button"
      className="x"
      aria-label={t.closeLabel}
      onClick={props.onClose}
    >
      {t.close}
    </button>
  );
}

function headStyle(quadrant: SocialStyleKey): StyleWithVars {
  const colors = QUADRANTS[quadrant].colors;
  return { "--qc": colors.label, "--qbg": colors.bg };
}

function bodyStyle(quadrant: SocialStyleKey): StyleWithVars {
  const colors = QUADRANTS[quadrant].colors;
  return { "--qd": colors.text, "--qn": colors.typeCount };
}

/** 分類のパネル（§2.12） */
function QuadrantPanel(props: PanelBodyProps & { readonly quadrant: SocialStyleKey }) {
  const t = CLASSIFICATION_SCREEN_TEXTS;
  const q = QUADRANTS[props.quadrant];
  const n = props.summary.byQuadrant[props.quadrant];
  const total = props.summary.total;
  const members = panelMembers(props.people, props.team, props.mode, {
    quadrant: props.quadrant,
  });
  return (
    <>
      <div className="hd" style={headStyle(props.quadrant)}>
        <div className="tx">
          <span className="q">{q.labelJa}</span>
          <h2 id={props.titleId}>{q.katakana}</h2>
          <div className="sub">
            {total === 0 ? t.panel.shareEmpty : t.panel.share(n, percentOf(n, total))}
          </div>
        </div>
        <CloseButton closeRef={props.closeRef} onClose={props.onClose} />
      </div>
      <div className="bd" ref={props.bodyRef} style={bodyStyle(props.quadrant)}>
        <p className="tx2 pre-line">{CLASSIFICATION_TEXTS[props.quadrant].description}</p>
        <h3>{t.panel.types}</h3>
        <div className="types">
          {CHARACTER_CELLS.filter((cell) => cell.quadrant === props.quadrant).map((cell) => (
            <button key={cell.type} type="button" onClick={() => props.onSelectType(cell.type)}>
              <Illustration
                src={`/images/types/${cell.type}.svg`}
                alt=""
                width={30}
                height={52}
                decorative
              />
              <span>
                <b>{t.panel.typeName(cell.hiragana, cell.shortLabel)}</b>
                <span>{cell.lean.label}</span>
              </span>
              <em>{props.summary.byType[cell.type]}</em>
            </button>
          ))}
        </div>
        <h3>
          {t.panel.members}
          <small>{t.summary.count(members.length)}</small>
        </h3>
        <MemberTable members={members} />
      </div>
    </>
  );
}

/** 入れ物がはみ出して動くか（縦か横）。key が変わったとき（中身の作り直し）と、入れ物・中の要素の大きさが変わったときに見直す */
function useOverflowing(ref: RefObject<HTMLElement | null>, key: string): boolean {
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const box = ref.current;
    if (!box) {
      setOverflowing(false);
      return;
    }
    const check = () =>
      setOverflowing(box.scrollHeight > box.clientHeight || box.scrollWidth > box.clientWidth);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(box);
    for (const child of Array.from(box.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [ref, key]);
  return overflowing;
}

/** キャラクターのパネル（§2.12） */
function TypePanel(props: PanelBodyProps & { readonly type: AptitudeTypeKey }) {
  const t = CLASSIFICATION_SCREEN_TEXTS;
  const cell = cellOf(props.type);
  const q = QUADRANTS[cell.quadrant];
  const texts = TYPE_TEXTS[props.type];
  const members = panelMembers(props.people, props.team, props.mode, { type: props.type });
  const scrollable = useOverflowing(props.bodyRef, `${props.type}:${members.length}`);
  return (
    <>
      <div className="hd" style={headStyle(cell.quadrant)}>
        <Illustration
          src={`/images/types/${props.type}.svg`}
          alt=""
          width={84}
          height={148}
          decorative
        />
        <div className="tx">
          <span className="q">{t.panel.quadrantTag(q.katakana, q.labelJa)}</span>
          <h2 id={props.titleId}>{cell.hiragana}</h2>
          <div className="sub">{t.panel.typeLabel(cell.shortLabel)}</div>
        </div>
        <CloseButton closeRef={props.closeRef} onClose={props.onClose} />
      </div>
      <div
        className="bd"
        ref={props.bodyRef}
        style={bodyStyle(cell.quadrant)}
        {...(scrollable ? { tabIndex: 0, role: "region", "aria-labelledby": props.titleId } : {})}
      >
        <div className="pos">
          <div className="mini" aria-hidden="true">
            {miniMapColors(props.type).map((color, index) => (
              <i key={index} style={{ background: color }} />
            ))}
          </div>
          <div>
            <b style={{ color: cell.lean.posColor }}>{cell.lean.label}</b>
            <p>{cell.positionDescription}</p>
          </div>
        </div>
        <h3>{t.panel.characteristics}</h3>
        <p className="tx2">{texts.characteristics}</p>
        <h3>{t.panel.aptitude}</h3>
        <p className="fit">{aptitudeHeadingPlain(props.type)}</p>
        <p className="tx2">{texts.suitableJobs}</p>
        <h3>
          {t.panel.members}
          <small>{t.summary.count(members.length)}</small>
        </h3>
        <MemberTable members={members} />
      </div>
    </>
  );
}

/** 回答者の一覧（§2.12）。0 人なら点線の枠の文言。受験日と電話番号は折り返さない（CSS） */
function MemberTable(props: { readonly members: readonly ClassificationPersonDto[] }) {
  const t = CLASSIFICATION_SCREEN_TEXTS.members;
  if (props.members.length === 0) return <p className="empty">{CLASSIFICATION_EMPTY_MESSAGE}</p>;
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">{t.name}</th>
          <th scope="col">{t.occupation}</th>
          <th scope="col">{t.team}</th>
          <th scope="col">{t.submittedAt}</th>
          <th scope="col" className="tl">
            {t.phoneNumber}
          </th>
        </tr>
      </thead>
      <tbody>
        {props.members.map((member) => {
          const cells = panelMemberCells(member);
          return (
            <tr key={member.resultId}>
              <td className="nm">{cells.name}</td>
              <td>{cells.occupation}</td>
              <td>{cells.team}</td>
              <td className="dt">{cells.submittedAt}</td>
              <td className="tl">{cells.phoneNumber}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
