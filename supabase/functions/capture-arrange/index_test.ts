import { assertEquals } from "jsr:@std/assert@1";
let handler: (req: Request) => Promise<Response>;
const serve = Deno.serve;
Deno.serve = ((h: typeof handler) => { handler = h; return {} as ReturnType<typeof serve>; }) as typeof serve;
await import("./index.ts");
Deno.serve = serve;
Deno.test("disabled endpoint sends no requests", async () => {
 Deno.env.delete("CAPTURE_JEV_ENABLED");
 const response=await handler(new Request("http://localhost/capture-arrange",{method:"POST",body:JSON.stringify({text:"synthetic",folders:[]})}));
 assertEquals(response.status,503);
});
Deno.test("rejects methods and supports preflight", async()=>{
 assertEquals((await handler(new Request("http://localhost/capture-arrange"))).status,405);
 assertEquals((await handler(new Request("http://localhost/capture-arrange",{method:"OPTIONS"}))).status,200);
});
