// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { containModal } from "./modalFocus";
afterEach(()=>{document.body.innerHTML="";});
it("cycles Tab both ways, contains focus, makes background inert and restores trigger",()=>{
 document.body.innerHTML='<div><section><button id="trigger">Capture</button></section><div><div id="dialog"><textarea></textarea><button>Keep</button></div></div></div>';
 const trigger=document.querySelector<HTMLButtonElement>('#trigger')!;trigger.focus();const dialog=document.querySelector<HTMLElement>('#dialog')!;const first=dialog.querySelector('textarea')!;const last=dialog.querySelector('button')!;
 const cleanup=containModal(dialog,first);expect(document.activeElement).toBe(first);expect(trigger.parentElement!.inert).toBe(true);
 first.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));expect(document.activeElement).toBe(last);
 last.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));expect(document.activeElement).toBe(first);
 trigger.focus();expect(document.activeElement).toBe(first);cleanup();expect(trigger.parentElement!.inert).toBeFalsy();expect(document.activeElement).toBe(trigger);
});
