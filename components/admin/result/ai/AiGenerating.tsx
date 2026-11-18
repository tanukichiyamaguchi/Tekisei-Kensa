// 生成中（11-6 §2.3.3。参照元定義の HTML 生成中。見た目は別表C の C.3）。採用向けと育成・定着で同じ文言・見た目。66px の輪（SVG。下地の
// 円と、1.1 秒で回る弧の円。中心 (25, 25)・半径 20・塗りなし・線の幅 5）の中央に「✦」（SparkIcon。1.4 秒周期で明滅）、見出しと 2 行の
// 説明、下に点 3 つ（1.2 秒周期）。見出しと説明は role="status" の .ai-load-card の中に置き（読み上げ）、輪と点は飾りとして読み上げない。
// 見出しと説明は div（別表C の C.3 は余白を消す指定が無いので、p の既定の余白で §2.3.3 の「間 14px」が広がらないように）。
// 印刷の形（data-variant="print"）では動きを止める（別表C の C.1）。T-17 とスピナーは無くなった。フックを使わないので Server でも描ける
import { SparkIcon } from "./ai-icons";
import { AI_TEXTS } from "@/lib/presentation/ai-texts";

export function AiGenerating() {
  const [first, second] = AI_TEXTS.generating.lines;
  return (
    <div className="ai-loading">
      <div className="ai-load-card" role="status">
        <div className="ring" aria-hidden="true">
          <svg className="spinner" viewBox="0 0 50 50">
            <circle className="track" cx="25" cy="25" r="20" fill="none" strokeWidth="5" />
            <circle className="arc" cx="25" cy="25" r="20" fill="none" strokeWidth="5" />
          </svg>
          <span className="spark">
            <SparkIcon />
          </span>
        </div>
        <div className="ttl">{AI_TEXTS.generating.title}</div>
        <div className="sub">
          {first}
          <br />
          {second}
        </div>
        <div className="dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
