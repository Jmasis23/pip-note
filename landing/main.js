const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
// reveal big visuals on scroll
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .15 });
document.querySelectorAll(".panel,.demo,.more dl,.know>div").forEach(el => { el.classList.add("rv"); io.observe(el); });

// demo video: play only while on screen, never show controls
const dv = document.querySelector(".demo-video video");
if (dv) { if (reduce) { dv.removeAttribute("autoplay"); dv.pause(); } else new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? dv.play().catch(() => {}) : dv.pause()), { threshold: .25 }).observe(dv); }
