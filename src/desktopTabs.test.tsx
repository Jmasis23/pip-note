// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,expect,it,vi} from "vitest";
import DesktopDock from "./DesktopDock";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
vi.stubGlobal("matchMedia",()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}));
let cleanup=()=>{};
afterEach(()=>{cleanup();document.body.innerHTML="";});
it("shows both edge buttons and changes the folder dock only on click",async()=>{
 const el=document.createElement("div");document.body.append(el);const root=createRoot(el);cleanup=()=>act(()=>root.unmount());
 await act(async()=>root.render(<DesktopDock/>));
 const right=el.querySelector<HTMLButtonElement>('[aria-label="Toggle folders"]');
 expect(right).not.toBeNull();expect(el.querySelector('[aria-label="Open Pip dashboard"]')).not.toBeNull();
 expect(right?.getAttribute("aria-expanded")).toBe("false");
 await act(async()=>{right?.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));});
 expect(right?.getAttribute("aria-expanded")).toBe("false");
 await act(async()=>right?.click());expect(right?.getAttribute("aria-expanded")).toBe("true");
 expect(el.querySelector("nav.fr")?.getAttribute("aria-hidden")).toBeNull();
 await act(async()=>right?.click());expect(right?.getAttribute("aria-expanded")).toBe("false");
 expect(el.querySelector("nav.fr")?.getAttribute("aria-hidden")).toBe("true");
});
