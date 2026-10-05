import { useEffect, useState } from "react";
import { call, isNative } from "../native";
export function Check({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="check-row">
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
export function GestureSettings({ report }: { report: (v: string) => void }) {
  const [config, setConfig] = useState<any>(null);
  const [saved, setSaved] = useState("");
  useEffect(() => {
    if (isNative())
      void call<any>("gesture_config", { opts: null, policy: null })
        .then(setConfig)
        .catch((e) => report(String(e)));
  }, []);
  if (!config)
    return (
      <section className="settings-section">
        <h2>Gesture tuning</h2>
        <p>
          {isNative()
            ? "Loading gesture settings…"
            : "Gesture tuning and application exclusions require Windows."}
        </p>
      </section>
    );
  const commit = async () => {
    try {
      await call("gesture_config", {
        opts: config.opts,
        policy: config.policy,
      });
      setSaved("Gesture settings saved.");
      report("");
    } catch (e) {
      report(String(e));
    }
  };
  return (
    <section className="settings-section">
      <h2>Deliberate, never accidental</h2>
      <p className="hint">
        Default thresholds are tuning candidates. Test on your mouse and display
        before relying on them.
      </p>
      {[
        ["min_travel", "Minimum travel (physical pixels)", 8, 120],
        ["reversals", "Direction reversals", 3, 12],
        ["window_ms", "Gesture window (ms)", 200, 2000],
        ["tolerance", "Boundary tolerance (physical pixels)", 0, 100],
        ["cooldown_ms", "Cooldown (ms)", 300, 10000],
      ].map(([key, label, min, max]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            min={Number(min)}
            max={Number(max)}
            value={config.opts[key]}
            onChange={(e) =>
              setConfig({
                ...config,
                opts: { ...config.opts, [key]: Number(e.target.value) },
              })
            }
          />
        </label>
      ))}
      <Check
        label="Suppress gestures in full-screen applications"
        value={config.policy.fullscreen}
        onChange={(v) =>
          setConfig({ ...config, policy: { ...config.policy, fullscreen: v } })
        }
      />
      <label>
        Exclude applications (one .exe name per line)
        <textarea
          rows={3}
          value={config.policy.exclusions.join("\n")}
          onChange={(e) =>
            setConfig({
              ...config,
              policy: {
                ...config.policy,
                exclusions: e.target.value
                  .split("\n")
                  .map((x) => x.trim())
                  .filter(Boolean),
              },
            })
          }
        />
      </label>
      <button className="primary" onClick={() => void commit()}>
        Save gesture settings
      </button>
      <p role="status">{saved}</p>
    </section>
  );
}
export function ClipboardSettings({ report }: { report: (v: string) => void }) {
  const [c, setC] = useState<any>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (isNative())
      void call("clipboard_config", { config: null })
        .then(setC)
        .catch((e) => report(String(e)));
  }, []);
  return (
    <section className="settings-section">
      <h2>Clipboard privacy</h2>
      <p className="hint">
        Off until explicitly enabled in Clipboard Shelf. History stays on this
        PC. Sensitive-content detection is imperfect.
      </p>
      {c && (
        <>
          <label>
            Unpinned item limit
            <input
              type="number"
              min={10}
              max={50}
              value={c.limit}
              onChange={(e) => setC({ ...c, limit: Number(e.target.value) })}
            />
          </label>
          <label>
            Retention (days)
            <input
              type="number"
              min={1}
              max={90}
              value={c.days}
              onChange={(e) => setC({ ...c, days: Number(e.target.value) })}
            />
          </label>
          <label>
            Exclude applications (one .exe name per line)
            <textarea
              value={c.exclusions.join("\n")}
              onChange={(e) =>
                setC({
                  ...c,
                  exclusions: e.target.value
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <button
            onClick={() =>
              void call("clipboard_config", { config: c })
                .then(() => setNote("Clipboard preferences saved."))
                .catch((e) => report(String(e)))
            }
          >
            Save clipboard preferences
          </button>
          <p role="status">{note}</p>
        </>
      )}
    </section>
  );
}
