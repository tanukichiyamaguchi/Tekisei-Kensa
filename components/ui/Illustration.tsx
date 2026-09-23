"use client";
// イラスト画像（06 §7）。next/image ではなく img で幅・高さを固定し、404 のときは表示名だけの枠に差し替える
import { useState } from "react";

export function Illustration(props: {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="illustration illustration--fallback"
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
      className="illustration"
      src={props.src}
      alt={props.alt}
      width={props.width}
      height={props.height}
      onError={() => setFailed(true)}
    />
  );
}
