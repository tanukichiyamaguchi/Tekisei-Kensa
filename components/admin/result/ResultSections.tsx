// 結果詳細の旧のセクション 5・6（育成方法・ソーシャルスタイル。06 §3.5.8）。PR-7.8a で旧のセクション 1〜4（サマリー・個人特性・
// 組織との相性・比較対象内での立ち位置とリスク）は新しいレイアウトの部品（概要・16の特性・リスク・組織との相性・人物像。11-4 §2.7〜
// §2.12）に置き換えた（同じ内容を 2 回出さない。11-4 §4.4）。5・6 は PR-7.8b で育て方・接し方に置き換えるまで、画面（ResultDetailPage）と
// PDF の印刷用ページ（07 §9.4）で新しいレイアウトの後ろに今のまま描く（目次には出さない）。
// variant="print" では第二候補の切替を描かず、第一候補・第二候補を続けて印字する（07 D07-18）
import { DevelopmentSection, PrintDevelopmentSection } from "./DevelopmentSection";
import { SocialStyleRadar } from "@/components/charts/SocialStyleRadar";
import { Illustration } from "@/components/ui/Illustration";
import { CHART_SIZES, PRINT_CHART_SIZES } from "@/lib/presentation/chart-theme";
import { resolveResultTexts } from "@/lib/presentation/result-texts";
import type { ResultDetailDto } from "@/lib/services/dto/result";

export type ResultSectionsVariant = "screen" | "print";

/** 印刷用ページに置くレーダーの個数（資質、ソーシャルスタイル。07 §9.6。PR-7.8b で 0。作り直しは 11-5） */
export const PRINT_RADAR_COUNT = 2;

export function ResultSections(props: {
  readonly detail: ResultDetailDto;
  readonly variant: ResultSectionsVariant;
}) {
  const { detail, variant } = props;
  const print = variant === "print";
  const { respondent, scores } = detail;
  const texts = resolveResultTexts(scores);
  const sizes = print ? PRINT_CHART_SIZES : CHART_SIZES;
  const illustration = (screen: number) => (print ? 96 : screen);

  return (
    <>
      {/* セクション 5 育成方法（印刷は第一候補・第二候補を続けて印字。07 D07-18） */}
      {print ? (
        <PrintDevelopmentSection
          subjectName={respondent.name}
          aptitudes={scores.aptitudes}
          first={texts.developmentFirst}
          second={texts.developmentSecond}
          radarSize={sizes.aptitudeRadar}
        />
      ) : (
        <DevelopmentSection
          subjectName={respondent.name}
          aptitudes={scores.aptitudes}
          first={texts.developmentFirst}
          second={texts.developmentSecond}
        />
      )}

      {/* セクション 6 ソーシャルスタイル */}
      <section className="result-section" aria-labelledby="section-style">
        <h2 id="section-style">ソーシャルスタイル</h2>
        <div className="result-grid result-grid--7-5">
          <div className="panel">
            <div className="style-card">
              <Illustration
                src={`/images/styles/${scores.socialStyle}.svg`}
                alt={texts.style.greatPersonName}
                width={illustration(160)}
                height={illustration(160)}
              />
              <div>
                <p className="type-card__name">{texts.style.typeName}</p>
                <p className="muted">{texts.style.greatPersonName}</p>
              </div>
            </div>
            <p className="pre-line">{texts.style.body}</p>
          </div>
          <div className="panel">
            <SocialStyleRadar
              subjectName={respondent.name}
              subject={scores.socialStyles}
              width={sizes.socialStyleRadar.width}
              height={sizes.socialStyleRadar.height}
            />
          </div>
        </div>
        <div className="panel">
          <h3>{texts.style.interactionHeading}</h3>
          <h4>{texts.style.identifyHeading}</h4>
          <p className="pre-line">{texts.style.identify}</p>
          <h4>{texts.style.praiseHeading}</h4>
          <p className="pre-line">{texts.style.praise}</p>
          <h4>{texts.style.responseHeading}</h4>
          <p className="pre-line">{texts.style.response}</p>
          <h4>{texts.style.phrasesHeading}</h4>
          <p className="pre-line">{texts.style.phrases}</p>
        </div>
        <div className="panel">
          <h3>タイプ別の対処法</h3>
          {texts.styleInteractions.map((item) => (
            <div key={item.viewer}>
              <h4>{item.heading}</h4>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
