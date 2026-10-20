import { call, isNative, onNativeEvent } from "./native";
export type ClipItem = { id: number; text: string; image?: string; copiedAt: number };
export type ClipStatus = { enabled: boolean; items: ClipItem[]; supported: boolean };
export const clipboard = {
  status: (): Promise<ClipStatus> => isNative() ? call("clipboard_status") : Promise.resolve({ enabled: false, items: [], supported: false }),
  enable: (enabled: boolean) => call<void>("clipboard_enable", { enabled }),
  remove: (id: number | null) => call<void>("clipboard_delete", { id }),
  copy: (id: number) => call<void>("clipboard_copy", { id }),
  watch: (cb: () => void) => onNativeEvent("pip://clipboard-changed", cb),
};
