// 結果詳細のセクション 1〜6（06 §3.5.4〜§3.5.8）。画面（ResultDetailPage）と PDF の印刷用ページ（07 §9.4）で共用し、
// 「結果詳細と同一レイアウト」（要件定義書 §9、D-18）を同じ部品・同じ順序で満たす。
// variant="print" では操作要素（他項目の一覧、第二候補の切替）を描かず、restricted の非表示（PdfSectionVisibility）を適用する
import {
  ComparisonGrade,
  ComparisonMatchGauge,
  ComparisonPosition,
  TraitRadarWithComparison,
} from "./ComparisonParts";
import { DevelopmentSection, PrintDevelopmentSection } from "./DevelopmentSection";
import { TraitListButton } from "./TraitListDialog";
import { CompatSlider } from "@/components/charts/CompatSlider";
import { DonutGauge } from "@/components/charts/DonutGauge";
import { SocialStyleRadar } from "@/components/charts/SocialStyleRadar";
import { Illustration } from "@/components/ui/Illustration";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { FULL_VISIBILITY, type PdfSectionVisibility } from "@/lib/pdf/visibility";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { compatSliders, reliabilityGauge, riskGauges } from "@/lib/presentation/chart-series";
import { CHART_SIZES, PRINT_CHART_SIZES } from "@/lib/presentation/chart-theme";
import { resolveResultTexts } from "@/lib/presentation/result-texts";
import { formatStep } from "@/lib/presentation/rounding";
import type { ResultDetailDto } from "@/lib/services/dto/result";

export type ResultSectionsVariant = "screen" | "print";

/** 印刷用ページに置くレーダーの個数（16 軸 ×2、資質、ソーシャルスタイル。07 §9.6） */
export const PRINT_RADAR_COUNT = 4;

function RiskGauges(props: { readonly detail: ResultDetailDto; readonly size: number }) {
  return (
    <div className="gauge-row gauge-row--wrap" data-testid="risk-gauges">
      {riskGauges(props.detail.scores).map((g) => (
        <DonutGauge
          key={g.key}
          value={g.value}
          color={g.color}
          label={g.label}
          title={g.title}
          size={props.size}
        />
      ))}
    </div>
  );
}

function ReliabilityGauge(props: {
  readonly detail: ResultDetailDto;
  readonly size: number | undefined;
}) {
  const g = reliabilityGauge(props.detail.scores);
  return (
    <DonutGauge
      value={g.value}
      color={g.color}
      label={g.label}
      title={g.title}
      {...(props.size ? { size: props.size } : {})}
    />
  );
}

export function ResultSections(props: {
  readonly detail: ResultDetailDto;
  readonly variant: ResultSectionsVariant;
  readonly visibility?: PdfSectionVisibility;
}) {
  const { detail, variant } = props;
  const v = props.visibility ?? FULL_VISIBILITY;
  const print = variant === "print";
  const { respondent, scores } = detail;
  const texts = resolveResultTexts(scores);
  const type = APTITUDE_TYPE_DEFINITIONS.find((t) => t.key === scores.aptitudeType);
  const typeLabel = type?.label ?? scores.aptitudeType;
  const sizes = print ? PRINT_CHART_SIZES : CHART_SIZES;
  const illustration = (screen: number) => (print ? 96 : screen);
  // 印刷ではゲージを小さくし、リスク 7 個を 1 行に収める（07 §9.5 の「サマリーは 1 ページ目」）
  const gaugeSize = print ? 80 : undefined;
  const riskGaugeSize = print ? 76 : 96;

  return (
    <>
      {/* セクション 1 サマリー */}
      <section className="result-section" aria-labelledby="section-summary">
        <h2 id="section-summary">サマリー</h2>
        <div className="result-grid result-grid--7-5 result-grid--summary">
          <div className="panel">
            <h3>個別特性</h3>
            <div className="trait-summary">
              <div className="gauge-row">
                {v.showGrade ? (
                  <div className="grade-cell">
                    <p className="gauge-placeholder__label">評価</p>
                    <ComparisonGrade />
                  </div>
                ) : null}
                {v.showMatchScore ? (
                  <ComparisonMatchGauge {...(gaugeSize ? { size: gaugeSize } : {})} />
                ) : null}
                <ReliabilityGauge detail={detail} size={gaugeSize} />
              </div>
              <TraitRadarWithComparison
                subjectName={respondent.name}
                subject={scores.traits}
                width={sizes.traitRadarSummary.width}
                height={sizes.traitRadarSummary.height}
                plotRadius={print ? PRINT_CHART_SIZES.traitRadarSummary.plotRadius : undefined}
              />
            </div>
          </div>
          <div className="panel">
            <h3>タイプ</h3>
            <div className="type-card">
              <Illustration
                src={`/images/types/${scores.aptitudeType}.svg`}
                alt={`${typeLabel}（${texts.characterName}）`}
                width={illustration(200)}
                height={illustration(200)}
              />
              <p className="type-card__name" data-testid="type-label">
                {typeLabel}
              </p>
              <p data-testid="character-name">キャラクター: {texts.characterName}</p>
            </div>
            <p className="type-card__heading">{texts.type.aptitudeHeading}</p>
            <p>
              <strong>適性職種: </strong>
              {texts.type.suitableJobs}
            </p>
          </div>
          {v.showPosition ? (
            <div className="panel">
              <h3>比較対象内での立ち位置</h3>
              <ComparisonPosition />
            </div>
          ) : null}
          {v.showRisks ? (
            <div className="panel panel--wide">
              <h3>リスク</h3>
              <RiskGauges detail={detail} size={riskGaugeSize} />
            </div>
          ) : null}
        </div>
      </section>

      {/* セクション 2 個人特性 */}
      <section className="result-section" aria-labelledby="section-personal">
        <h2 id="section-personal">個人特性</h2>
        <div className="result-grid result-grid--7-5">
          <div className="panel">
            <h3>タイプ</h3>
            <h4>特徴</h4>
            <p>{texts.type.characteristics}</p>
            <h4>適性</h4>
            <p>{texts.type.aptitudeHeading}</p>
            <h4>適性職種</h4>
            <p>{texts.type.suitableJobs}</p>
            <h4>アドバイス</h4>
            <p>{texts.type.advice}</p>
          </div>
          <div className="panel">
            <h3>特性</h3>
            <div className="trait-summary">
              <div className="gauge-row">
                {v.showMatchScore ? (
                  <ComparisonMatchGauge {...(gaugeSize ? { size: gaugeSize } : {})} />
                ) : null}
                <ReliabilityGauge detail={detail} size={gaugeSize} />
              </div>
              <TraitRadarWithComparison
                subjectName={respondent.name}
                subject={scores.traits}
                width={sizes.traitRadarDetail.width}
                height={sizes.traitRadarDetail.height}
                plotRadius={print ? PRINT_CHART_SIZES.traitRadarDetail.plotRadius : undefined}
              />
            </div>
          </div>
          <div className="panel" data-testid="trait-highlights">
            <h3>項目詳細</h3>
            {texts.allTraitsEqual ? <p className="muted">{ADMIN_TEXTS.allTraitsEqual}</p> : null}
            <h4>最も数値が高い項目</h4>
            <p data-testid="highest-trait">
              <strong>{texts.highest.label}</strong>（{formatStep(texts.highest.highlight.value)}）
            </p>
            <p>ポジティブ: {texts.highest.positive}</p>
            <p>ネガティブ: {texts.highest.negative}</p>
            <h4>最も数値が小さい項目</h4>
            <p data-testid="lowest-trait">
              <strong>{texts.lowest.label}</strong>（{formatStep(texts.lowest.highlight.value)}）
            </p>
            <p>ポジティブ: {texts.lowest.positive}</p>
            <p>ネガティブ: {texts.lowest.negative}</p>
            {print ? null : (
              <TraitListButton
                traits={scores.traits}
                highestKey={texts.highest.highlight.key}
                lowestKey={texts.lowest.highlight.key}
              />
            )}
          </div>
          <div className="panel" data-testid="trait-details">
            <h3>特性詳細</h3>
            {texts.traitDetails.map((group) => (
              <div key={group.category}>
                <h4>{group.label}</h4>
                <ul>
                  {group.sentences.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* セクション 3 組織との相性 */}
      <section className="result-section" aria-labelledby="section-compatibility">
        <h2 id="section-compatibility">組織との相性</h2>
        <div className="panel">
          {compatSliders(scores).map((s) => (
            <CompatSlider
              key={s.key}
              label={s.label}
              lowLabel={s.lowLabel}
              highLabel={s.highLabel}
              value={s.value}
            />
          ))}
          <p className="slider-legend">
            <span className="slider-legend__mark" aria-hidden="true" /> {respondent.name}さん
          </p>
        </div>
      </section>

      {/* セクション 4 比較対象内での立ち位置・リスク（再掲）。restricted ではリスクを見出しごと外す */}
      {v.showPosition || v.showRisks ? (
        <section className="result-section" aria-labelledby="section-position">
          <h2 id="section-position">
            {v.showRisks ? "比較対象内での立ち位置・リスク" : "比較対象内での立ち位置"}
          </h2>
          <div className="result-grid result-grid--7-5">
            {v.showPosition ? (
              <div className="panel">
                <h3>比較対象内での立ち位置</h3>
                <ComparisonPosition />
              </div>
            ) : null}
            {v.showRisks ? (
              <div className="panel">
                <h3>リスク</h3>
                <RiskGauges detail={detail} size={riskGaugeSize} />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

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
