// 失敗の枠（11-6 §2.3.4。見た目は別表C の .ai-fail。参照元定義の HTML A の読み込みの失敗の枠の値）。状態が failed のときは生成ボタンの
// すぐ上に「AI解説の生成に失敗しました。」（T-18）に続けて理由の文（aiFailureText。T-30 群）を、生成中の読み直しが 10 分たっても
// 終わらないときは生成中の表示の代わりに T-29 を出す（文は呼ぶ側が渡す）。role="alert"（旧の画面のまま）。AI の出力の文は入らない。
// フックを使わないので Server でも描ける
export function AiFailureNotice(props: { readonly text: string }) {
  return (
    <div className="ai-fail" role="alert">
      {props.text}
    </div>
  );
}
