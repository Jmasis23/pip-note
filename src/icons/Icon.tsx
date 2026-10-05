import { GLYPHS } from "./glyphs";
export type IconName = keyof typeof GLYPHS;
/** Ionicons (MIT). Decorative by default; pass label for a standalone icon. */
export function Icon({ name, size = 18, label }: { name: IconName; size?: number; label?: string }) {
  return <svg className="ion" width={size} height={size} viewBox="0 0 512 512" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false" dangerouslySetInnerHTML={{ __html: GLYPHS[name] }} />;
}
