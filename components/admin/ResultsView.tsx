"use client";
// M-04 回答一覧の本体（11-2 §2.1・§2.21・§2.23・§2.25・§3.12）。初期データは Server Component（app/(admin)/admin/page.tsx）が
// listResultRows で取得して渡す（取得の失敗は null）。区分・検索語・チーム・並び順は画面の状態に持ち、sessionStorage の ad-filter に
// 保存して開き直したときに戻す（§2.21。マウントの直後に 1 回。サーバで描いた最初の表示は既定の状態）。
// 変更（チーム・除外・区分・日付・役職）は、表示をすぐ変え（代表の resultId ごとの上書き）、行を送信中にして PATCH を送り、同時に通知を
// 出す。成功は読み直し（router.refresh。メニューが開いている間は待つ）、失敗は上書きを戻してエラーの通知（§2.23）。自動の読み直しはしない。
// window と sessionStorage には effect とイベントの中でだけ触れる
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { UsageLogDialog } from "./UsageLogDialog";
import { copyResultListLink } from "./results/copy-link";
import { EmploymentDatesDialog, type EmploymentDatesTarget } from "./results/EmploymentDatesDialog";
import { EmptyState } from "./results/EmptyState";
import { ClockIcon, FileIcon, TrashIcon } from "./results/icons";
import { ListHeader } from "./results/ListHeader";
import { ListTools } from "./results/ListTools";
import { personDisplayName, PersonRows, resultHref } from "./results/PersonRows";
import { PopupMenu, type PopupMenuSection } from "./results/PopupMenu";
import { StatCards } from "./results/StatCards";
import { useToast } from "@/components/ui/Toast";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import {
  EMPLOYMENT_STATUS_LABELS,
  employmentFromMenu,
  STAFF_ROLE_LABELS,
  todayInTokyo,
  type Employment,
  type EmploymentStatus,
  type StaffRole,
} from "@/lib/presentation/employment";
import {
  clearFilters,
  computeListStats,
  DEFAULT_LIST_FILTER,
  emptyStateKind,
  filterAndSortRows,
  LIST_FILTER_STORAGE_KEY,
  LIST_PAGE_STEP,
  parseStoredFilter,
  rowMenuModel,
  SEARCH_DEBOUNCE_MS,
  usedTeamCodes,
  type ListFilterState,
  type ListSegment,
  type ListSort,
} from "@/lib/presentation/result-list-view";
import { RESULT_LIST_TEXTS, type ResultListLinkKind } from "@/lib/presentation/result-list-texts";
import type { TeamCode } from "@/lib/scoring/types";
import type { ResultListDto, ResultListRowDto } from "@/lib/services/dto/admin";
import { AdminApiError, deleteRespondent, updatePerson } from "@/lib/utils/admin-api";

/** 削除の通知の表示の時間（11-2 §2.20。ほかの通知は Toast の既定 2.2 秒） */
const DELETED_TOAST_MS = 2000;
const STATUS_ORDER: readonly EmploymentStatus[] = ["candidate", "employed", "left"];
const ROLE_ORDER: readonly StaffRole[] = ["manager", "leader", "staff"];

/** 開いているメニュー（画面に 1 つだけ。§2.12） */
type MenuState =
  | { readonly kind: "more"; readonly anchor: HTMLElement; readonly resultId: string }
  | { readonly kind: "status"; readonly anchor: HTMLElement; readonly resultId: string }
  | { readonly kind: "link"; readonly anchor: HTMLElement };

/** 表示の上書き（代表の resultId ごと。PATCH の成功で読み直すまで、押した直後の値を出す） */
type RowOverride = Partial<
  Pick<
    ResultListRowDto,
    "teamCode" | "isExcluded" | "employmentStatus" | "hiredOn" | "leftOn" | "staffRole"
  >
>;

/** PATCH /api/v1/admin/respondents/{id} の本文（1 回に 1 項目。§2.23） */
type PersonPatch = Parameters<typeof updatePerson>[1];

function employmentOf(row: ResultListRowDto): Employment {
  return { status: row.employmentStatus, hiredOn: row.hiredOn, leftOn: row.leftOn };
}

function saveFilter(filter: ListFilterState): void {
  try {
    window.sessionStorage.setItem(LIST_FILTER_STORAGE_KEY, JSON.stringify(filter));
  } catch {
    // ストレージが使えない環境では保存しないだけ（§2.21）
  }
}

export interface ResultsViewProps {
  /** GET /api/v1/admin/results と同じ全行。サーバでの取得に失敗したときは null */
  readonly initial: ResultListDto | null;
  /** オーナー（owner・super_admin） */
  readonly canViewExecutives: boolean;
  /** 利用履歴の見出しの組織名 */
  readonly organizationName: string;
  /** 回答リンク（MeDto.links の 2 つ） */
  readonly links: { readonly applicant: string; readonly executive: string };
}

export function ResultsView({
  initial,
  canViewExecutives,
  organizationName,
  links,
}: ResultsViewProps) {
  const router = useRouter();
  const toast = useToast();
  const texts = RESULT_LIST_TEXTS;

  // ---- 絞り込みの状態（§2.21）と表示の上限（§2.8）
  const [filter, setFilter] = useState<ListFilterState>(DEFAULT_LIST_FILTER);
  const filterRef = useRef<ListFilterState>(DEFAULT_LIST_FILTER);
  const [searchText, setSearchText] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [limit, setLimit] = useState(LIST_PAGE_STEP);

  // ---- メニュー・ダイアログ
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuOpen = useRef(false);
  const refreshPending = useRef(false);
  const [dates, setDates] = useState<{
    readonly row: ResultListRowDto;
    readonly target: EmploymentDatesTarget;
    readonly openKey: number;
  } | null>(null);
  const datesOpenCount = useRef(0);
  const [deleteTarget, setDeleteTarget] = useState<ResultListRowDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);

  // ---- 表示の上書きと送信中の行（代表の resultId）
  const overridesRef = useRef<ReadonlyMap<string, RowOverride>>(new Map());
  const [overrides, setOverrides] = useState<ReadonlyMap<string, RowOverride>>(
    overridesRef.current,
  );
  const pendingRef = useRef<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<ReadonlySet<string>>(pendingRef.current);

  const commitOverrides = (next: ReadonlyMap<string, RowOverride>) => {
    overridesRef.current = next;
    setOverrides(next);
  };
  const setRowPending = (resultId: string, busy: boolean) => {
    const next = new Set(pendingRef.current);
    if (busy) next.add(resultId);
    else next.delete(resultId);
    pendingRef.current = next;
    setPending(next);
  };

  // 開き直したときに状態を戻す（§2.21。最初の描画のあと 1 回）
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(LIST_FILTER_STORAGE_KEY);
    } catch {
      // ストレージが使えない環境では戻さない
    }
    const restored = parseStoredFilter(raw);
    filterRef.current = restored;
    setFilter(restored);
    setSearchText(restored.q);
  }, []);

  useEffect(
    () => () => {
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    },
    [],
  );

  // 新しい基準時刻（読み直し）が来たら、送信中でない行の上書きを捨てる（サーバの値で表示し直す）
  const generatedAt = initial?.generatedAt ?? null;
  useEffect(() => {
    const current = overridesRef.current;
    if (current.size === 0) return;
    const kept = new Map([...current].filter(([id]) => pendingRef.current.has(id)));
    if (kept.size !== current.size) commitOverrides(kept);
  }, [generatedAt]);

  const applyFilter = (next: ListFilterState, resetLimit: boolean) => {
    filterRef.current = next;
    setFilter(next);
    saveFilter(next);
    if (resetLimit) setLimit(LIST_PAGE_STEP);
  };

  // ---- 読み直し（§2.23）。メニューが開いている間は待ち、閉じたあとに行う
  const refresh = useCallback(() => {
    if (menuOpen.current) {
      refreshPending.current = true;
      return;
    }
    router.refresh();
  }, [router]);
  const openMenu = (next: MenuState) => {
    menuOpen.current = true;
    setMenu(next);
  };
  const closeMenu = useCallback(() => {
    menuOpen.current = false;
    setMenu(null);
    if (refreshPending.current) {
      refreshPending.current = false;
      router.refresh();
    }
  }, [router]);

  // ---- 行（上書きを当てた全行）と集計
  const rows = useMemo(
    () =>
      (initial?.rows ?? []).map((row) => {
        const override = overrides.get(row.resultId);
        return override ? { ...row, ...override } : row;
      }),
    [initial, overrides],
  );
  const now = useMemo(() => new Date(initial?.generatedAt ?? 0), [initial]);
  const stats = useMemo(() => computeListStats(rows, now), [rows, now]);
  const visible = useMemo(() => filterAndSortRows(rows, filter, now), [rows, filter, now]);
  const teamCodes = useMemo(() => usedTeamCodes(rows), [rows]);
  const shown = visible.slice(0, limit);

  // ---- 操作
  const openResult = (resultId: string) => router.push(resultHref(resultId));

  const copyLink = (kind: ResultListLinkKind) => {
    void copyResultListLink(kind, links[kind], {
      clipboard: "clipboard" in navigator ? navigator.clipboard : undefined,
      isSecureContext: window.isSecureContext,
      prompt: (message, value) => {
        window.prompt(message, value);
      },
      notify: (message) => toast.show(message),
    });
  };

  /** 表示をすぐ変え、PATCH を送り、同時に通知を出す（§2.20・§2.23）。送信中の行には送らない */
  async function updateRow(
    row: ResultListRowDto,
    patch: PersonPatch,
    display: RowOverride,
    message: string,
  ) {
    const id = row.resultId;
    if (pendingRef.current.has(id)) return;
    const before = overridesRef.current.get(id);
    setRowPending(id, true);
    commitOverrides(new Map(overridesRef.current).set(id, { ...before, ...display }));
    toast.show(message);
    try {
      await updatePerson(row.respondentId, patch);
      setRowPending(id, false);
      refresh();
    } catch (error) {
      const reverted = new Map(overridesRef.current);
      if (before === undefined) reverted.delete(id);
      else reverted.set(id, before);
      commitOverrides(reverted);
      setRowPending(id, false);
      toast.show(
        error instanceof AdminApiError ? error.message : ADMIN_TEXTS.networkError,
        "error",
      );
      if (
        error instanceof AdminApiError &&
        (error.code === "RESPONDENT_NOT_FOUND" || error.code === "RESULT_NOT_FOUND")
      ) {
        refresh();
      }
    }
  }

  const onTeamChange = (row: ResultListRowDto, value: "" | TeamCode) => {
    const teamCode = value === "" ? null : value;
    const name = personDisplayName(row);
    void updateRow(
      row,
      { teamCode },
      { teamCode },
      teamCode === null ? texts.toast.teamCleared(name) : texts.toast.teamChanged(name, teamCode),
    );
  };

  const onExcludeToggle = (row: ResultListRowDto) => {
    const isExcluded = !row.isExcluded;
    const name = personDisplayName(row);
    void updateRow(
      row,
      { isExcluded },
      { isExcluded },
      isExcluded ? texts.toast.excluded(name) : texts.toast.included(name),
    );
  };

  const onStatusChoose = (row: ResultListRowDto, chosen: EmploymentStatus) => {
    // 同じ区分なら何もしない。退職の退職日の既定は操作した時点の Asia/Tokyo の日付（§2.13）
    const value = employmentFromMenu(employmentOf(row), chosen, todayInTokyo(new Date()));
    if (value === null) return;
    void updateRow(
      row,
      { employment: value },
      { employmentStatus: value.status, hiredOn: value.hiredOn, leftOn: value.leftOn },
      texts.toast.statusChanged(personDisplayName(row), chosen),
    );
  };

  const onRoleChoose = (row: ResultListRowDto, role: StaffRole) => {
    // 今と同じ役職でも送る（§2.15）
    void updateRow(
      row,
      { staffRole: role },
      { staffRole: role },
      texts.toast.roleChanged(personDisplayName(row), role),
    );
  };

  const openDates = (row: ResultListRowDto) => {
    datesOpenCount.current += 1;
    setDates({
      row,
      target: { name: personDisplayName(row), employment: employmentOf(row) },
      openKey: datesOpenCount.current,
    });
  };

  const onDatesSave = (value: Employment) => {
    if (!dates) return;
    const row = dates.row;
    setDates(null);
    // 値が変わらなくても送り、通知を出す（§2.14）
    void updateRow(
      row,
      { employment: value },
      { employmentStatus: value.status, hiredOn: value.hiredOn, leftOn: value.leftOn },
      texts.toast.datesSaved(personDisplayName(row)),
    );
  };

  const openDelete = (row: ResultListRowDto) => {
    setDeleteError(null);
    setDeleteTarget(row);
  };

  async function confirmDelete() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteRespondent(deleteTarget.respondentId);
      setDeleteTarget(null);
      toast.show(texts.toast.deletedBody, {
        title: texts.toast.deletedTitle,
        durationMs: DELETED_TOAST_MS,
      });
      refresh();
    } catch (error) {
      if (error instanceof AdminApiError && error.code === "RESPONDENT_NOT_FOUND") {
        // ほかのタブなどで削除済み（§2.16）
        setDeleteTarget(null);
        toast.show(ADMIN_TEXTS.alreadyDeleted, "error");
        refresh();
      } else {
        setDeleteError(error instanceof AdminApiError ? error.message : ADMIN_TEXTS.networkError);
      }
    } finally {
      setDeleteBusy(false);
    }
  }

  // ---- 絞り込みの操作（§2.6・§2.7）
  const onSegment = (seg: ListSegment) => applyFilter({ ...filterRef.current, seg }, true);
  const onSearchInput = (text: string) => {
    setSearchText(text);
    setLimit(LIST_PAGE_STEP);
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      applyFilter({ ...filterRef.current, q: text }, false);
    }, SEARCH_DEBOUNCE_MS);
  };
  const onTeamFilter = (team: ListFilterState["team"]) =>
    applyFilter({ ...filterRef.current, team }, true);
  const onSort = (sort: ListSort) => applyFilter({ ...filterRef.current, sort }, false);
  const onClear = () => {
    if (searchTimer.current !== null) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
    setSearchText("");
    applyFilter(clearFilters(filterRef.current), false);
  };

  // ---- メニューの中身（§2.12・§2.13・§2.17）
  const statusSection = (row: ResultListRowDto, current: EmploymentStatus): PopupMenuSection => ({
    key: "status",
    heading: texts.menu.changeStatus,
    items: STATUS_ORDER.map((status) => ({
      key: status,
      label: EMPLOYMENT_STATUS_LABELS[status],
      note: status === current ? texts.menu.currentStatus : null,
      onSelect: () => onStatusChoose(row, status),
    })),
  });
  const datesSection = (row: ResultListRowDto): PopupMenuSection => ({
    key: "dates",
    heading: null,
    items: [
      {
        key: "dates",
        label: texts.menu.editDates,
        icon: <ClockIcon />,
        onSelect: () => openDates(row),
      },
    ],
  });

  const menuSections = (state: MenuState): readonly PopupMenuSection[] | null => {
    if (state.kind === "link") {
      return [
        {
          key: "link",
          heading: texts.linkMenu.heading,
          items: (["applicant", "executive"] as const).map((kind) => ({
            key: kind,
            label: texts.linkKinds[kind],
            note: texts.linkMenu.note[kind],
            onSelect: () => copyLink(kind),
          })),
        },
      ];
    }
    const row = rows.find((r) => r.resultId === state.resultId);
    if (!row) return null;
    if (state.kind === "status")
      return [statusSection(row, row.employmentStatus), datesSection(row)];
    const model = rowMenuModel(row);
    const sections: PopupMenuSection[] = [];
    if (model.previous.length > 0) {
      sections.push({
        key: "previous",
        heading: texts.menu.previous,
        items: model.previous.map((exam) => ({
          key: exam.resultId,
          label: texts.menu.openNth(exam.k),
          note: exam.dateLabel,
          icon: <FileIcon />,
          onSelect: () => openResult(exam.resultId),
        })),
      });
    }
    sections.push(datesSection(row));
    sections.push(statusSection(row, model.currentStatus));
    sections.push({
      key: "role",
      heading: texts.menu.changeRole,
      items: ROLE_ORDER.map((role) => ({
        key: role,
        label: STAFF_ROLE_LABELS[role],
        note: role === model.currentRole ? texts.menu.currentRole : null,
        onSelect: () => onRoleChoose(row, role),
      })),
    });
    sections.push({
      key: "delete",
      heading: null,
      items: [
        {
          key: "delete",
          label: texts.menu.deleteExam,
          note: model.deleteNote,
          icon: <TrashIcon />,
          danger: true,
          onSelect: () => openDelete(row),
        },
      ],
    });
    return sections;
  };
  const sections = menu === null ? null : menuSections(menu);
  // メニューの行が無くなったとき（ほかの契機で読み直した）は閉じる
  useEffect(() => {
    if (menu !== null && sections === null) closeMenu();
  }, [menu, sections, closeMenu]);

  return (
    <div className="rl-root">
      <ListHeader
        canViewExecutives={canViewExecutives}
        onOpenUsageLogs={() => setUsageOpen(true)}
        onOpenLinkMenu={(anchor) => openMenu({ kind: "link", anchor })}
        onCopyApplicantLink={() => copyLink("applicant")}
      />
      {initial === null ? (
        <p className="rl-load-failed">{texts.loadFailed}</p>
      ) : (
        <>
          <StatCards
            stats={stats}
            canViewExecutives={canViewExecutives}
            onShowOneYear={() => onSegment("old")}
          />
          <ListTools
            filter={filter}
            searchText={searchText}
            stats={stats}
            teamCodes={teamCodes}
            shownCount={visible.length}
            onSegment={onSegment}
            onSearchInput={onSearchInput}
            onTeam={onTeamFilter}
            onSort={onSort}
            onClear={onClear}
          />
          {shown.length === 0 ? (
            <EmptyState kind={emptyStateKind(filter)} onClear={onClear} onCopyLink={copyLink} />
          ) : (
            <PersonRows
              rows={shown}
              now={now}
              pending={pending}
              onOpenResult={openResult}
              onTeamChange={onTeamChange}
              onExcludeToggle={onExcludeToggle}
              onOpenStatusMenu={(row, anchor) =>
                openMenu({ kind: "status", anchor, resultId: row.resultId })
              }
              onOpenMoreMenu={(row, anchor) =>
                openMenu({ kind: "more", anchor, resultId: row.resultId })
              }
            />
          )}
          {visible.length > limit ? (
            <div className="rl-show-more">
              <button
                type="button"
                className="rl-btn rl-btn--plain"
                onClick={() => setLimit((current) => current + LIST_PAGE_STEP)}
              >
                {texts.table.showMore(visible.length - limit)}
              </button>
            </div>
          ) : null}
          {shown.length > 0 ? <p className="rl-note">{texts.table.footnote}</p> : null}
        </>
      )}
      {menu !== null && sections !== null ? (
        <PopupMenu
          key={menu.kind === "link" ? "link" : `${menu.kind}:${menu.resultId}`}
          anchor={menu.anchor}
          placement={menu.kind === "status" ? "employment" : "popup"}
          sections={sections}
          onClose={closeMenu}
        />
      ) : null}
      <EmploymentDatesDialog
        target={dates?.target ?? null}
        openKey={dates?.openKey ?? 0}
        onClose={() => setDates(null)}
        onSave={onDatesSave}
      />
      <DeleteConfirmDialog
        target={
          deleteTarget
            ? { name: personDisplayName(deleteTarget), submittedAt: deleteTarget.submittedAt }
            : null
        }
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />
      <UsageLogDialog
        open={usageOpen}
        organizationName={organizationName}
        onClose={() => setUsageOpen(false)}
      />
    </div>
  );
}
