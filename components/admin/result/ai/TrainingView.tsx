// 育成・定着の表示（11-6 §2.5.5。参照元定義の HTML B。見た目は別表C の C.5）。カード（.ai-ik .card）の見出し帯（「✦」と「AI 育成・定着
// アドバイザー」と札「在籍スタッフ向け」）と本文。本文は上から、判定チップ 3 つ（期待役割へのマッチ度 → 離職リスク → サポートの必要度。
// 色は trainingChipTone で、値の前の点は参照元の 3 色、値の文字は K-49 の色）→ 節（1. すぐに手を打つべき理由と、その一手・2. 期待役割に
// 向けて・3. 日常の接し方（○と×）・4. 次回の1on1で聞くこと）→ 末尾。
// 出す条件は §2.5.5 の表のとおり: 1. と 2. の節は中身が空でも見出しを出し、「◎ 足りている」「△ 欠けている」の箱もいつも出す。
// urgent.why・role.why・role.cond・ステップの target・say・note・日常の接し方の say は空なら出さない。原因・一手・ステップは 1 つ以上の
// とき、3. と 4. の節は daily・oneonone が 1 つ以上のときだけ出す。表に条件の無い値（原因の本文、一手の札 label と本文、ステップの札
// badge と title と body、日常の接し方の札 scene と ok・ng、1on1 の q・intent、箱の項目）は、空でもそのまま出す（§2.5.5 の「ほかの値は
// 表の条件に従う」。採用向けの「値が空なら -」は当てない）。判定チップの値が空の文字のときだけ「-」（採用向けと同じ定数）。
// 原因の札は hypothesisBadge（level が「診断外」なら「診断外」、ほかは「可能性 」+ level。色は 高 → hi・中 → mi・ほか → lo）。
// 日常の接し方は「○ 」+ ok と「× 」+ ng を改行で分け、記号と本文の全体を太字（b）にする。1on1 は採用向けの質問と同じ形で、番号は
// 1 から（「見極め：」の前置きは無い）。
// 見出しの段は採用向けと同じ: 見出し帯は h2、節の見出し（.lab）は h3、小見出し（原因の枠の見出し .hyp-h、箱の見出し .mini h4、
// ステップの見出し .fill-h）は h4。節は class の無い 1 つの要素で包み、最後の節がその :last-child になって下の余白 0 になる。
// AI の出力（say を含む）はすべて React の文字として出す（HTML として解釈させない。§2.11・K-31 ⑤）。生成日時は出さない。
// フックを使わないので Server でも描ける
import type { ReactNode } from "react";

import { SparkIcon } from "./ai-icons";
import type { TrainingAiOutput } from "@/lib/ai/types";
import { TRAINING_CHIP_ORDER, hypothesisBadge, trainingChipTone } from "@/lib/presentation/ai-area";
import { AI_TEXTS } from "@/lib/presentation/ai-texts";

const t = AI_TEXTS.trainingView;

/** 節の見出し（左に縦のグラデーションの棒。棒は飾りで読み上げない） */
function SectionLabel(props: { readonly children: ReactNode }) {
  return (
    <h3 className="lab">
      <span className="bar" aria-hidden="true" />
      {props.children}
    </h3>
  );
}

/** 判定チップ 3 つ（§2.5.5 の 2。値が空の文字のときは「-」で mid）。点は値に添えた印で読み上げない */
function TrainingChips(props: { readonly verdict: TrainingAiOutput["verdict"] }) {
  return (
    <div className="chips">
      {TRAINING_CHIP_ORDER.map((kind) => {
        const value: string = props.verdict[kind];
        return (
          <div key={kind} className={`chip ${trainingChipTone(kind, value)}`}>
            <p className="k">{t.chips[kind]}</p>
            <p className="v">
              <span className="dot" aria-hidden="true" />
              {value === "" ? AI_TEXTS.recruitmentView.empty : value}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function TrainingView(props: { readonly output: TrainingAiOutput }) {
  const { verdict, urgent, role, daily, oneonone } = props.output;
  return (
    <div className="ai-ik">
      <div className="card">
        <div className="head">
          <span className="sp" aria-hidden="true">
            <SparkIcon />
          </span>
          <h2>{t.band}</h2>
          <span className="tag">{t.tag}</span>
        </div>
        <div className="body">
          <TrainingChips verdict={verdict} />
          <div>
            <section className="sec">
              <SectionLabel>{t.urgent}</SectionLabel>
              {urgent.why !== "" ? <p className="why">{urgent.why}</p> : null}
              {urgent.hypotheses.length > 0 ? (
                <div className="hyp">
                  <h4 className="hyp-h">{t.hypotheses}</h4>
                  {urgent.hypotheses.map((hypothesis, i) => {
                    const badge = hypothesisBadge(hypothesis.level);
                    return (
                      <div key={i} className="hy">
                        <span className={`hk ${badge.tone}`}>{badge.text}</span>
                        <p className="hv">{hypothesis.text}</p>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {urgent.actions.length > 0 ? (
                <div className="gap">
                  {urgent.actions.map((action, i) => (
                    <div key={i} className="gr">
                      <span className="gk">{action.label}</span>
                      <p className="gv">{action.text}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
            <section className="sec">
              <SectionLabel>{t.role}</SectionLabel>
              {role.why !== "" ? <p className="why">{role.why}</p> : null}
              <div className="two">
                <div className="mini a">
                  <h4>{t.have}</h4>
                  <ul className="ilist">
                    {role.have.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="mini b">
                  <h4>{t.lack}</h4>
                  <ul className="ilist">
                    {role.lack.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {role.steps.length > 0 ? (
                <>
                  <h4 className="fill-h">{t.steps}</h4>
                  <div className="scenes">
                    {role.steps.map((step, i) => (
                      <div key={i} className="scene">
                        <div className="scene-t">
                          <span className="sn">{step.badge}</span>
                          {step.title}
                          {step.target !== "" ? <span className="tgt">{step.target}</span> : null}
                        </div>
                        <p className="scene-b">{step.body}</p>
                        {step.say !== "" ? <p className="say">{step.say}</p> : null}
                        {step.note !== "" ? <p className="chk">{step.note}</p> : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              {role.cond !== "" ? <p className="cond">{role.cond}</p> : null}
            </section>
            {daily.length > 0 ? (
              <section className="sec">
                <SectionLabel>{t.daily}</SectionLabel>
                <div className="fb">
                  {daily.map((item, i) => (
                    <div key={i} className="f">
                      <span className="fh">{item.scene}</span>
                      <div className="ft">
                        <b>{`${t.okMark}${item.ok}`}</b>
                        <br />
                        <b>{`${t.ngMark}${item.ng}`}</b>
                        {item.say !== "" ? <p className="say">{item.say}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {oneonone.length > 0 ? (
              <section className="sec">
                <SectionLabel>{t.oneonone}</SectionLabel>
                <div className="qlist">
                  {oneonone.map((item, i) => (
                    <div key={i} className="q">
                      <span className="qn">{i + 1}</span>
                      <div>
                        <p className="qt">{item.q}</p>
                        <p className="qi">{item.intent}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
          <p className="foot">{t.footer}</p>
        </div>
      </div>
    </div>
  );
}
