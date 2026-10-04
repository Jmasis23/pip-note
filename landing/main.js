const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
// reveal big visuals on scroll
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .15 });
document.querySelectorAll(".panel,.demo,.more dl,.know>div").forEach(el => { el.classList.add("rv"); io.observe(el); });

// demo video: autoplay while on screen with no controls; if autoplay is unavailable
// (reduced motion, Low Power Mode, play() rejected or stalled) show native controls so it can always be started by hand.
const dv = document.querySelector(".demo-video video");
if (dv) {
  let manual = false;
  const manualMode = () => { if (manual) return; manual = true; dv.pause(); dv.controls = true; dv.preload = "metadata"; };
  if (reduce) manualMode();
  else new IntersectionObserver(es => es.forEach(e => {
    if (manual) return;
    if (!e.isIntersecting) { dv.pause(); return; }
    const p = dv.play();
    if (p && p.catch) p.catch(manualMode);
    setTimeout(() => { if (!manual && dv.paused) manualMode(); }, 2500);
  }), { threshold: .25 }).observe(dv);
}

// Pip spark cues: one playful hop on the hero tile, and a saved burst when the closing CTA scrolls in.
const hs = document.querySelector(".pip-hero .pipm");
if (hs && !reduce) setTimeout(() => hs.classList.add("bounce"), 4500);
const fs = document.querySelector(".final-spark");
if (fs) { fs.dataset.state = "idle"; if (!reduce) new IntersectionObserver((es, o) => es.forEach(e => { if (e.isIntersecting) { fs.dataset.state = "saved"; o.disconnect(); } }), { threshold: .6 }).observe(fs); }
