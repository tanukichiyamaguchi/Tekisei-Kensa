"use client";
// R-01 受験者登録（11-1 §2.2）。ラベルの無い入力欄 2 つとプルダウン 2 つ（項目名は aria-label で読み上げる）、「診断に進む」、
// 「すでに受験された方・ログインはこちら」。入力チェックは registration-rules（サーバの検証と同じ規則。11-1 §2.2.5）。
// 画面を開いた時点では組織を確かめず、「診断に進む」で確かめる（無効なリンクでも R-07 で知らせる。11-1 §2.2.6）
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { examErrorAction } from "@/lib/presentation/exam-errors";
import { EXAM_TEXTS, type ExamBannerTextId } from "@/lib/presentation/exam-texts";
import {
  isOverLimit,
  isRegistrationFilled,
  issuePathToErrorCode,
  normalizeText,
  OCCUPATION_OPTIONS,
  REGISTRATION_FIELDS,
  validateRegistration,
  validateRegistrationField,
  type DiagnosisExperienceValue,
  type RegistrationDraft,
  type RegistrationErrorCode,
  type RegistrationField,
} from "@/lib/presentation/registration-rules";
import type { RegisterRespondentInput } from "@/lib/services/schemas/respondent";
import { createSession, RespondentApiError } from "@/lib/utils/respondent-api";

import { ExamAlertDialog } from "./ExamAlertDialog";
import { InfoIcon, PhoneCallIcon, SelectArrowIcon, UserIcon, UsersIcon } from "./ExamIcons";
import { PageHeading } from "./PageHeading";

export interface RegistrationFormProps {
  /** URL の q（文書 ID の形のときだけ。存在は確かめない。11-1 §2.2.1）。無ければ null */
  readonly organizationId: string | null;
  /** URL の p から（executives のときだけ既存スタッフ） */
  readonly kind: RegisterRespondentInput["kind"];
}

type Errors = Partial<Record<RegistrationField, RegistrationErrorCode>>;

const FIELD_IDS: Readonly<Record<RegistrationField, string>> = {
  name: "reg-name",
  phoneNumber: "reg-phone",
  occupationCode: "reg-occupation",
  diagnosisExperience: "reg-experience",
};
const errorId = (field: RegistrationField) => `reg-${field}-error`;

const EMPTY_DRAFT: RegistrationDraft = {
  name: "",
  phoneNumber: "",
  occupationCode: null,
  diagnosisExperience: null,
};

const EXPERIENCE_OPTIONS: ReadonlyArray<{
  readonly value: DiagnosisExperienceValue;
  readonly label: string;
}> = [
  { value: "first_time", label: EXAM_TEXTS["R1-09"] },
  { value: "experienced", label: EXAM_TEXTS["R1-10"] },
];

function toFailure(error: unknown): RespondentApiError {
  return error instanceof RespondentApiError
    ? error
    : new RespondentApiError(0, "NETWORK_ERROR", "network error");
}

function withoutField(errors: Errors, field: RegistrationField): Errors {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key !== field)) as Errors;
}

export function RegistrationForm({ organizationId, kind }: RegistrationFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<RegistrationDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<ExamBannerTextId | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const inFlight = useRef(false);

  // 4 項目がそろうまでと通信中は押せない状態（aria-disabled。押すことはでき、押したら検査する。11-1 §2.2.3）
  const disabled = !isRegistrationFilled(draft) || busy;

  function update(patch: Partial<RegistrationDraft>, field: RegistrationField) {
    const next = { ...draft, ...patch };
    setDraft(next);
    // 赤枠の項目は、正しい値になった時点で赤枠を消す（11-1 §2.2.5）
    if (errors[field] && validateRegistrationField(field, next) === null) {
      setErrors((prev) => withoutField(prev, field));
    }
  }

  // フォーカスが外れたら、その項目だけ検査する
  function onBlur(field: RegistrationField) {
    const code = validateRegistrationField(field, draft);
    setErrors((prev) => (code ? { ...prev, [field]: code } : withoutField(prev, field)));
  }

  function focusField(field: RegistrationField) {
    const el = document.getElementById(FIELD_IDS[field]);
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
  }

  /** V-00 を見えない読み上げ用の領域で読む（続けて押したときも読むよう、いったん空にしてから入れる） */
  function announceMissing() {
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(EXAM_TEXTS["V-00"]), 100);
  }

  async function submit() {
    if (inFlight.current) return;
    // 1. 4 項目の検査。不正があれば送らず、すべて赤枠にして最初の項目へ（11-1 §2.2.5）
    const found = validateRegistration(draft);
    const first = REGISTRATION_FIELDS.find((f) => found[f] !== undefined);
    if (first) {
      setErrors(found);
      focusField(first);
      announceMissing();
      // 上限を超えた項目があれば R-07 も出す（同時に 1 つだけ。項目の順でお名前が先）
      const overLimit = REGISTRATION_FIELDS.map((f) => found[f]).find(
        (code) => code !== undefined && isOverLimit(code),
      );
      if (overLimit === "V-02" || overLimit === "V-04") setAlert(overLimit);
      return;
    }
    setErrors({});
    // 2. q が無い・文書 ID の形でなければ、API を呼ばずに R-07（11-1 §2.2.6）
    if (organizationId === null) {
      setAlert("R7-02");
      return;
    }
    // 3・4. オフラインなら R-07（E-07。respondent-api が OFFLINE にする）。押せない状態にして登録する
    inFlight.current = true;
    setBusy(true);
    try {
      const created = await createSession({
        organizationId,
        kind,
        name: normalizeText(draft.name),
        phoneNumber: normalizeText(draft.phoneNumber),
        occupationCode: draft.occupationCode ?? 0,
        diagnosisExperience: draft.diagnosisExperience ?? "first_time",
      });
      // 戻るで登録フォームに戻らないよう replace。遷移が終わるまで押せない状態のまま（ロード中は出さない）
      router.replace(created.nextUrl);
      return;
    } catch (error) {
      const action = examErrorAction("register", toFailure(error));
      if (action.kind === "registration_issues") {
        // 画面の検査をすり抜けたときの保険: その項目を赤枠にして最初の項目へ
        const mapped: Errors = {};
        for (const path of action.paths) {
          const hit = issuePathToErrorCode(path, draft);
          if (hit && mapped[hit.field] === undefined) mapped[hit.field] = hit.code;
        }
        setErrors(mapped);
        const firstMapped = REGISTRATION_FIELDS.find((f) => mapped[f] !== undefined);
        if (firstMapped) focusField(firstMapped);
      } else {
        // 入力した値は残す
        setAlert(action.kind === "alert" ? action.textId : "E-01");
      }
    }
    inFlight.current = false;
    setBusy(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  /** 不正な項目の見えないエラー文言（aria-describedby で結ぶ。11-1 §2.1.7） */
  const hiddenError = (field: RegistrationField) => {
    const code = errors[field];
    return code ? (
      <span id={errorId(field)} className="exam-sr-only" data-testid={`error-${field}`}>
        {EXAM_TEXTS[code]}
      </span>
    ) : null;
  };
  const invalidProps = (field: RegistrationField) =>
    errors[field]
      ? { "aria-invalid": true as const, "aria-describedby": errorId(field) }
      : { "aria-invalid": undefined, "aria-describedby": undefined };

  return (
    <section className="exam-frame-narrow" data-testid="registration-view">
      <div className="exam-reg">
        <div className="exam-reg__body">
          <PageHeading>
            {kind === "executive" ? EXAM_TEXTS["R1-01X"] : EXAM_TEXTS["R1-01"]}
          </PageHeading>
          <form
            className="exam-reg__form"
            noValidate
            onSubmit={onSubmit}
            data-testid="registration-form"
          >
            <div className="exam-reg__fields">
              <div className="exam-field">
                <span className="exam-field__icon">
                  <UserIcon />
                </span>
                <input
                  id={FIELD_IDS.name}
                  className="exam-input exam-input--name"
                  type="text"
                  autoComplete="name"
                  required
                  placeholder={EXAM_TEXTS["R1-P1"]}
                  aria-label={EXAM_TEXTS["R1-03"]}
                  value={draft.name}
                  {...invalidProps("name")}
                  onChange={(e) => update({ name: e.target.value }, "name")}
                  onBlur={() => onBlur("name")}
                />
                {hiddenError("name")}
              </div>

              <div className="exam-field">
                <span className="exam-field__icon">
                  <PhoneCallIcon />
                </span>
                <input
                  id={FIELD_IDS.phoneNumber}
                  className="exam-input exam-input--phone"
                  type="text"
                  autoComplete="tel"
                  required
                  placeholder={EXAM_TEXTS["R1-P2"]}
                  aria-label={EXAM_TEXTS["R1-04"]}
                  value={draft.phoneNumber}
                  {...invalidProps("phoneNumber")}
                  onChange={(e) => update({ phoneNumber: e.target.value }, "phoneNumber")}
                  onBlur={() => onBlur("phoneNumber")}
                />
                {hiddenError("phoneNumber")}
              </div>

              <div className="exam-field">
                <span className="exam-field__icon">
                  <UsersIcon />
                </span>
                <select
                  id={FIELD_IDS.occupationCode}
                  className="exam-select"
                  required
                  aria-label={EXAM_TEXTS["R1-06"]}
                  data-empty={draft.occupationCode === null ? "true" : undefined}
                  value={draft.occupationCode === null ? "" : String(draft.occupationCode)}
                  {...invalidProps("occupationCode")}
                  onChange={(e) =>
                    update(
                      { occupationCode: e.target.value === "" ? null : Number(e.target.value) },
                      "occupationCode",
                    )
                  }
                  onBlur={() => onBlur("occupationCode")}
                >
                  <option value="" disabled>
                    {EXAM_TEXTS["R1-P3"]}
                  </option>
                  {OCCUPATION_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <SelectArrowIcon className="exam-select__arrow" />
                {hiddenError("occupationCode")}
              </div>

              <div className="exam-field">
                <span className="exam-field__icon">
                  <InfoIcon />
                </span>
                <select
                  id={FIELD_IDS.diagnosisExperience}
                  className="exam-select"
                  required
                  aria-label={EXAM_TEXTS["R1-08"]}
                  data-empty={draft.diagnosisExperience === null ? "true" : undefined}
                  value={draft.diagnosisExperience ?? ""}
                  {...invalidProps("diagnosisExperience")}
                  onChange={(e) =>
                    update(
                      {
                        diagnosisExperience:
                          e.target.value === ""
                            ? null
                            : (e.target.value as DiagnosisExperienceValue),
                      },
                      "diagnosisExperience",
                    )
                  }
                  onBlur={() => onBlur("diagnosisExperience")}
                >
                  <option value="" disabled>
                    {EXAM_TEXTS["R1-P4"]}
                  </option>
                  {EXPERIENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <SelectArrowIcon className="exam-select__arrow" />
                {hiddenError("diagnosisExperience")}
              </div>
            </div>

            <button
              type="submit"
              className="exam-button exam-reg__submit"
              aria-disabled={disabled ? true : undefined}
              data-testid="register-submit"
            >
              {EXAM_TEXTS["B-01"]}
            </button>
          </form>
        </div>
        <p className="exam-reg__login">
          {/* 行き先は管理者のログイン画面（K-32 ③） */}
          <Link href="/admin/login" className="exam-login-link" data-testid="login-link">
            {EXAM_TEXTS["R1-12"]}
          </Link>
        </p>
      </div>
      <p className="exam-sr-only" aria-live="polite" data-testid="registration-announcement">
        {announcement}
      </p>
      <ExamAlertDialog textId={alert} onClose={() => setAlert(null)} />
    </section>
  );
}
