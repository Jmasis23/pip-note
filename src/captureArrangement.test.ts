import {describe,it,expect} from "vitest";
import {arrangementRequest,titleCandidates,validatedArrangement} from "./captureArrangement";
const state={text:"A thought\nBook flights to Lisbon",folders:["Work","Travel"]};
describe("capture typed selection",()=>{
 it("batches two bounded selections and keeps Inbox",()=>{const r=arrangementRequest(state);expect(r.questions.title.criteria).toEqual({t0:"A thought",t1:"Book flights to Lisbon"});expect(r.questions.folder.criteria.f1).toBe("Travel");expect(r.questions.folder.criteria.inbox).toBeTruthy();});
 it("copies only valid candidates",()=>{expect(validatedArrangement(state,{answers:{title:{type:"choice",choice:"t1",confidence:.9},folder:{type:"choice",choice:"f1",confidence:.9}}})).toMatchObject({title:"Book flights to Lisbon",folder:"Travel",titleConfident:true,folderConfident:true});});
 it("rejects unknown and low-confidence choices",()=>{expect(validatedArrangement(state,{answers:{title:{type:"choice",choice:"t999",confidence:.99},folder:{type:"choice",choice:"f1",confidence:.2}}})).toMatchObject({title:"A thought",folder:"",titleConfident:false,folderConfident:false});});
 it("bounds candidate count and length",()=>{expect(titleCandidates("x".repeat(1000))[0].length).toBe(120);expect(titleCandidates(Array.from({length:40},(_,i)=>String(i)).join("\n"))).toHaveLength(24);});
});
