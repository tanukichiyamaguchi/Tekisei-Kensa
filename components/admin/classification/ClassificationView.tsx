"use client";
// M-06 組織内分類の本体（11-3 §2.1・§2.5〜§2.12・§2.18〜§2.20）。初期データは Server Component（app/(admin)/admin/classification/page.tsx）が
// getClassification で取得して渡す（取得の失敗は null）。根の .ob-root に見出し行と、集計カード・説明文・マップの section を描き、
// 詳細パネルと「組織内分類とは」は .ob-root の外（後ろ）に描く（§2.22）。
// 表示の状態（チーム・対象・折りたたみ）は view-state（ブラウザのメモリ。§2.18）から読み、描くたびにチームを今の人で正規化し
// （normalizeTeamFilter）、保存している値と違えば描画のあとに「すべて」に書き換える。パネルの中身と最初に開いた要素、ポップアップの開閉は
// この部品の状態。利用履歴ボタンは置かない（zaiseki-25）。書き込みの操作が無いので通知を出さず、時間ごとの読み直しもしない（§2.20）
import { useEffect, useMemo, useRef, useState } from "react";

import { ClassificationAboutDialog } from "./ClassificationAboutDialog";
import { ClassificationMap } from "./ClassificationMap";
import { ClassificationPanel, type ClassificationPanelTarget } from "./ClassificationPanel";
import { ClassificationSummary } from "./ClassificationSummary";
import { setTeam, useClassificationViewState } from "./view-state";
import { CLASSIFICATION_SCREEN_TEXTS } from "@/lib/presentation/classification-texts";
import {
  normalizeTeamFilter,
  summarizeClassification,
  teamChoices,
} from "@/lib/presentation/classification-view";
import { RESULT_LIST_TEXTS } from "@/lib/presentation/result-list-texts";
import type { AptitudeTypeKey, SocialStyleKey } from "@/lib/scoring/types";
import type { ClassificationDto, ClassificationPersonDto } from "@/lib/services/dto/admin";

const NO_PEOPLE: readonly ClassificationPersonDto[] = [];

export function ClassificationView(props: {
  /** GET /api/v1/admin/classification と同じ人の一覧。サーバでの取得に失敗したときは null */
  readonly initial: ClassificationDto | null;
}) {
  const t = CLASSIFICATION_SCREEN_TEXTS;
  const viewState = useClassificationViewState();
  const people = props.initial?.people ?? NO_PEOPLE;

  // チームの正規化（§2.7・§2.18）。選んでいたチームが選択肢に無ければ「すべて」で描き、保存している値も書き換える
  // （取得に失敗したときは人がいないので、保存している値を変えない）
  const loaded = props.initial !== null;
  const team = normalizeTeamFilter(viewState.team, people);
  useEffect(() => {
    if (loaded && viewState.team !== team) setTeam(team);
  }, [loaded, viewState.team, team]);

  const choices = useMemo(() => teamChoices(people), [people]);
  const summary = useMemo(
    () => summarizeClassification(people, team, viewState.mode),
    [people, team, viewState.mode],
  );

  // 詳細パネル（中身と最初に開いた要素）と「組織内分類とは」
  const [panel, setPanel] = useState<{
    readonly target: ClassificationPanelTarget;
    readonly opener: HTMLElement;
  } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const helpRef = useRef<HTMLButtonElement>(null);

  const openQuadrant = (quadrant: SocialStyleKey, opener: HTMLElement) =>
    setPanel({ target: { kind: "quadrant", quadrant }, opener });
  const openType = (type: AptitudeTypeKey, opener: HTMLElement) =>
    setPanel({ target: { kind: "type", type }, opener });
  // 分類のパネルの 4 タイプのボタン: キャラクターのパネルに切り替える（焦点を戻す先は最初に開いた要素のまま）
  const switchToType = (type: AptitudeTypeKey) =>
    setPanel((current) => (current ? { ...current, target: { kind: "type", type } } : current));

  return (
    <>
      <div className="ob-root">
        <div className="ob-head">
          <h1>{t.title}</h1>
          <button
            ref={helpRef}
            type="button"
            className="ob-help"
            onClick={() => setAboutOpen(true)}
          >
            <span className="qm" aria-hidden="true">
              {t.helpMark}
            </span>
            <span className="tx">{t.help}</span>
          </button>
        </div>
        {!loaded ? (
          <p className="ob-load-failed">{RESULT_LIST_TEXTS.loadFailed}</p>
        ) : (
          <section aria-label={t.summary.mapLabel}>
            <ClassificationSummary
              summary={summary}
              teamChoices={choices}
              team={team}
              mode={viewState.mode}
              onOpenQuadrant={openQuadrant}
            />
            <p className="ob-note">{t.note}</p>
            <ClassificationMap
              summary={summary}
              folds={viewState.folds}
              onOpenQuadrant={openQuadrant}
              onOpenType={openType}
            />
          </section>
        )}
      </div>
      <ClassificationPanel
        target={panel?.target ?? null}
        opener={panel?.opener ?? null}
        people={people}
        team={team}
        mode={viewState.mode}
        summary={summary}
        onSelectType={switchToType}
        onClose={() => setPanel(null)}
      />
      <ClassificationAboutDialog
        open={aboutOpen}
        openerRef={helpRef}
        onClose={() => setAboutOpen(false)}
      />
    </>
  );
}
