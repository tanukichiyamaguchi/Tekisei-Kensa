"use client";
// R-01 受検者登録のフォーム（05 §5.1）。入力チェックは registration-rules（規則の正は 04 §4.2）
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { examErrorAction } from "@/lib/presentation/exam-errors";
import { EXAM_TEXTS, type ExamBannerTextId } from "@/lib/presentation/exam-texts";
import {
  isRegistrationFilled,
  issuePathToErrorCode,
  normalizeName,
  normalizePhoneNumber,
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

import { BusyOverlay } from "./BusyOverlay";
import { ErrorBanner } from "./ErrorBanner";
import { PageHeading } from "./PageHeading";

export interface RegistrationFormProps {
  readonly organizationId: string;
  readonly kind: RegisterRespondentInput["kind"];
}

type Errors = Partial<Record<RegistrationField, RegistrationErrorCode | undefined>>;

const FIELD_IDS: Readonly<Record<RegistrationField, string>> = {
  name: "reg-name",
  phoneNumber: "reg-phone",
  occupationCode: "reg-occupation",
  diagnosisExperience: "reg-experience-first_time",
};
const errorId = (field: RegistrationField) => `reg-${field}-error`;

export function RegistrationForm({ organizationId, kind }: RegistrationFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<RegistrationDraft>({
    name: "",
    phoneNumber: "",
    occupationCode: null,
    diagnosisExperience: null,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [showMissing, setShowMissing] = useState(false);
  const [banner, setBanner] = useState<{ text: ExamBannerTextId; retry: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const filled = isRegistrationFilled(draft);

  function update(patch: Partial<RegistrationDraft>, field: RegistrationField) {
    const next = { ...draft, ...patch };
    setDraft(next);
    // 赤枠が出ている項目は、正しい値になった時点で消す（05 §5.1.4）
    if (errors[field] && validateRegistrationField(field, next) === null) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function onBlur(field: RegistrationField) {
    const code = validateRegistrationField(field, draft);
    setErrors((prev) => ({ ...prev, [field]: code ?? undefined }));
  }

  function focusField(field: RegistrationField) {
    const el = document.getElementById(FIELD_IDS[field]);
    el?.scrollIntoView({ block: "center" });
    el?.focus();
  }

  async function submit() {
    if (inFlight.current) return;
    const found = validateRegistration(draft);
    const first = REGISTRATION_FIELDS.find((f) => found[f]);
    if (first) {
      setErrors(found);
      setShowMissing(true);
      focusField(first);
      return;
    }
    setShowMissing(false);
    setBanner(null);
    inFlight.current = true;
    setBusy(true);
    try {
      const created = await createSession({
        organizationId,
        kind,
        name: normalizeName(draft.name),
        phoneNumber: normalizePhoneNumber(draft.phoneNumber),
        occupationCode: draft.occupationCode ?? 0,
        diagnosisExperience: draft.diagnosisExperience ?? "first_time",
      });
      // 戻るで登録フォームに戻らないよう replace（05 §5.1.6）。遷移完了まで BusyOverlay を残す
      router.replace(created.nextUrl);
      return;
    } catch (error) {
      const failure =
        error instanceof RespondentApiError
          ? error
          : new RespondentApiError(0, "NETWORK_ERROR", "");
      const action = examErrorAction("register", failure);
      if (action.kind === "registration_issues") {
        const mapped: Errors = {};
        for (const path of action.paths) {
          const hit = issuePathToErrorCode(path);
          if (hit) mapped[hit.field] = hit.code;
        }
        const firstMapped = REGISTRATION_FIELDS.find((f) => mapped[f]);
        if (firstMapped) {
          setErrors(mapped);
          focusField(firstMapped);
        } else {
          // organizationId・kind など画面で直せない項目（05 §5.1.6 手順 3）
          setBanner({ text: "E-05", retry: false });
        }
      } else if (action.kind === "banner") {
        setBanner({ text: action.text, retry: action.retry });
      } else {
        setBanner({ text: "E-01", retry: true });
      }
    }
    inFlight.current = false;
    setBusy(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  const describedBy = (field: RegistrationField) => (errors[field] ? errorId(field) : undefined);
  const fieldError = (field: RegistrationField) =>
    errors[field] ? (
      <p id={errorId(field)} className="exam-field-error" data-testid={`error-${field}`}>
        {EXAM_TEXTS[errors[field]]}
      </p>
    ) : null;

  const experienceOptions: ReadonlyArray<{ value: DiagnosisExperienceValue; label: string }> = [
    { value: "first_time", label: EXAM_TEXTS["R1-09"] },
    { value: "experienced", label: EXAM_TEXTS["R1-10"] },
  ];

  return (
    <>
      <PageHeading>{EXAM_TEXTS["R1-01"]}</PageHeading>
      <p className="exam-lead">{EXAM_TEXTS["R1-02"]}</p>
      <p className="exam-muted">{EXAM_TEXTS["R1-11"]}</p>
      {banner ? (
        <ErrorBanner
          text={banner.text}
          actionLabel={banner.retry ? EXAM_TEXTS["B-08"] : undefined}
          onAction={banner.retry ? () => void submit() : undefined}
        />
      ) : null}
      <form className="exam-form" noValidate onSubmit={onSubmit} data-testid="registration-form">
        <div className="exam-field">
          <label className="exam-label" htmlFor={FIELD_IDS.name}>
            {EXAM_TEXTS["R1-03"]}
            <span className="exam-required" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id={FIELD_IDS.name}
            className="exam-input"
            type="text"
            autoComplete="name"
            required
            value={draft.name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy("name")}
            onChange={(e) => update({ name: e.target.value }, "name")}
            onBlur={() => onBlur("name")}
          />
          {fieldError("name")}
        </div>

        <div className="exam-field">
          <label className="exam-label" htmlFor={FIELD_IDS.phoneNumber}>
            {EXAM_TEXTS["R1-04"]}
            <span className="exam-required" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id={FIELD_IDS.phoneNumber}
            className="exam-input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            value={draft.phoneNumber}
            aria-invalid={errors.phoneNumber ? true : undefined}
            aria-describedby={[describedBy("phoneNumber"), "reg-phone-hint"]
              .filter(Boolean)
              .join(" ")}
            onChange={(e) => update({ phoneNumber: e.target.value }, "phoneNumber")}
            onBlur={() => onBlur("phoneNumber")}
          />
          <p id="reg-phone-hint" className="exam-muted" style={{ margin: 0 }}>
            {EXAM_TEXTS["R1-05"]}
          </p>
          {fieldError("phoneNumber")}
        </div>

        <div className="exam-field">
          <label className="exam-label" htmlFor={FIELD_IDS.occupationCode}>
            {EXAM_TEXTS["R1-06"]}
            <span className="exam-required" aria-hidden="true">
              *
            </span>
          </label>
          <select
            id={FIELD_IDS.occupationCode}
            className="exam-input"
            required
            value={draft.occupationCode === null ? "" : String(draft.occupationCode)}
            aria-invalid={errors.occupationCode ? true : undefined}
            aria-describedby={describedBy("occupationCode")}
            onChange={(e) =>
              update(
                { occupationCode: e.target.value === "" ? null : Number(e.target.value) },
                "occupationCode",
              )
            }
            onBlur={() => onBlur("occupationCode")}
          >
            <option value="" disabled>
              {EXAM_TEXTS["R1-07"]}
            </option>
            {OCCUPATION_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
          {fieldError("occupationCode")}
        </div>

        <fieldset
          className="exam-field"
          aria-invalid={errors.diagnosisExperience ? true : undefined}
          aria-describedby={describedBy("diagnosisExperience")}
        >
          <legend className="exam-label">
            {EXAM_TEXTS["R1-08"]}
            <span className="exam-required" aria-hidden="true">
              *
            </span>
          </legend>
          {experienceOptions.map((o) => (
            <label key={o.value} className="exam-radio-row">
              <input
                id={`reg-experience-${o.value}`}
                type="radio"
                name="diagnosisExperience"
                value={o.value}
                checked={draft.diagnosisExperience === o.value}
                onChange={() => update({ diagnosisExperience: o.value }, "diagnosisExperience")}
                onBlur={(e) => {
                  // 同じグループ内のラジオへの移動では検証しない
                  const next = e.relatedTarget as HTMLInputElement | null;
                  if (next?.name !== "diagnosisExperience") onBlur("diagnosisExperience");
                }}
              />
              {o.label}
            </label>
          ))}
          {fieldError("diagnosisExperience")}
        </fieldset>

        <div>
          <button
            type="submit"
            className="exam-button"
            aria-disabled={!filled || busy ? true : undefined}
            aria-describedby={showMissing ? "reg-missing" : undefined}
            data-testid="register-submit"
          >
            {EXAM_TEXTS["B-01"]}
          </button>
          {showMissing ? (
            <p id="reg-missing" className="exam-field-error" style={{ marginTop: 8 }}>
              {EXAM_TEXTS["V-00"]}
            </p>
          ) : null}
        </div>
      </form>
      {busy ? <BusyOverlay text={EXAM_TEXTS["L-01"]} /> : null}
    </>
  );
}
