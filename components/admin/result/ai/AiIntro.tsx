// 生成前の案内（11-6 §2.3.1。参照元定義の HTML D・HTML E。見た目は別表C の C.2）。見出しの行（「✦」の四角・見出し・副題）と特徴の 3 行
// （アイコンの四角・太字・説明）。育成・定着（§2.5.2）は根に ai-intro--training を付け、続けて枠（.need）と警告（.warn。左の「！」の丸は
// 記号だけの印で読み上げない）を出す。太字の部分は b の要素。文言は AI_TEXTS.intro。見出しは h2（結果詳細のセクションの見出しと同じ段。
// 表示の見出し帯も h2）。四角とアイコンは見出しと文字に添えた印で、読み上げない（aria-hidden）。フックを使わないので Server でも描ける
import type { ReactNode } from "react";

import { ChartIcon, ChatIcon, SparkIcon, SproutIcon, UserIcon, ZapIcon } from "./ai-icons";
import type { AiStartKind } from "@/lib/presentation/ai-area";
import { AI_TEXTS } from "@/lib/presentation/ai-texts";

/** 特徴の 3 行のアイコン（§2.4.2・§2.5.2 の表の順。§2.14） */
const FEATURE_ICONS: Readonly<Record<AiStartKind, readonly ReactNode[]>> = {
  recruitment: [<ChartIcon />, <UserIcon />, <ChatIcon />],
  training: [<ZapIcon />, <SproutIcon />, <ChatIcon />],
};

export function AiIntro(props: { readonly kind: AiStartKind }) {
  const { kind } = props;
  const t = AI_TEXTS.intro[kind];
  const training = AI_TEXTS.intro.training;
  return (
    <div className={kind === "training" ? "ai-intro ai-intro--training" : "ai-intro"}>
      <div className="ih">
        <span className="ih-sp" aria-hidden="true">
          <SparkIcon />
        </span>
        <div>
          <h2 className="ih-t">{t.title}</h2>
          <p className="ih-s">{t.subtitle}</p>
        </div>
      </div>
      <div className="feats">
        {t.features.map((feature, i) => (
          <div key={feature.title} className="feat">
            <span className="fi" aria-hidden="true">
              {FEATURE_ICONS[kind][i]}
            </span>
            <div>
              <p className="fi-t">{feature.title}</p>
              <p className="fi-d">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
      {kind === "training" ? (
        <>
          <p className="need">
            {training.need.before}
            <b>{training.need.strong}</b>
            {training.need.after}
          </p>
          <div className="warn">
            <span className="warn-i" aria-hidden="true">
              {training.warn.mark}
            </span>
            <p>
              {training.warn.before}
              <b>{training.warn.strong}</b>
              {training.warn.after}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
