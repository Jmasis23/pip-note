/** Pasted images are shrunk and kept inside the note as a data URL, so they live in the same local store as the text. */
const OK = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
export const isImageData = (s: string) => OK.test(s);

export function imageFrom(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const f of Array.from(dt.files ?? [])) if (/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) return f;
  for (const it of Array.from(dt.items ?? [])) if (it.kind === "file" && /^image\/(png|jpe?g|webp|gif)$/.test(it.type)) return it.getAsFile();
  return null;
}

const read = (f: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

export async function toDataUrl(file: File, max = 1400): Promise<string> {
  const raw = await read(file);
  if (file.type === "image/gif") return raw;
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("decode")); i.src = raw; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    if (k === 1 && raw.length < 400_000) return raw;
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL(file.type === "image/png" ? "image/png" : "image/webp", 0.85);
    return isImageData(out) ? out : raw;
  } catch { return raw; }
}

export const imageNote = (src: string) => ({ title: "Image", body: "", rich: `<div><img src="${src}" alt=""></div>` });
export const firstImage = (rich?: string) => { const m = rich && /<img src="(data:image\/[^"]+)"/.exec(rich); return m ? m[1] : ""; };
