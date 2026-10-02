//! Mouse-shake recognizer. Port of src/gesture.ts: a quick back-and-forth with no button held.
#[derive(Clone, Copy)]
pub struct ShakeOpts { pub window_ms: f64, pub min_swing: f64, pub reversals: u32, pub min_speed: f64 }
pub const DEFAULT_SHAKE: ShakeOpts = ShakeOpts { window_ms: 700.0, min_swing: 40.0, reversals: 4, min_speed: 0.6 };

impl ShakeOpts {
    /// Same numbers as SHAKE_LEVELS in src/gesture.ts. 0 gentle, 2 hair-trigger, anything else normal.
    pub fn level(l: u8) -> ShakeOpts {
        match l {
            0 => ShakeOpts { window_ms: 800.0, min_swing: 60.0, reversals: 5, min_speed: 0.8 },
            2 => ShakeOpts { window_ms: 700.0, min_swing: 24.0, reversals: 3, min_speed: 0.35 },
            _ => DEFAULT_SHAKE,
        }
    }
}

#[derive(Clone, Copy)]
struct Pt { x: f64, y: f64, t: f64 }

pub struct ShakeDetector { opts: ShakeOpts, cooldown_ms: f64, pts: Vec<Pt>, last_fire: f64 }

fn sign(v: f64) -> i32 { if v > 0.0 { 1 } else if v < 0.0 { -1 } else { 0 } }

impl ShakeDetector {
    pub fn new() -> Self { Self::with(DEFAULT_SHAKE, 1200.0) }
    pub fn with(opts: ShakeOpts, cooldown_ms: f64) -> Self { Self { opts, cooldown_ms, pts: vec![], last_fire: f64::NEG_INFINITY } }

    pub fn set_opts(&mut self, opts: ShakeOpts) { self.opts = opts; self.pts.clear(); }
    fn reversals(&self, get: impl Fn(&Pt) -> f64) -> (u32, f64) {
        let half = self.opts.min_swing / 2.0;
        let (mut dir, mut anchor, mut flips, mut dist) = (0, get(&self.pts[0]), 0u32, 0.0);
        for p in &self.pts {
            let v = get(p); let d = v - anchor;
            if d.abs() >= half {
                let nd = sign(d);
                if dir != 0 && nd != dir { flips += 1; }
                dir = nd; dist += d.abs(); anchor = v;
            }
        }
        (flips, dist)
    }

    /// Feed a pointer position. `buttons_down` true while any mouse button is held. Returns true when a shake fires.
    pub fn moved(&mut self, x: f64, y: f64, t_ms: f64, buttons_down: bool) -> bool {
        if buttons_down { self.pts.clear(); return false; }
        self.pts.push(Pt { x, y, t: t_ms });
        while self.pts.first().map_or(false, |p| t_ms - p.t > self.opts.window_ms) { self.pts.remove(0); }
        if self.pts.len() < 6 || t_ms - self.last_fire < self.cooldown_ms { return false; }
        let span = { let s = self.pts[self.pts.len() - 1].t - self.pts[0].t; if s == 0.0 { 1.0 } else { s } };
        for axis in 0..2 {
            let (flips, dist) = if axis == 0 { self.reversals(|p| p.x) } else { self.reversals(|p| p.y) };
            if flips >= self.opts.reversals && dist / span >= self.opts.min_speed {
                self.last_fire = t_ms; self.pts.clear(); return true;
            }
        }
        false
    }
}
impl Default for ShakeDetector { fn default() -> Self { Self::new() } }

#[cfg(test)]
mod tests {
    use super::*;
    fn shake(swings: usize, amp: f64, steps: usize) -> Vec<(f64, f64)> {
        let mut p = vec![(300.0, 300.0)];
        for s in 0..swings { for i in 1..=steps {
            let k = i as f64 / steps as f64;
            let x = 300.0 + if s % 2 == 0 { amp * k } else { -amp * k + amp };
            p.push((x, 300.0));
        } }
        p
    }
    fn run(path: &[(f64, f64)], step: f64, down: bool) -> u32 {
        let mut d = ShakeDetector::new(); let mut n = 0;
        for (i, (x, y)) in path.iter().enumerate() { if d.moved(*x, *y, i as f64 * step, down) { n += 1; } } n
    }
    fn run_l(path: &[(f64, f64)], level: u8) -> u32 {
        let mut d = ShakeDetector::new(); d.set_opts(ShakeOpts::level(level)); let mut n = 0;
        for (i, (x, y)) in path.iter().enumerate() { if d.moved(*x, *y, i as f64 * 14.0, false) { n += 1; } } n
    }
    #[test] fn hair_trigger_fires_on_small_wiggle_normal_does_not() { let p = shake(4, 30.0, 4); assert_eq!(run_l(&p, 1), 0); assert_eq!(run_l(&p, 2), 1); }
    #[test] fn gentle_needs_a_bigger_shake_than_normal() { let p = shake(6, 65.0, 5); let (n, g, big) = (run_l(&p, 1), run_l(&p, 0), run_l(&shake(10, 90.0, 5), 0)); assert_eq!((n, g, big), (1, 0, 1)); }
    #[test] fn fires_on_back_and_forth() { assert_eq!(run(&shake(6, 80.0, 5), 14.0, false), 1); }
    #[test] fn fires_on_vertical() { let v: Vec<_> = shake(6, 80.0, 5).into_iter().map(|(x, y)| (y, x)).collect(); assert_eq!(run(&v, 14.0, false), 1); }
    #[test] fn ignores_single_sweep() { assert_eq!(run(&shake(1, 400.0, 30), 10.0, false), 0); }
    #[test] fn ignores_slow_wandering() { assert_eq!(run(&shake(6, 80.0, 5), 90.0, false), 0); }
    #[test] fn ignores_tiny_jitter() { assert_eq!(run(&shake(10, 6.0, 3), 10.0, false), 0); }
    #[test] fn ignores_while_button_held() { assert_eq!(run(&shake(6, 80.0, 5), 14.0, true), 0); }
    #[test] fn cooldown_blocks_refire() { let mut p = shake(6, 80.0, 5); p.extend(shake(6, 80.0, 5)); assert_eq!(run(&p, 14.0, false), 1); }
}
