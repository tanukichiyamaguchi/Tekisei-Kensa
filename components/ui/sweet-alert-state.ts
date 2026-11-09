// 共用の通知の部品 SweetAlert（11-8 §2.12.4。受験者側の R-07 も包んで使う。11-1 §2.1.5）の状態の変わり方。
// 状態の更新は純関数（sweetAlertReducer）で、時間の管理だけを createSweetAlertController が持つ（DOM・React に依存しない）。
//   - 表示から durationMs（既定 2,000 ミリ秒）で自動で閉じる。Esc でも閉じる。背景を押しても閉じない
//   - 表示中（消えている途中を含む）に次の通知が来たら、中身を差し替えて時間を数え直す
//   - 閉じるときは消える動き（0.15 秒。動きを減らす設定では 0）のあとで消す

/** 自動で閉じるまでの既定の時間（参照元のアクションの Timer Duration） */
export const SWEET_ALERT_DURATION_MS = 2000;
/** 消える動きの時間（SweetAlert2 6.6.10 の hideSweetAlert） */
export const SWEET_ALERT_CLOSING_MS = 150;

export interface SweetAlertContent {
  readonly title: string;
  readonly text: string;
}

export type SweetAlertState =
  | { readonly phase: "hidden" }
  | { readonly phase: "shown"; readonly content: SweetAlertContent; readonly closesAt: number }
  | { readonly phase: "closing"; readonly content: SweetAlertContent };

export type SweetAlertEvent =
  /** 通知を出す（表示中・消えている途中なら中身を差し替え、時間を数え直す） */
  | {
      readonly type: "show";
      readonly content: SweetAlertContent;
      readonly now: number;
      readonly durationMs: number;
    }
  /** 時間の確かめ（表示から durationMs たっていれば消え始める） */
  | { readonly type: "timer"; readonly now: number }
  /** Esc（dialog の cancel） */
  | { readonly type: "escape" }
  /** 背景（dialog の外側）を押した。閉じない */
  | { readonly type: "backdrop" }
  /** 消える動きが終わった */
  | { readonly type: "closed" }
  /** 動きを待たずに消す（呼び出し側が open を下ろした、ブラウザが dialog を閉じた） */
  | { readonly type: "hide" };

export const SWEET_ALERT_HIDDEN: SweetAlertState = Object.freeze({ phase: "hidden" });

export function sweetAlertReducer(state: SweetAlertState, event: SweetAlertEvent): SweetAlertState {
  switch (event.type) {
    case "show":
      return { phase: "shown", content: event.content, closesAt: event.now + event.durationMs };
    case "timer":
      return state.phase === "shown" && event.now >= state.closesAt
        ? { phase: "closing", content: state.content }
        : state;
    case "escape":
      return state.phase === "shown" ? { phase: "closing", content: state.content } : state;
    case "backdrop":
      return state;
    case "closed":
      return state.phase === "closing" ? SWEET_ALERT_HIDDEN : state;
    case "hide":
      return state.phase === "hidden" ? state : SWEET_ALERT_HIDDEN;
  }
}

/** 自動で閉じ始めるまでの残り（ミリ秒）。表示中でなければ null */
export function msUntilAutoClose(state: SweetAlertState, now: number): number | null {
  return state.phase === "shown" ? Math.max(0, state.closesAt - now) : null;
}

export interface SweetAlertController {
  readonly getState: () => SweetAlertState;
  readonly show: (content: SweetAlertContent, durationMs?: number) => void;
  readonly escape: () => void;
  readonly backdrop: () => void;
  readonly hide: () => void;
  readonly dispose: () => void;
}

export interface SweetAlertControllerOptions {
  /** 状態が変わるたびに呼ぶ */
  readonly onChange: (state: SweetAlertState) => void;
  /** 消える動きの時間（動きを減らす設定では 0） */
  readonly closingMs?: () => number;
  readonly now?: () => number;
}

/** 通知の状態と時間（setTimeout）を持つ。部品（components/ui/SweetAlert.tsx）が 1 つずつ作る */
export function createSweetAlertController(
  options: SweetAlertControllerOptions,
): SweetAlertController {
  const now = options.now ?? (() => Date.now());
  const closingMs = options.closingMs ?? (() => SWEET_ALERT_CLOSING_MS);
  let state: SweetAlertState = SWEET_ALERT_HIDDEN;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const schedule = () => {
    clear();
    if (state.phase === "shown") {
      const delay = Math.max(0, state.closesAt - now());
      timer = setTimeout(() => apply({ type: "timer", now: now() }), delay);
    } else if (state.phase === "closing") {
      timer = setTimeout(() => apply({ type: "closed" }), closingMs());
    }
  };

  function apply(event: SweetAlertEvent): void {
    const next = sweetAlertReducer(state, event);
    const changed = next !== state;
    state = next;
    // 時間の確かめで変わらなかったとき（タイマーが少し早く来たとき）も、残りの時間で数え直す
    if (changed || event.type === "timer") schedule();
    if (changed) options.onChange(state);
  }

  return {
    getState: () => state,
    show: (content, durationMs = SWEET_ALERT_DURATION_MS) =>
      apply({ type: "show", content, now: now(), durationMs }),
    escape: () => apply({ type: "escape" }),
    backdrop: () => apply({ type: "backdrop" }),
    hide: () => apply({ type: "hide" }),
    dispose: clear,
  };
}
