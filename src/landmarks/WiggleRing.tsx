/** Orange round meter: fills as a wiggle approaches its trigger. Used by the native meter window and by Landmarks test mode. `value` is 0 to 1. */
export function WiggleRing({
  value,
  size = 48,
}: {
  value: number;
  size?: number;
}) {
  const v = Math.min(1, Math.max(0, value)),
    r = 19,
    c = 2 * Math.PI * r,
    full = v >= 1;
  return (
    <svg
      className={"wring" + (full ? " full" : "")}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="progressbar"
      aria-label="Wiggle progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <circle cx="24" cy="24" r="22" className="wring-bg" />
      <circle cx="24" cy="24" r={r} className="wring-track" />
      <circle
        cx="24"
        cy="24"
        r={r}
        className="wring-fill"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - v)}
        transform="rotate(-90 24 24)"
      />
    </svg>
  );
}
