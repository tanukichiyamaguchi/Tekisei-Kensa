// 採用向けの表示（11-6 §2.4.3。参照元定義の HTML A。見た目は別表C の C.4）。カード（.ai-rec .card）の見出し帯（「✦」と「AI 採用・育成
// アドバイザー」）と本文。本文は上から、注意書き（ai-10・compare-M1。p の要素。CSS の content は使わない: K-31 ⑤）→ 判定チップ 3 つ
// （VerdictChips）→ 節（この人物の要約（summary が空でないときだけ）・強みと注意点の 2 つの箱・面接で深掘りすべき質問・長く働いてもらう
// ための接し方・育て方と辞めそうなサインの箱）→ 末尾（T-09）。
// 節は 1 つの要素（クラスなし）で包み、最後の節がその :last-child になって下の余白 0 になる（§2.4.3 の「節の間は 24px（最後の節は 0）」）。
// 末尾の上の 22px は .ai-foot の指定のまま。見出しは見出し帯が h2、節の見出し（.ai-label）が h3、箱の見出し（強み・注意点の .mini と
// 辞めそうなサインの .ra-head）が h4（別表C の .mini h4）。値が空の文字のときは「-」。改行の入った文字はそのまま 1 つの文として出す。
// AI の出力はすべて React の文字として出す（HTML として解釈させない。§2.11・K-31 ⑤）。生成日時は出さない（ai-08）。
// 画面（RecruitmentPanel）と印刷用ページ（PR-7.12 まで PrintResultDocument が直接置く）で共用する。フックを使わないので Server でも描ける
import type { ReactNode } from "react";

import { SparkIcon } from "./ai-icons";
import { VerdictChips } from "./VerdictChips";
import type { AiAnalysisOutput } from "@/lib/ai/types";
import { AI_TEXTS } from "@/lib/presentation/ai-texts";

const t = AI_TEXTS.recruitmentView;

/** 値が空の文字のときは「-」（§2.4.3） */
const orDash = (value: string): string => (value === "" ? t.empty : value);

/** 節の見出し（左に縦のグラデーションの棒。棒は飾りで読み上げない） */
function SectionLabel(props: { readonly children: ReactNode }) {
  return (
    <h3 className="ai-label">
      <span className="bar" aria-hidden="true" />
      {props.children}
    </h3>
  );
}

export function RecruitmentView(props: { readonly output: AiAnalysisOutput }) {
  const { output } = props;
  return (
    <div className="ai-rec">
      <div className="card">
        <div className="ai-head">
          <span className="spark" aria-hidden="true">
            <SparkIcon />
          </span>
          <h2>{t.band}</h2>
        </div>
        <div className="ai-body">
          <p className="ai-caution">{t.caution}</p>
          <VerdictChips verdict={output.verdict} />
          <div>
            {output.summary !== "" ? (
              <section className="ai-sec">
                <SectionLabel>{t.summary}</SectionLabel>
                <p className="ai-p">{output.summary}</p>
              </section>
            ) : null}
            <section className="ai-sec">
              <div className="two">
                <div className="mini strength">
                  <h4>{t.strengths}</h4>
                  <ul className="ilist">
                    {output.strengths.map((item, i) => (
                      <li key={i}>{orDash(item)}</li>
                    ))}
                  </ul>
                </div>
                <div className="mini caution">
                  <h4>{t.cautions}</h4>
                  <ul className="ilist">
                    {output.cautions.map((item, i) => (
                      <li key={i}>{orDash(item)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
            <section className="ai-sec">
              <SectionLabel>{t.questions}</SectionLabel>
              <div className="qlist">
                {output.questions.map((question, i) => (
                  <div key={i} className="q">
                    <span className="qn">{i + 1}</span>
                    <div>
                      <p className="qtext">{orDash(question.q)}</p>
                      <p className="qintent">
                        <span className="e">{t.intentLabel}</span>
                        {orDash(question.intent)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="ai-sec">
              <SectionLabel>{t.retention}</SectionLabel>
              <div className="alist">
                {output.retention.levers.map((lever, i) => (
                  <div key={i} className="a">
                    <span className="ahead">{orDash(lever.label)}</span>
                    <p className="atext">{orDash(lever.text)}</p>
                  </div>
                ))}
              </div>
              <div className="retain-alert">
                <h4 className="ra-head">{t.retainAlert}</h4>
                <div className="ra-row">
                  <span className="ra-k">{t.sign}</span>
                  <p className="ra-v">{orDash(output.retention.sign)}</p>
                </div>
                <div className="ra-row">
                  <span className="ra-k">{t.action}</span>
                  <p className="ra-v">{orDash(output.retention.action)}</p>
                </div>
              </div>
            </section>
          </div>
          <p className="ai-foot">{t.footer}</p>
        </div>
      </div>
    </div>
  );
}
