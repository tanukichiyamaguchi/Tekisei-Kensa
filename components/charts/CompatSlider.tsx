// 相性スライダー（V-06。06 §6.6）。目盛・数値は出さない（付録E §4）。
// 負値は左端に置き、数値のツールチップを出さず注記（T-12）だけを出す（06 §3.5.6、00 D-07）
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { clampForSlider } from "@/lib/presentation/negative-values";

export interface CompatSliderProps {
  readonly label: string; // 適応する環境
  readonly lowLabel: string; // 個人優先型
  readonly highLabel: string; // 組織優先型
  readonly value: number; // 保存値（整数、負値あり）
}

export function CompatSlider({ label, lowLabel, highLabel, value }: CompatSliderProps) {
  const position = clampForSlider(value);
  const isNegative = value < 0;
  return (
    <div
      className="compat-slider"
      role="img"
      aria-label={`${label}: ${lowLabel} から ${highLabel} のうち ${position}`}
    >
      <div className="compat-slider__label">{label}</div>
      <div className="compat-slider__row">
        <span className="compat-slider__end">{lowLabel}</span>
        <div className="compat-slider__track" title={isNegative ? undefined : String(value)}>
          <span className="compat-slider__marker" style={{ left: `calc(${position}% - 7px)` }} />
        </div>
        <span className="compat-slider__end">{highLabel}</span>
      </div>
      {isNegative ? <p className="compat-slider__note">{ADMIN_TEXTS.negativeValueNote}</p> : null}
    </div>
  );
}
