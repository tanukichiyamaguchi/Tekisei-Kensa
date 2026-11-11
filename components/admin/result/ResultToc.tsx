"use client";
// 目次 #rsn-wrap > nav#rsn（11-4 §2.5。参照元定義の rs-nav）。リンクは描いている行き先だけを置く（AI 解説の領域（あるとき）と 7 つの
// セクション。非表示の PDF はリスクと AI 解説の領域を描かないので、そのリンクも置かない）。「目次」の文字は .links の中の先頭に置く
// （.links の間 2px と .l の右 6px からの推定）。
// 画面の形: スクロールする領域 .rd-scroll（自分の要素から closest で見つける。Server の枠から ref を受けられないため）の上端（内側の余白
// 4px の下）に position: sticky で留まる。受験情報の 1 行の下端が上端から 2px より上に出たら固定の状態（.stuck。氏名の欄と「↑ 先頭へ」を
// 出し、「目次」を隠す）。今見ているセクションは、スクロール・画面の大きさの変化・たたみ方の変化のたびに、目次の下端 + 24px より上に先頭が
// ある最後の行き先（無ければ強調しない）で、aria-current="true" を付ける。リンクは既定の動きを止め（URL のハッシュを変えない）、行き先が
// たたまれていれば開いてから、先頭が目次の下 16px に来るようになめらかに移る（行き先の scroll-margin-top = 目次の高さ + 16px。領域の
// scroll-padding-top 4px で余白の分を合わせる）。scroll-margin-top は目次の高さが変わるたびにすべての行き先へ付けておく（AI 解説の領域が
// 自分で scrollIntoView するときも目次の下に出る）。別の人の結果に移ったら（ResultDetailBody ごと key で作り直す）、領域を先頭に戻す（§2.1）。
// キーボードで焦点を移した部品が、留まった目次の下に入ったときは、部品と焦点の枠の外側 4px が目次の下端より下に出るまで領域を戻す
// （ブラウザは目次を知らず、目次の下の部品を見えているとみなしてスクロールしないため。目次の中の部品とポップアップの中の部品は除く。
// 1.1 版。11-2 §2.8 の見出しの行と同じ問題）。留まった部品（育て方の左のカード。position: sticky）が領域より高いときは、その下のほうの
// 部品にキーボードで焦点を移しても、ブラウザが領域を動かす分ではカードが動かず、部品と焦点の枠が下の縁で切れたままになるので、留まりが
// 外れる所までさらに動かして、焦点の枠の外側 4px まで下の縁の内側に出す（1.2 版。11-4 §2.13）。キーボードの焦点のある第二候補のボタンで
// 第二候補を出し入れしたときも、右のカードの高さが変わって留まる左のカードごとボタンが動き、下の縁の外や上の縁の外に出ることがある
// （ブラウザは焦点のある部品が動いても領域を動かさない）ので、描いた後の次のフレームで、同じ形（下の縁の外なら留まりが外れる所まで、
// 目次の下か上の縁の外なら目次の下端から 4px まで）で見える位置に戻す（1.2 版。11-4 §2.13・§2.13.4）。「↑ 先頭へ」を押したら、見出し（h1。
// tabIndex -1。輪郭は出さない）に焦点を移す（先頭に戻ると「↑ 先頭へ」が隠れ、焦点が失われるため。1.1 版）。
// 印刷の形: 固定しない表示（「目次」あり、氏名の欄と「↑ 先頭へ」なし）で、監視と押したときの処理を付けず、強調は先頭での規則
// （AI 解説の領域があれば「AI解説」、無ければ「概要」。11-5 §2.5.3）。色・焦点の枠（リンクは内側 −3px、「↑ 先頭へ」は 2px 外）・
// 固定したときの上の白い影は CSS（別表D の 4）
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";

import {
  useResultViewActions,
  useResultViewState,
  type ResultDetailVariant,
} from "./ResultViewStateContext";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";
import { RESULT_SECTION_IDS, type ResultSectionId } from "@/lib/presentation/result-view-state";

/** 目次のリンクの行き先（AI 解説の領域 ai とセクションの id） */
export interface ResultTocTarget {
  readonly id: "ai" | ResultSectionId;
  readonly label: string;
}

/** 固定の状態にする、受験情報の 1 行の下端と領域の上端の差（px。§2.5） */
const STICK_OFFSET = 2;
/** 今見ているセクションを決める、目次の下端からの距離（px。§2.5） */
const CURRENT_OFFSET = 24;
/** リンクで移ったときの、目次の下端から行き先の先頭までの距離（px。§2.5） */
const TARGET_GAP = 16;
/** 焦点の枠が部品の縁から外へ出る幅（px。線 2px と離す 2px。§2.2） */
const FOCUS_RING_SPACE = 4;

const isSectionId = (id: string): id is ResultSectionId =>
  (RESULT_SECTION_IDS as readonly string[]).includes(id);

/** el の祖先のうち、scroller より内側で position: sticky の要素（育て方の左のカード。目次の中の部品は呼ぶ側が除く） */
function stickyAncestorOf(el: HTMLElement, scroller: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node && node !== scroller; node = node.parentElement) {
    if (getComputedStyle(node).position === "sticky") return node;
  }
  return null;
}

/** 留まっている sticky の要素が、領域を動かすと留まりが外れて流れ始めるまでの距離（親の中身の下端と、要素の下端の差。px） */
function stickyReleaseDistance(sticky: HTMLElement): number {
  const parent = sticky.parentElement;
  if (!parent) return 0;
  const style = getComputedStyle(parent);
  const contentBottom =
    parent.getBoundingClientRect().bottom -
    (Number.parseFloat(style.paddingBottom) || 0) -
    (Number.parseFloat(style.borderBottomWidth) || 0);
  return Math.max(0, contentBottom - sticky.getBoundingClientRect().bottom);
}

export function ResultToc(props: {
  readonly name: string;
  readonly examDate: string;
  readonly targets: readonly ResultTocTarget[];
  readonly variant: ResultDetailVariant;
}) {
  const t = RESULT_DETAIL_TEXTS.toc;
  const screen = props.variant === "screen";
  const viewState = useResultViewState();
  const actions = useResultViewActions();
  const navRef = useRef<HTMLElement>(null);
  const targetsRef = useRef(props.targets);
  targetsRef.current = props.targets;
  const scheduleRef = useRef<() => void>(() => undefined);
  const revealMovedRef = useRef<() => void>(() => undefined);
  const [stuck, setStuck] = useState(false);
  // 初めは先頭での規則（AI 解説の領域があれば ai、無ければ概要）。画面の形は描いた直後に位置から決め直す
  const [current, setCurrent] = useState<string | null>(props.targets[0]?.id ?? null);
  const targetsKey = props.targets.map((target) => target.id).join(",");

  // 固定の状態と今見ているセクション（スクロール・画面の大きさの変化。描いた直後に領域を先頭に戻す）
  useEffect(() => {
    if (!screen) return;
    const nav = navRef.current;
    const scroller = nav?.closest<HTMLElement>(".rd-scroll");
    if (!nav || !scroller) return;
    scroller.scrollTop = 0;
    let frame = 0;
    const update = () => {
      frame = 0;
      const paddingTop = Number.parseFloat(getComputedStyle(scroller).paddingTop) || 0;
      const top = scroller.getBoundingClientRect().top + paddingTop;
      const meta = document.getElementById("rsm");
      setStuck(meta ? meta.getBoundingClientRect().bottom < top - STICK_OFFSET : false);
      const line = nav.getBoundingClientRect().bottom + CURRENT_OFFSET;
      let found: string | null = null;
      for (const target of targetsRef.current) {
        const el = document.getElementById(target.id);
        if (!el || el.getClientRects().length === 0) continue;
        if (el.getBoundingClientRect().top < line) found = target.id;
      }
      setCurrent(found);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    scheduleRef.current = schedule;
    update();
    // キーボードの焦点のある部品（目次の中とポップアップの中の部品を除く）と焦点の枠の外側 4px を、見える範囲に出す。
    // 焦点が移った直後（moved が偽。ブラウザが焦点のために領域を動かしたあとで測る）: 留まった目次の下に入ったら、目次の下端より下に出す。
    // 目次が留まっていないとき・部品が目次の上（領域の外）にあるときは動かさない（「↑ 先頭へ」のあとの見出しなど、なめらかに戻る途中の
    // 部品を止めない）。留まった部品の中の部品が、ブラウザが動かしたあとも下の縁で切れているときは、留まりが外れる所まで動かしてから、
    // 焦点の枠の外側まで下の縁の内側に出す（留まっていない部品は、ブラウザが scroll-padding-bottom で縁の内側に出す。§2.2）。
    // 描き直しで焦点のある部品が動いたあと（moved が真。第二候補の開閉。ブラウザは領域を動かさない）: 下の縁の外なら同じく下の縁の内側に
    // （留まった部品の中なら留まりが外れる所まで）、目次の下か上の縁の外なら目次の下端（目次が留まっていなければ領域の上の縁）から 4px の
    // 位置まで動かす（§2.13）
    const wrap = nav.parentElement;
    const isRevealTarget = (el: EventTarget | null): el is HTMLElement =>
      el instanceof HTMLElement &&
      scroller.contains(el) &&
      el.matches(":focus-visible") &&
      !wrap?.contains(el) &&
      el.closest("dialog") === null;
    // 動かす量は 1px 単位に切り上げる（領域の位置が整数に丸められても、焦点の枠が縁や目次にかからないように）
    const reveal = (el: HTMLElement, moved: boolean) => {
      const scrollerBox = scroller.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const overflow = box.bottom + FOCUS_RING_SPACE - scrollerBox.bottom;
      if (overflow > 0.5) {
        const sticky = stickyAncestorOf(el, scroller);
        if (sticky !== null || moved) {
          const release = sticky === null ? 0 : stickyReleaseDistance(sticky);
          scroller.scrollTop += Math.ceil(release + overflow);
          return;
        }
      }
      const paddingTop = Number.parseFloat(getComputedStyle(scroller).paddingTop) || 0;
      const navBox = nav.getBoundingClientRect();
      const navStuck = navBox.top <= scrollerBox.top + paddingTop + 0.5;
      if (moved) {
        const limit = (navStuck ? navBox.bottom : scrollerBox.top) + FOCUS_RING_SPACE;
        if (box.top < limit) scroller.scrollTop -= Math.ceil(limit - box.top);
        return;
      }
      if (!navStuck) return;
      const limit = navBox.bottom + FOCUS_RING_SPACE;
      if (box.bottom > navBox.top && box.top < limit) {
        scroller.scrollTop -= Math.ceil(limit - box.top);
      }
    };
    let focusFrame = 0;
    const scheduleReveal = (el: HTMLElement, moved: boolean) => {
      if (focusFrame !== 0) cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => {
        focusFrame = 0;
        if (document.activeElement === el) reveal(el, moved);
      });
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isRevealTarget(event.target)) scheduleReveal(event.target, false);
    };
    revealMovedRef.current = () => {
      const el = document.activeElement;
      if (isRevealTarget(el)) scheduleReveal(el, true);
    };
    scroller.addEventListener("scroll", schedule, { passive: true });
    scroller.addEventListener("focusin", onFocusIn);
    window.addEventListener("resize", schedule);
    return () => {
      scheduleRef.current = () => undefined;
      revealMovedRef.current = () => undefined;
      if (frame !== 0) cancelAnimationFrame(frame);
      if (focusFrame !== 0) cancelAnimationFrame(focusFrame);
      scroller.removeEventListener("scroll", schedule);
      scroller.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("resize", schedule);
    };
  }, [screen]);

  // たたみ方と行き先が変わったら決め直す
  useEffect(() => {
    scheduleRef.current();
  }, [viewState.folded, targetsKey]);

  // 第二候補を出し入れしたら、キーボードの焦点のある部品（第二候補のボタン）を見える位置に戻す（描いた後の次のフレーム。§2.13）
  useEffect(() => {
    revealMovedRef.current();
  }, [viewState.secondOpen]);

  // 行き先の scroll-margin-top（目次の高さ + 16px）を、目次の高さが変わるたびにすべての行き先へ付けておく
  useEffect(() => {
    if (!screen) return;
    const nav = navRef.current;
    if (!nav) return;
    const apply = () => {
      const margin = `${nav.offsetHeight + TARGET_GAP}px`;
      for (const target of targetsRef.current) {
        const el = document.getElementById(target.id);
        if (el) el.style.scrollMarginTop = margin;
      }
      scheduleRef.current();
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [screen, targetsKey]);

  const go = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    if (isSectionId(id) && viewState.folded.includes(id)) {
      flushSync(() => actions.openSection(id));
    }
    const el = document.getElementById(id);
    const nav = navRef.current;
    if (!el) return;
    if (nav) el.style.scrollMarginTop = `${nav.offsetHeight + TARGET_GAP}px`;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toTop = () => {
    navRef.current?.closest(".rd-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    // 先頭に戻ると固定の状態が外れて「↑ 先頭へ」が隠れるので、焦点を見出しに移しておく（見出しは ResultHead の h1）
    document.querySelector<HTMLElement>("#rd-head h1")?.focus({ preventScroll: true });
  };

  return (
    <div id="rsn-wrap" data-print={screen ? undefined : ""}>
      <nav
        id="rsn"
        ref={navRef}
        className={screen && stuck ? "stuck" : undefined}
        aria-label={t.label}
      >
        {screen ? (
          <div className="who" aria-hidden="true">
            {props.name !== "" ? <b>{t.name(props.name)}</b> : null}
            <span>{t.examDate(props.examDate)}</span>
          </div>
        ) : null}
        <div className="links">
          <span className="l">{t.heading}</span>
          {props.targets.map((target) => {
            const on = current === target.id;
            return (
              <a
                key={target.id}
                href={`#${target.id}`}
                className={on ? "on" : undefined}
                aria-current={on ? "true" : undefined}
                onClick={screen ? (event) => go(event, target.id) : undefined}
              >
                {target.label}
              </a>
            );
          })}
        </div>
        {screen ? (
          <button type="button" className="top" aria-label={t.topLabel} onClick={toTop}>
            {t.top}
          </button>
        ) : null}
      </nav>
    </div>
  );
}
