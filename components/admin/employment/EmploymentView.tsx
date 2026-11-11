"use client";
// M-08 在籍・退職の本体（11-3 §2.1・§2.13〜§2.20）。初期データは Server Component（app/(admin)/admin/employment/page.tsx）が
// getEmployment で取得して渡す（取得の失敗は null で、見出しの位置に取得の失敗の文言だけを出す）。根の .ob-root の中の .ob-pg に見出し・
// 説明・タブ（分析・在籍者・退職者・求職者）と、分析か一覧（とその下の「回答一覧を開く →」）を描き、変更ダイアログは .ob-root の外
// （後ろ）に描く（§2.22）。
// 表示の状態（チームとタブ）は組織内分類と共用の view-state（ブラウザのメモリ。§2.18）から読む。チームは描くたびに今の人で正規化し
// （normalizeTeamFilter）、保存している値と違えば描画のあとに「すべて」に書き換える。在籍・退職にはチームの選択欄・札を出さず、
// タブの数・一覧・分析と分析の説明の「{チーム}の」に効く。
// 変更ダイアログの保存（§2.15 の 5〜7・§2.20）: ダイアログを閉じ、その人の区分・入社日・退職日を手元の値（代表の resultId ごと）で重ねて
// 送信中にし、丸形の通知（2.6 秒）を出してから PATCH /api/v1/admin/respondents/{id}（値が変わらなくても送る）。成功は読み直し
// （router.refresh。タブ・チームは保つ）、失敗は手元の値を前の値に戻してエラーの通知（404 は読み直す）。読み直しで初期データが
// 変わったら、送信中でない人の手元の値を捨てる。時間ごとの読み直しはしない。氏名をログ・ストレージに出さない
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmploymentEditDialog, type EmploymentEditTarget } from "./EmploymentEditDialog";
import { EmploymentList } from "./EmploymentList";
import { RetentionAnalysis } from "./RetentionAnalysis";
import {
  setTab,
  setTeam,
  useClassificationViewState,
} from "@/components/admin/classification/view-state";
import { useToast } from "@/components/ui/Toast";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { EMPLOYMENT_SCREEN_TEXTS } from "@/lib/presentation/classification-texts";
import { filterByTeam, normalizeTeamFilter } from "@/lib/presentation/classification-view";
import type { Employment } from "@/lib/presentation/employment";
import { RESULT_LIST_TEXTS } from "@/lib/presentation/result-list-texts";
import {
  analysisTeamPrefix,
  EMPLOYMENT_TABS,
  sortForTab,
  tabCounts,
  tabOf,
} from "@/lib/presentation/retention";
import type { EmploymentDto, EmploymentPersonDto } from "@/lib/services/dto/admin";
import { AdminApiError, updatePerson } from "@/lib/utils/admin-api";

const NO_PEOPLE: readonly EmploymentPersonDto[] = [];
/** 保存の通知の表示の時間（11-3 §2.20。参照元どおり） */
const SAVED_TOAST_MS = 2600;

export function EmploymentView(props: {
  /** GET /api/v1/admin/employment と同じ人と基準日。サーバでの取得に失敗したときは null */
  readonly initial: EmploymentDto | null;
}) {
  const t = EMPLOYMENT_SCREEN_TEXTS;
  const router = useRouter();
  const toast = useToast();
  const viewState = useClassificationViewState();
  const { initial } = props;
  const loaded = initial !== null;
  const today = initial?.today ?? "";

  // ---- 手元の値（代表の resultId ごとの区分・入社日・退職日）と送信中の人
  const overridesRef = useRef<ReadonlyMap<string, Employment>>(new Map());
  const [overrides, setOverrides] = useState<ReadonlyMap<string, Employment>>(overridesRef.current);
  const pendingRef = useRef<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<ReadonlySet<string>>(pendingRef.current);
  const commitOverrides = (next: ReadonlyMap<string, Employment>) => {
    overridesRef.current = next;
    setOverrides(next);
  };
  const setPersonPending = (resultId: string, busy: boolean) => {
    const next = new Set(pendingRef.current);
    if (busy) next.add(resultId);
    else next.delete(resultId);
    pendingRef.current = next;
    setPending(next);
  };

  // 読み直しで初期データが変わったら、送信中でない人の手元の値を捨てる（サーバの値で表示し直す）
  useEffect(() => {
    const current = overridesRef.current;
    if (current.size === 0) return;
    const kept = new Map([...current].filter(([id]) => pendingRef.current.has(id)));
    if (kept.size !== current.size) commitOverrides(kept);
  }, [initial]);

  const people = useMemo(
    () =>
      (initial?.people ?? NO_PEOPLE).map((person) => {
        const override = overrides.get(person.resultId);
        return override
          ? {
              ...person,
              employmentStatus: override.status,
              hiredOn: override.hiredOn,
              leftOn: override.leftOn,
            }
          : person;
      }),
    [initial, overrides],
  );

  // チームの正規化（§2.7・§2.18）。選んでいたチームが選択肢に無ければ「すべて」で描き、保存している値も書き換える
  // （取得に失敗したときは人がいないので、保存している値を変えない）
  const team = normalizeTeamFilter(viewState.team, people);
  useEffect(() => {
    if (loaded && viewState.team !== team) setTeam(team);
  }, [loaded, viewState.team, team]);

  const tab = viewState.tab;
  const teamPeople = useMemo(() => filterByTeam(people, team), [people, team]);
  const counts = useMemo(() => tabCounts(teamPeople), [teamPeople]);
  const listPeople = useMemo(
    () =>
      tab === "an"
        ? NO_PEOPLE
        : sortForTab(
            teamPeople.filter((person) => tabOf(person.employmentStatus) === tab),
            today,
          ),
    [teamPeople, tab, today],
  );

  // ---- 変更ダイアログ（その人・押した「変更」・開くたびに変わる値）。今のタブのボタンは焦点の代わりの移し先
  const [edit, setEdit] = useState<{
    readonly person: EmploymentPersonDto;
    readonly target: EmploymentEditTarget;
    readonly opener: HTMLButtonElement;
    readonly openKey: number;
  } | null>(null);
  const editOpenCount = useRef(0);
  const selectedTabRef = useRef<HTMLButtonElement>(null);

  const openEdit = (person: EmploymentPersonDto, button: HTMLButtonElement) => {
    if (pendingRef.current.has(person.resultId)) return; // 送信中（aria-disabled）は何もしない
    editOpenCount.current += 1;
    setEdit({
      person,
      target: {
        name: person.name,
        employment: {
          status: person.employmentStatus,
          hiredOn: person.hiredOn,
          leftOn: person.leftOn,
        },
      },
      opener: button,
      openKey: editOpenCount.current,
    });
  };

  /** ダイアログの保存（§2.15 の 5〜7）。ダイアログは閉じてから呼ばれる */
  async function save(person: EmploymentPersonDto, value: Employment) {
    const id = person.resultId;
    setEdit(null);
    if (pendingRef.current.has(id)) return;
    const before = overridesRef.current.get(id);
    commitOverrides(new Map(overridesRef.current).set(id, value));
    setPersonPending(id, true);
    toast.show(t.toast.saved(person.name), { shape: "pill", durationMs: SAVED_TOAST_MS });
    try {
      await updatePerson(person.respondentId, { employment: value });
      setPersonPending(id, false);
      router.refresh();
    } catch (error) {
      const reverted = new Map(overridesRef.current);
      if (before === undefined) reverted.delete(id);
      else reverted.set(id, before);
      commitOverrides(reverted);
      setPersonPending(id, false);
      toast.show(
        error instanceof AdminApiError ? error.message : ADMIN_TEXTS.networkError,
        "error",
      );
      if (
        error instanceof AdminApiError &&
        (error.code === "RESPONDENT_NOT_FOUND" || error.code === "RESULT_NOT_FOUND")
      ) {
        router.refresh();
      }
    }
  }

  return (
    <>
      <div className="ob-root">
        {initial === null ? (
          <p className="ob-load-failed">{RESULT_LIST_TEXTS.loadFailed}</p>
        ) : (
          <div className="ob-pg">
            <h1>{t.title}</h1>
            <p className="pg-sub">{t.description}</p>
            <div className="pg-tabs">
              {EMPLOYMENT_TABS.map((key) => (
                <button
                  key={key}
                  ref={key === tab ? selectedTabRef : undefined}
                  type="button"
                  className={key === tab ? "on" : undefined}
                  aria-pressed={key === tab}
                  data-testid={`em-tab-${key}`}
                  onClick={() => setTab(key)}
                >
                  {t.tabs[key]}
                  {key === "an" ? null : <b>{counts[key]}</b>}
                </button>
              ))}
            </div>
            {tab === "an" ? (
              <RetentionAnalysis
                people={teamPeople}
                today={initial.today}
                teamPrefix={analysisTeamPrefix(team)}
              />
            ) : (
              <>
                <EmploymentList
                  tab={tab}
                  people={listPeople}
                  today={initial.today}
                  pending={pending}
                  onEdit={openEdit}
                />
                <Link className="pg-go" href="/admin">
                  {t.list.goList}
                </Link>
              </>
            )}
          </div>
        )}
      </div>
      <EmploymentEditDialog
        target={edit?.target ?? null}
        openKey={edit?.openKey ?? 0}
        opener={edit?.opener ?? null}
        fallbackFocusRef={selectedTabRef}
        onClose={() => setEdit(null)}
        onSave={(value) => {
          if (edit !== null) void save(edit.person, value);
        }}
      />
    </>
  );
}
