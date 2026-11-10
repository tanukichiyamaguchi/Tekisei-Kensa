"use client";
// イラスト画像（06 §7）。next/image ではなく img で幅・高さを固定し、404 のときは表示名だけの枠に差し替える。
// 飾りのイラスト（decorative。組織内分類のイラストはすべて。11-3 §3.8）は alt を空にして読み上げず、404 の代わりの枠も文字を出さない
import { useState } from "react";

export function Illustration(props: {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  /** img と代わりの枠の class に足すクラス */
  readonly className?: string;
  /** 飾り（真のとき img は alt を空にして aria-hidden、代わりの枠は文字・role・aria-label を付けず aria-hidden） */
  readonly decorative?: boolean;
  /** img の loading 属性（省くとブラウザの既定） */
  readonly loading?: "lazy" | "eager";
}) {
  const [failed, setFailed] = useState(false);
  const extra = props.className ? ` ${props.className}` : "";
  if (failed) {
    return props.decorative ? (
      <div
        className={`illustration illustration--fallback${extra}`}
        style={{ width: props.width, height: props.height }}
        aria-hidden="true"
      />
    ) : (
      <div
        className={`illustration illustration--fallback${extra}`}
        style={{ width: props.width, height: props.height }}
        role="img"
        aria-label={props.alt}
      >
        {props.alt}
      </div>
    );
  }
  return (
    // 印刷用ページと共用するため next/image ではなく img を使う（06 §7）
    <img
      className={`illustration${extra}`}
      src={props.src}
      alt={props.decorative ? "" : props.alt}
      aria-hidden={props.decorative ? "true" : undefined}
      width={props.width}
      height={props.height}
      loading={props.loading}
      onError={() => setFailed(true)}
    />
  );
}
