// AI 解説の 7 ブロック（06 §3.5.9、付録D §1・§2）。画面（AiAnalysisSection）と印刷用ページ（07 §7.2）で共用する表示専用部品
import type { AiAnalysisOutput } from "@/lib/ai/types";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { formatDateTime } from "@/lib/presentation/format-datetime";

export function AiAnalysisBody(props: {
  readonly output: AiAnalysisOutput;
  readonly generatedAt: string;
}) {
  const { output } = props;
  return (
    <div className="ai-analysis" data-testid="ai-analysis-body">
      <p className="muted small">{ADMIN_TEXTS.aiGeneratedAt(formatDateTime(props.generatedAt))}</p>
      <h3>この人物の要約</h3>
      <p>{output.summary}</p>
      <h3>総合判定／即戦力性／離職リスク</h3>
      {/* 判定値に色を付けない（06 D06-15） */}
      <p className="ai-analysis__verdict">
        <span className="badge">総合判定: {output.verdict.sougou}</span>{" "}
        <span className="badge">即戦力性: {output.verdict.sokusenryoku}</span>{" "}
        <span className="badge">離職リスク: {output.verdict.teichaku_risk}</span>
      </p>
      <h3>このサロンで活きる強み</h3>
      <ul>
        {output.strengths.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <h3>採用前に見極めたい注意点</h3>
      <ul>
        {output.cautions.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
      <h3>面接で深掘りすべき質問</h3>
      <ul>
        {output.questions.map((q, i) => (
          <li key={i}>
            <strong>{q.q}</strong>
            <br />
            <span className="muted small">{q.intent}</span>
          </li>
        ))}
      </ul>
      <h3>長く働いてもらうための接し方・育て方</h3>
      {output.retention.levers.map((lever) => (
        <div key={lever.label}>
          <h4>{lever.label}</h4>
          <p>{lever.text}</p>
        </div>
      ))}
      <h3>辞めそうなサイン＆引き止めの一手</h3>
      <p>{output.retention.sign}</p>
      <p>{output.retention.action}</p>
      <p className="muted small">{ADMIN_TEXTS.aiDisclaimer}</p>
    </div>
  );
}
