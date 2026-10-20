import { TEXT_STEPS, type TextSize } from "../domain";

/** Two small buttons that step the app-wide text size down and up. */
export function TextStepper({ value, onChange, className = "" }: { value: TextSize; onChange: (v: TextSize) => void; className?: string }) {
  const i = Math.max(0, TEXT_STEPS.indexOf(value));
  const step = (d: number) => onChange(TEXT_STEPS[Math.min(TEXT_STEPS.length - 1, Math.max(0, i + d))]);
  return (
    <div className={`ts-step ${className}`} role="group" aria-label="Text size">
      <button type="button" aria-label="Smaller text" title="Smaller text" disabled={i === 0} onMouseDown={e => e.preventDefault()} onClick={() => step(-1)}><svg viewBox="0 0 12 12" aria-hidden><path d="M2.5 6h7" /></svg></button>
      <button type="button" aria-label="Larger text" title="Larger text" disabled={i === TEXT_STEPS.length - 1} onMouseDown={e => e.preventDefault()} onClick={() => step(1)}><svg viewBox="0 0 12 12" aria-hidden><path d="M2.5 6h7M6 2.5v7" /></svg></button>
    </div>
  );
}
