// 受験者側の画面のアイコン（11-1 §2.2.3・§2.1.6・§2.5）。参照元の画像は使わず、同じ形を SVG で描く。どれも飾り（aria-hidden）。
//
// - 入力欄の左のアイコン（UserIcon・PhoneCallIcon・UsersIcon・InfoIcon）は Feather Icons と同じ形。
//   Feather Icons: Copyright (c) 2013-2017 Cole Bemis. MIT License（https://github.com/feathericons/feather）
// - 完了のアイコン（SmileyIcon）は Phosphor Icons の Smiley（Regular）と同じ形。
//   Phosphor Icons: Copyright (c) 2020 Phosphor Icons. MIT License（https://github.com/phosphor-icons/core）
// - ロード中のアイコン（SpinnerIcon。8 つの点を丸く並べた形）とプルダウンの矢印（SelectArrowIcon）は本アプリで描いたもの
import type { ReactNode, SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children" | "width" | "height" | "strokeWidth">;

/** Feather Icons の線画（24×24 の座標）。size は表示の大きさ、strokeWidth は線の太さ */
function FeatherIcon({
  size,
  strokeWidth,
  children,
  ...rest
}: IconProps & {
  readonly size: number;
  readonly strokeWidth: number;
  readonly children: ReactNode;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** お名前（Feather「user」。20px・線の太さ 2） */
export function UserIcon(props: IconProps) {
  return (
    <FeatherIcon size={20} strokeWidth={2} {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </FeatherIcon>
  );
}

/** 電話番号（Feather「phone-call」。18px・線の太さ 1.5） */
export function PhoneCallIcon(props: IconProps) {
  return (
    <FeatherIcon size={18} strokeWidth={1.5} {...props}>
      <path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </FeatherIcon>
  );
}

/** 職業（Feather「users」。18px・線の太さ 1.5） */
export function UsersIcon(props: IconProps) {
  return (
    <FeatherIcon size={18} strokeWidth={1.5} {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </FeatherIcon>
  );
}

/** 過去の診断経験（Feather「info」。18px・線の太さ 1.5） */
export function InfoIcon(props: IconProps) {
  return (
    <FeatherIcon size={18} strokeWidth={1.5} {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </FeatherIcon>
  );
}

/** プルダウンの下向きの矢印（幅 約 8px。色は CSS の --color-select-arrow） */
export function SelectArrowIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={8}
      height={6}
      viewBox="0 0 8 6"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M1 1.5 4 4.5 7 1.5" />
    </svg>
  );
}

/** 完了のアイコン（Phosphor「Smiley」Regular。50px。色は currentColor） */
export function SmileyIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={50}
      height={50}
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216ZM80,108a12,12,0,1,1,12,12A12,12,0,0,1,80,108Zm96,0a12,12,0,1,1-12-12A12,12,0,0,1,176,108Zm-1.07,48c-10.29,17.79-27.4,28-46.93,28s-36.63-10.2-46.92-28a8,8,0,1,1,13.84-8c7.47,12.91,19.21,20,33.08,20s25.61-7.1,33.08-20a8,8,0,1,1,13.85,8Z" />
    </svg>
  );
}

/** 8 つの点を時計回りに小さくしながら丸く並べた位置と半径（30×30 の座標） */
const SPINNER_DOTS = Array.from({ length: 8 }, (_, i) => {
  const angle = (Math.PI / 4) * i - Math.PI / 2;
  return {
    cx: Math.round((15 + 11 * Math.cos(angle)) * 100) / 100,
    cy: Math.round((15 + 11 * Math.sin(angle)) * 100) / 100,
    r: Math.round((3.4 - 0.25 * i) * 100) / 100,
  };
});

/** ロード中のアイコン（30×30px。色は currentColor。回すのは CSS） */
export function SpinnerIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={30}
      height={30}
      viewBox="0 0 30 30"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {SPINNER_DOTS.map((dot) => (
        <circle key={`${dot.cx}-${dot.cy}`} cx={dot.cx} cy={dot.cy} r={dot.r} />
      ))}
    </svg>
  );
}
