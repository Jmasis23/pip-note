const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
// reveal big visuals on scroll
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .15 });
document.querySelectorAll(".panel,.demo,.more dl,.know>div").forEach(el => { el.classList.add("rv"); io.observe(el); });

// demo video: autoplays (muted, looping) while on screen. No controls or play button, ever.
const dv = document.querySelector(".demo-video video");
if (dv) {
  dv.controls = false;
  if (reduce) { dv.removeAttribute("autoplay"); dv.pause(); }
  else {
    let on = false;
    const go = () => { if (on && dv.paused) { const p = dv.play(); if (p && p.catch) p.catch(() => {}); } };
    new IntersectionObserver(es => es.forEach(e => { on = e.isIntersecting; if (on) go(); else dv.pause(); }), { threshold: .25 }).observe(dv);
    // if the browser held back autoplay, retry on the first touch, scroll or key (invisible to the user)
    ["touchstart", "pointerdown", "scroll", "keydown"].forEach(t => addEventListener(t, go, { passive: true }));
    dv.addEventListener("canplay", go);
  }
}

// Pip spark cues: one playful hop on the hero tile, and a saved burst when the closing CTA scrolls in.
const hs = document.querySelector(".pip-hero .pipm");
if (hs && !reduce) setTimeout(() => hs.classList.add("bounce"), 4500);
const fs = document.querySelector(".final-spark");
if (fs) { fs.dataset.state = "idle"; if (!reduce) new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { fs.dataset.state = "saved"; o.disconnect(); } }), { threshold: .6 }).observe(fs); }
