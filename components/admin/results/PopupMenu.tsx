"use client";
// 回答一覧のメニュー（⋮メニュー・区分メニュー・リンクのメニュー。11-2 §2.12・§2.13・§2.17、K-43）。画面に 1 つだけ、document.body の
// 直下に描く（開いている状態は ResultsView が持つ）。根の .rl-menu で一覧の色の変数・書体・文字の大きさ・行間と一覧の輪郭を当てる。
// 位置は描いたあと画面に出す前（useLayoutEffect）に大きさを測って決める（⋮とリンクのメニューは popupMenuPosition、区分メニューは
// employmentMenuPosition。測るまでは見えなくする）。読み上げの形: role="menu" の読み上げ名は開いたボタン（aria-labelledby）、
// 見出しのある区切りは role="group"（見出しを aria-labelledby で参照し、見出しの要素は aria-hidden）、区切り線は role="separator"。
// 開いたら最初の項目に焦点、↓・↑で項目を順に移る（端で回る）。閉じ方は Esc・項目を選ぶ・スクロール・画面の大きさの変化・外を押す。
// 閉じたら開いたボタンに焦点を戻す（項目を選んだときは、先に閉じて焦点を戻してから操作を行う）
import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { employmentMenuPosition, popupMenuPosition } from "@/lib/presentation/result-list-view";

export interface PopupMenuItem {
  readonly key: string;
  readonly label: string;
  /** 右端の小さい文字（受験日・「現在の区分」など） */
  readonly note?: string | null;
  readonly icon?: ReactNode;
  /** 「この受験を削除」の色 */
  readonly danger?: boolean;
  readonly onSelect: () => void;
}

export interface PopupMenuSection {
  readonly key: string;
  /** 見出し（無ければ項目だけを並べる） */
  readonly heading: string | null;
  readonly items: readonly PopupMenuItem[];
}

/** メニューの外を押して閉じたとき、閉じるだけで終わる（続く click を止める）ボタンの目印: ⋮・オーナーの「回答リンクをコピー」 */
const MENU_TOGGLE_SELECTOR = "[data-rl-menu-toggle]";
/** 操作を持つ部品。これ以外（行の地など）を押したときも、閉じるだけで終わる（結果を開かない） */
const OPERABLE_SELECTOR =
  "a[href], button, input, select, textarea, label, [role='button'], [role='tab'], [role='switch']";

/** 続く click を 1 回だけ止める（window の捕捉で受けて、React に届かせない）。click にならなかったときは次の操作でやめる */
function suppressNextClick(): void {
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    finish();
  };
  const finish = () => {
    window.removeEventListener("click", stop, true);
    window.removeEventListener("pointerdown", finish, true);
    window.removeEventListener("keydown", finish, true);
  };
  window.addEventListener("click", stop, true);
  window.addEventListener("pointerdown", finish, true);
  window.addEventListener("keydown", finish, true);
}

export function PopupMenu(props: {
  /** 開いたボタン（⋮・区分チップ・回答リンクをコピー）。位置と読み上げ名と、閉じたあとの焦点の戻り先 */
  readonly anchor: HTMLElement;
  /** popup = ⋮・リンクのメニュー、employment = 区分メニュー（K-43） */
  readonly placement: "popup" | "employment";
  readonly sections: readonly PopupMenuSection[];
  readonly onClose: () => void;
}) {
  const { anchor, placement, onClose } = props;
  const ref = useRef<HTMLDivElement>(null);
  const closed = useRef(false);
  const focused = useRef(false);
  const idBase = useId();
  const [position, setPosition] = useState<{ readonly left: number; readonly top: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const rect = anchor.getBoundingClientRect();
    const size = menu.getBoundingClientRect();
    // 画面の幅・高さはスクロールバーを除いた表示の領域（position: fixed の基準と同じ）
    const viewport = document.documentElement;
    setPosition(
      placement === "employment"
        ? employmentMenuPosition(rect, size.height, viewport.clientHeight)
        : popupMenuPosition(
            rect,
            size.width,
            size.height,
            viewport.clientWidth,
            viewport.clientHeight,
          ),
    );
  }, [anchor, placement]);

  useLayoutEffect(() => {
    // 位置が決まって見えるようになってから、最初の項目に焦点を移す
    if (position === null || focused.current) return;
    focused.current = true;
    ref.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus({ preventScroll: true });
  }, [position]);

  useEffect(() => {
    const close = () => {
      if (closed.current) return;
      closed.current = true;
      anchor.focus({ preventScroll: true });
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || ref.current?.contains(target)) return;
      // まず閉じる。⋮・オーナーの「回答リンクをコピー」・操作を持たない場所なら、閉じるだけで終わる（続く click を止める）。
      // ほかの部品（区分チップ・結果を見る・タブ・選択欄・スイッチ・入力欄・リンク）はそのまま続ける（押した部品への焦点の移動も止めない）
      close();
      if (
        target.closest(MENU_TOGGLE_SELECTOR) !== null ||
        target.closest(OPERABLE_SELECTOR) === null
      ) {
        suppressNextClick();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    // スクロールはどの要素のものでも閉じる（スクロールのイベントは泡立たないので捕捉で受ける）。画面の大きさが変わっても閉じる。
    // 開く前のスクロール（押したボタンを画面に入れる動きなど）のイベントは次の描画で届くので、それより後に受け始める
    const frame = window.requestAnimationFrame(() => {
      window.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor, onClose]);

  const select = (item: PopupMenuItem) => {
    if (closed.current) return;
    closed.current = true;
    anchor.focus({ preventScroll: true });
    onClose();
    item.onSelect();
  };

  const moveFocus = (step: 1 | -1) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      index < 0
        ? step === 1
          ? 0
          : items.length - 1
        : (index + step + items.length) % items.length;
    items[next]?.focus({ preventScroll: true });
  };

  return createPortal(
    <div
      ref={ref}
      className="rl-menu"
      role="menu"
      aria-labelledby={anchor.id === "" ? undefined : anchor.id}
      style={
        position === null
          ? { left: 0, top: 0, visibility: "hidden" }
          : { left: position.left, top: position.top }
      }
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveFocus(event.key === "ArrowDown" ? 1 : -1);
        }
      }}
    >
      {props.sections.map((section, index) => {
        const headingId = `${idBase}-${section.key}`;
        const items = section.items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            className={item.danger ? "rl-menu__item rl-menu__item--danger" : "rl-menu__item"}
            onClick={() => select(item)}
          >
            {item.icon ?? null}
            <span className="rl-menu__label">{item.label}</span>
            {item.note ? <span className="rl-menu__note">{item.note}</span> : null}
          </button>
        ));
        return (
          <Fragment key={section.key}>
            {index > 0 ? <div role="separator" className="rl-menu__sep" /> : null}
            {section.heading === null ? (
              items
            ) : (
              <div role="group" aria-labelledby={headingId}>
                <div id={headingId} className="rl-menu__heading" aria-hidden="true">
                  {section.heading}
                </div>
                {items}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>,
    document.body,
  );
}
