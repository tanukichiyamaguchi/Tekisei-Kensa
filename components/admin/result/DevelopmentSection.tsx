"use client";
// セクション 5 育成方法（06 §3.5.8）。「第二候補を見る」の状態は URL に載せない
import { useState } from "react";

import { AptitudeRadar } from "@/components/charts/AptitudeRadar";
import { DEVELOPMENT_GUIDE_ITEMS } from "@/lib/masters/texts";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import type { DevelopmentView } from "@/lib/presentation/result-texts";
import type { AptitudeScores } from "@/lib/scoring/types";

export function DevelopmentSection(props: {
  readonly subjectName: string;
  readonly aptitudes: AptitudeScores;
  readonly first: DevelopmentView;
  readonly second: DevelopmentView;
}) {
  const [showSecond, setShowSecond] = useState(false);
  const current = showSecond ? props.second : props.first;
  return (
    <section className="result-section" aria-labelledby="section-development">
      <h2 id="section-development">育成方法</h2>
      <div className="result-grid result-grid--5-7">
        <div className="panel">
          <AptitudeRadar subjectName={props.subjectName} subject={props.aptitudes} />
        </div>
        <div className="panel">
          <div className="panel__header">
            <h3 data-testid="development-heading">
              {showSecond ? "第二候補" : "第一候補"}: {current.label}
            </h3>
            <button type="button" className="btn" onClick={() => setShowSecond((v) => !v)}>
              {showSecond ? ADMIN_TEXTS.showFirstCandidate : ADMIN_TEXTS.showSecondCandidate}
            </button>
          </div>
          <dl className="guide-list">
            {[...DEVELOPMENT_GUIDE_ITEMS]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((item) => (
                <div key={item.key} className="guide-list__item">
                  <dt>{item.label}</dt>
                  <dd className="pre-line">{current.guide.items[item.key]}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
