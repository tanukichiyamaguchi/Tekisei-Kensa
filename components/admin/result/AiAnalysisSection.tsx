// セクション 7 AI 解説（06 §3.5.9）の表示。生成（POST …/ai-analysis）とポーリングは M5（08 PR-5.2）で追加する
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { formatDateTime } from "@/lib/presentation/format-datetime";
import type { ResultDetailDto } from "@/lib/services/dto/result";

export function AiAnalysisSection(props: { readonly aiAnalysis: ResultDetailDto["aiAnalysis"] }) {
  const latest = props.aiAnalysis.status === "completed" ? props.aiAnalysis.latest : null;
  return (
    <section className="result-section" aria-labelledby="section-ai" id="ai-analysis">
      <h2 id="section-ai">AI 解説</h2>
      <div className="panel">
        {latest ? (
          <div className="ai-analysis">
            <p className="muted small">生成日時 {formatDateTime(latest.generatedAt)}</p>
            <h3>この人物の要約</h3>
            <p>{latest.output.summary}</p>
            <h3>総合判定／即戦力性／離職リスク</h3>
            <p className="ai-analysis__verdict">
              <span className="badge">総合判定: {latest.output.verdict.sougou}</span>{" "}
              <span className="badge">即戦力性: {latest.output.verdict.sokusenryoku}</span>{" "}
              <span className="badge">離職リスク: {latest.output.verdict.teichaku_risk}</span>
            </p>
            <h3>このクリニックで活きる強み</h3>
            <ul>
              {latest.output.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <h3>採用前に見極めたい注意点</h3>
            <ul>
              {latest.output.cautions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <h3>面接で深掘りすべき質問</h3>
            <ul>
              {latest.output.questions.map((q) => (
                <li key={q.q}>
                  <strong>{q.q}</strong>
                  <br />
                  <span className="muted small">{q.intent}</span>
                </li>
              ))}
            </ul>
            <h3>長く働いてもらうための接し方・育て方</h3>
            {latest.output.retention.levers.map((lever) => (
              <div key={lever.label}>
                <h4>{lever.label}</h4>
                <p>{lever.text}</p>
              </div>
            ))}
            <h3>辞めそうなサイン＆引き止めの一手</h3>
            <p>{latest.output.retention.sign}</p>
            <p>{latest.output.retention.action}</p>
          </div>
        ) : (
          <p className="muted">AI 解説はまだ生成されていません。</p>
        )}
        <p className="muted small">{ADMIN_TEXTS.aiDisclaimer}</p>
      </div>
    </section>
  );
}
