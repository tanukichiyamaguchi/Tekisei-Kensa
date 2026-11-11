"use client";
// リスク rs-rk（11-4 §2.10）。7 行を表示値の大きい順（同じ値はマスタの順。rankRisks）に並べ、行 .rs.lv{段階} に表示名・棒・「NN%」・
// 段階の札を置き、下に色分けの目安の注記を出す。段階は表示値で決め（20 未満 低い／40 未満 やや低い／60 未満 注意／60 以上 高い）、
// 行の地・左の線・札・棒・数字の色と名前の太さは CSS（別表D の 9。札の地の低い #12883E・高い #EB1515 は K-49）。560px 以下で札を隠し、
// 棒を 2 行目に回すのも CSS。非表示の PDF（showRisks が偽）はセクションごと描かない（ResultLayout）
import { RISK_LEVEL_STYLES } from "@/lib/presentation/colors";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";
import type { ResultDetailView } from "@/lib/presentation/result-detail-view";

export function RiskSection(props: { readonly view: ResultDetailView }) {
  return (
    <div className="card">
      <div className="risks">
        {props.view.risks.map((risk) => (
          <div key={risk.key} className={`rs lv${risk.level}`}>
            <div className="n">{risk.label}</div>
            <div className="bar">
              <i style={{ width: `${risk.display}%` }} />
            </div>
            <div className="v">{RESULT_DETAIL_TEXTS.percent(risk.display)}</div>
            <div className="lv">{RISK_LEVEL_STYLES[risk.level].label}</div>
          </div>
        ))}
      </div>
      <p className="note">{RESULT_DETAIL_TEXTS.risk.note}</p>
    </div>
  );
}
