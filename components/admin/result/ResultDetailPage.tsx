// M-05 結果詳細の本文（06 §3.5）。比較に依存しない部分はサーバで描き、比較依存の部品だけを Client にする
import Link from "next/link";
import { Suspense } from "react";

import { AiAnalysisHeaderButton, AiAnalysisProvider, AiAnalysisSection } from "./AiAnalysisSection";
import {
  ComparisonGrade,
  ComparisonMatchGauge,
  ComparisonPosition,
  PopulationSummary,
  TraitRadarWithComparison,
} from "./ComparisonParts";
import { ComparisonProvider } from "./ComparisonProvider";
import { ComparisonScopeSelect } from "./ComparisonScopeSelect";
import { DevelopmentSection } from "./DevelopmentSection";
import { TraitListButton } from "./TraitListDialog";
import { CompatSlider } from "@/components/charts/CompatSlider";
import { DonutGauge } from "@/components/charts/DonutGauge";
import { SocialStyleRadar } from "@/components/charts/SocialStyleRadar";
import { Illustration } from "@/components/ui/Illustration";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { getOccupationLabel } from "@/lib/masters/occupations";
import { ADMIN_TEXTS, RESPONDENT_KIND_LABELS } from "@/lib/presentation/admin-texts";
import { compatSliders, reliabilityGauge, riskGauges } from "@/lib/presentation/chart-series";
import { CHART_SIZES } from "@/lib/presentation/chart-theme";
import { formatDateTime } from "@/lib/presentation/format-datetime";
import { resolveResultTexts } from "@/lib/presentation/result-texts";
import { formatStep } from "@/lib/presentation/rounding";
import type { ResultDetailDto } from "@/lib/services/dto/result";

function RiskGauges(props: { readonly detail: ResultDetailDto }) {
  return (
    <div className="gauge-row gauge-row--wrap" data-testid="risk-gauges">
      {riskGauges(props.detail.scores).map((g) => (
        <DonutGauge
          key={g.key}
          value={g.value}
          color={g.color}
          label={g.label}
          title={g.title}
          size={96}
        />
      ))}
    </div>
  );
}

function ReliabilityGauge(props: { readonly detail: ResultDetailDto; readonly size?: number }) {
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

export function ResultDetailPage(props: { readonly detail: ResultDetailDto }) {
  const { detail } = props;
  const { respondent, scores } = detail;
  const texts = resolveResultTexts(scores);
  const type = APTITUDE_TYPE_DEFINITIONS.find((t) => t.key === scores.aptitudeType);
  const typeLabel = type?.label ?? scores.aptitudeType;

  return (
    <ComparisonProvider resultId={detail.resultId}>
      <AiAnalysisProvider resultId={detail.resultId} initial={detail.aiAnalysis}>
        <div className="result-detail">
          <Link href="/admin" className="back-link">
            ← {ADMIN_TEXTS.backToResults}
          </Link>
          <div className="result-header">
            <h1>{ADMIN_TEXTS.resultTitle(respondent.name)}</h1>
            <div className="result-header__actions">
              <Suspense>
                <ComparisonScopeSelect />
              </Suspense>
              <AiAnalysisHeaderButton />
            </div>
          </div>
          <p className="result-subline">
            {RESPONDENT_KIND_LABELS[respondent.kind]} ／{" "}
            {getOccupationLabel(respondent.occupationCode)} ／ 回答日時{" "}
            {formatDateTime(detail.submittedAt)} <PopulationSummary />
          </p>

          {/* セクション 1 サマリー */}
          <section className="result-section" aria-labelledby="section-summary">
            <h2 id="section-summary">サマリー</h2>
            <div className="result-grid result-grid--7-5">
              <div className="panel">
                <h3>個別特性</h3>
                <div className="gauge-row">
                  <div className="grade-cell">
                    <p className="gauge-placeholder__label">評価</p>
                    <ComparisonGrade />
                  </div>
                  <ComparisonMatchGauge />
                  <ReliabilityGauge detail={detail} />
                </div>
                <TraitRadarWithComparison
                  subjectName={respondent.name}
                  subject={scores.traits}
                  width={CHART_SIZES.traitRadarSummary.width}
                  height={CHART_SIZES.traitRadarSummary.height}
                />
              </div>
              <div className="panel">
                <h3>タイプ</h3>
                <div className="type-card">
                  <Illustration
                    src={`/images/types/${scores.aptitudeType}.svg`}
                    alt={`${typeLabel}（${texts.characterName}）`}
                    width={200}
                    height={200}
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
              <div className="panel">
                <h3>比較対象内での立ち位置</h3>
                <ComparisonPosition />
              </div>
              <div className="panel">
                <h3>リスク</h3>
                <RiskGauges detail={detail} />
              </div>
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
                <div className="gauge-row">
                  <ComparisonMatchGauge />
                  <ReliabilityGauge detail={detail} />
                </div>
                <TraitRadarWithComparison
                  subjectName={respondent.name}
                  subject={scores.traits}
                  width={CHART_SIZES.traitRadarDetail.width}
                  height={CHART_SIZES.traitRadarDetail.height}
                />
              </div>
              <div className="panel" data-testid="trait-highlights">
                <h3>項目詳細</h3>
                {texts.allTraitsEqual ? (
                  <p className="muted">{ADMIN_TEXTS.allTraitsEqual}</p>
                ) : null}
                <h4>最も数値が高い項目</h4>
                <p data-testid="highest-trait">
                  <strong>{texts.highest.label}</strong>（
                  {formatStep(texts.highest.highlight.value)}）
                </p>
                <p>ポジティブ: {texts.highest.positive}</p>
                <p>ネガティブ: {texts.highest.negative}</p>
                <h4>最も数値が小さい項目</h4>
                <p data-testid="lowest-trait">
                  <strong>{texts.lowest.label}</strong>（{formatStep(texts.lowest.highlight.value)}
                  ）
                </p>
                <p>ポジティブ: {texts.lowest.positive}</p>
                <p>ネガティブ: {texts.lowest.negative}</p>
                <TraitListButton
                  traits={scores.traits}
                  highestKey={texts.highest.highlight.key}
                  lowestKey={texts.lowest.highlight.key}
                />
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

          {/* セクション 4 比較対象内での立ち位置・リスク（再掲） */}
          <section className="result-section" aria-labelledby="section-position">
            <h2 id="section-position">比較対象内での立ち位置・リスク</h2>
            <div className="result-grid result-grid--7-5">
              <div className="panel">
                <h3>比較対象内での立ち位置</h3>
                <ComparisonPosition />
              </div>
              <div className="panel">
                <h3>リスク</h3>
                <RiskGauges detail={detail} />
              </div>
            </div>
          </section>

          {/* セクション 5 育成方法 */}
          <DevelopmentSection
            subjectName={respondent.name}
            aptitudes={scores.aptitudes}
            first={texts.developmentFirst}
            second={texts.developmentSecond}
          />

          {/* セクション 6 ソーシャルスタイル */}
          <section className="result-section" aria-labelledby="section-style">
            <h2 id="section-style">ソーシャルスタイル</h2>
            <div className="result-grid result-grid--7-5">
              <div className="panel">
                <div className="style-card">
                  <Illustration
                    src={`/images/styles/${scores.socialStyle}.svg`}
                    alt={texts.style.greatPersonName}
                    width={160}
                    height={160}
                  />
                  <div>
                    <p className="type-card__name">{texts.style.typeName}</p>
                    <p className="muted">{texts.style.greatPersonName}</p>
                  </div>
                </div>
                <p className="pre-line">{texts.style.body}</p>
              </div>
              <div className="panel">
                <SocialStyleRadar subjectName={respondent.name} subject={scores.socialStyles} />
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

          {/* セクション 7 AI 解説 */}
          <AiAnalysisSection />
        </div>
      </AiAnalysisProvider>
    </ComparisonProvider>
  );
}
