// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {observeDesktopRegions} from "./desktopRegions";

type Rect={x:number;y:number;width:number;height:number};
let stop=()=>{};
beforeEach(()=>{vi.stubGlobal("ResizeObserver",class {observe(){} disconnect(){}});});
afterEach(()=>{stop();document.body.innerHTML="";vi.restoreAllMocks();vi.unstubAllGlobals();});
function rail(){
 const el=document.createElement("nav");el.className="fr";el.style.visibility="hidden";document.body.append(el);
 vi.spyOn(el,"getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
 vi.spyOn(el,"getBoundingClientRect").mockReturnValue({x:1800,y:380,width:58,height:220} as DOMRect);
 return el;
}
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
it("reveals the native region even when an empty window receives no animation frames",async()=>{
 // A fully clipped/hidden WebView2 can stop rAF. Region updates must still unblock painting.
 vi.stubGlobal("requestAnimationFrame",()=>1);vi.stubGlobal("cancelAnimationFrame",()=>{});
 const el=rail();let nativeRegion:Rect[]|null=null;
 stop=observeDesktopRegions(async regions=>{nativeRegion=regions;});
 await settle();expect(nativeRegion).toEqual([]);
 el.style.visibility="visible";
 await settle();expect(nativeRegion).toEqual([{x:1790,y:370,width:78,height:240}]);
 el.style.visibility="hidden";
 await settle();expect(nativeRegion).toEqual([]);
});
it("delivers the latest geometry after a prior native update finishes",async()=>{
 const el=rail();let complete=()=>{};let region:Rect[]=[];
 stop=observeDesktopRegions(async next=>{if(!next.length)await new Promise<void>(resolve=>{complete=resolve;});region=next;});
 await settle();el.style.visibility="visible";await settle();complete();await settle();
 expect(region).toEqual([{x:1790,y:370,width:78,height:240}]);
});
it("includes editor color and selection popovers outside the note panel",async()=>{
 const color=document.createElement("div"),selection=document.createElement("div");
 color.className="cp-pop";selection.className="rt-bubble";document.body.append(color,selection);
 for(const el of [color,selection]){
  vi.spyOn(el,"getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  vi.spyOn(el,"getBoundingClientRect").mockReturnValue({x:500,y:50,width:200,height:40} as DOMRect);
 }
 let region:Rect[]=[];stop=observeDesktopRegions(async next=>{region=next;});await settle();
 expect(region).toEqual([{x:490,y:40,width:220,height:60},{x:490,y:40,width:220,height:60}]);
});
