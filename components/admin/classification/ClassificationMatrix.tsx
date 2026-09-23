"use client";
// M-06 組織内分類のマトリクス、P-04 分類の説明、P-05 該当者一覧（06 §3.6）
import Link from "next/link";
import { useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { Illustration } from "@/components/ui/Illustration";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { SOCIAL_STYLE_DEFINITIONS } from "@/lib/masters/indicators/social-styles";
import {
  CLASSIFICATION_AXES,
  CLASSIFICATION_EMPTY_MESSAGE,
  CLASSIFICATION_TEXTS,
  TYPE_TEXTS,
} from "@/lib/masters/texts";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { formatDateTime } from "@/lib/presentation/format-datetime";
import type { AptitudeTypeKey, SocialStyleKey } from "@/lib/scoring/types";
import type { ClassificationDto } from "@/lib/services/dto/admin";

type StyleEntry = ClassificationDto["styles"][number];
type TypeEntry = StyleEntry["types"][number];

// 2×2 の配置（06 §3.6.1 D06-17）: 上段が感情を抑える、左列が意見を聞く
const LAYOUT: ReadonlyArray<ReadonlyArray<SocialStyleKey>> = [
  ["analytical", "driving"],
  ["amiable", "expressive"],
];

const STYLE_DEFS = new Map(SOCIAL_STYLE_DEFINITIONS.map((s) => [s.key, s]));
const TYPE_DEFS = new Map(APTITUDE_TYPE_DEFINITIONS.map((t) => [t.key, t]));

export function ClassificationMatrix(props: { readonly data: ClassificationDto }) {
  const byStyle = new Map(props.data.styles.map((s) => [s.socialStyle, s]));
  const [styleOpen, setStyleOpen] = useState<SocialStyleKey | null>(null);
  const [typeOpen, setTypeOpen] = useState<TypeEntry | null>(null);

  return (
    <>
      <div className="classification">
        <div className="classification__axis classification__axis--top">
          <span>{CLASSIFICATION_AXES.assertion.listen}</span>
          <span>{CLASSIFICATION_AXES.assertion.assert}</span>
        </div>
        <div className="classification__body">
          <div className="classification__axis classification__axis--side">
            <span>{CLASSIFICATION_AXES.emotion.suppress}</span>
            <span>{CLASSIFICATION_AXES.emotion.express}</span>
          </div>
          <div className="classification__grid">
            {LAYOUT.flat().map((key) => {
              const entry = byStyle.get(key);
              return entry ? (
                <StyleCard
                  key={key}
                  entry={entry}
                  onStyle={() => setStyleOpen(key)}
                  onType={(t) => setTypeOpen(t)}
                />
              ) : null;
            })}
          </div>
        </div>
        <p className="muted">全 {props.data.total} 名</p>
      </div>

      <Dialog
        open={styleOpen !== null}
        title={
          styleOpen
            ? `${STYLE_DEFS.get(styleOpen)?.labelEn}タイプ（${STYLE_DEFS.get(styleOpen)?.labelJa}）`
            : ""
        }
        onClose={() => setStyleOpen(null)}
      >
        <p className="pre-line">{styleOpen ? CLASSIFICATION_TEXTS[styleOpen].description : ""}</p>
      </Dialog>

      <Dialog
        open={typeOpen !== null}
        title={typeOpen ? typeTitle(typeOpen.aptitudeType) : ""}
        wide
        onClose={() => setTypeOpen(null)}
      >
        {typeOpen ? <MemberList entry={typeOpen} /> : null}
      </Dialog>
    </>
  );
}

function typeTitle(type: AptitudeTypeKey): string {
  const def = TYPE_DEFS.get(type);
  return `${def?.characterNameHiragana ?? ""}（${def?.shortLabel ?? ""}タイプ）`;
}

function StyleCard(props: {
  readonly entry: StyleEntry;
  readonly onStyle: () => void;
  readonly onType: (entry: TypeEntry) => void;
}) {
  const { entry } = props;
  const def = STYLE_DEFS.get(entry.socialStyle);
  const types = new Map(entry.types.map((t) => [t.aptitudeType, t]));
  return (
    <section
      className={`classification-card classification-card--${entry.socialStyle}`}
      data-testid={`classification-${entry.socialStyle}`}
    >
      <button type="button" className="classification-card__title" onClick={props.onStyle}>
        <span className="classification-card__name">
          {def?.labelEn} {def?.labelJa}
        </span>
        <span className="classification-card__count" data-testid="style-count">
          {entry.count} 名
        </span>
      </button>
      <ul className="classification-card__types">
        {CLASSIFICATION_TEXTS[entry.socialStyle].characterOrder.map((typeKey) => {
          const t = types.get(typeKey);
          const typeDef = TYPE_DEFS.get(typeKey);
          if (!t || !typeDef) return null;
          return (
            <li key={typeKey}>
              <button type="button" className="character" onClick={() => props.onType(t)}>
                <Illustration
                  src={`/images/types/${typeKey}.svg`}
                  alt={typeDef.characterNameHiragana}
                  width={96}
                  height={96}
                />
                <span className="character__name">{typeDef.characterNameHiragana}</span>
                <span className="muted small">{typeDef.shortLabel}</span>
                <span className="character__count">{t.count} 名</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MemberList(props: { readonly entry: TypeEntry }) {
  const { entry } = props;
  return (
    <>
      <p className="type-card__heading">{TYPE_TEXTS[entry.aptitudeType].aptitudeHeading}</p>
      {entry.members.length === 0 ? (
        <p>{CLASSIFICATION_EMPTY_MESSAGE}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">氏名</th>
              <th scope="col">回答日時</th>
            </tr>
          </thead>
          <tbody>
            {entry.members.map((m) => (
              <tr key={m.resultId}>
                <td>
                  <Link href={`/admin/results/${m.resultId}`}>{m.name}</Link>{" "}
                  {m.isExcluded ? <span className="badge">{ADMIN_TEXTS.excludedBadge}</span> : null}
                </td>
                <td className="data-table__nowrap">{formatDateTime(m.submittedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
