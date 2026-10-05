//! Landmarks: invisible monitor-relative screen regions, each bound to a compact tool.
//! Pure logic, no OS calls. The native layer feeds cursor samples in; this module answers
//! "which Landmark, if any, just got a deliberate wiggle?".
//! Pipeline: input collection (native) -> `Engine::on_move` (recognizer + lock) -> `Layout::hit` (region match) -> dispatch (native)
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Monitor { pub id: String, pub x: i32, pub y: i32, pub w: u32, pub h: u32, pub scale: f64 }
impl Monitor {
    pub fn contains(&self, px: f64, py: f64) -> bool { px >= self.x as f64 && py >= self.y as f64 && px < (self.x as f64 + self.w as f64) && py < (self.y as f64 + self.h as f64) }
    fn aspect(&self) -> f64 { self.w as f64 / self.h.max(1) as f64 }
}
/// Fractions (0..1) of one monitor, so regions survive resolution and DPI changes.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Rect { pub x: f64, pub y: f64, pub w: f64, pub h: f64 }
impl Rect { pub fn overlaps(&self, o: &Rect) -> bool { self.x < o.x + o.w && o.x < self.x + self.w && self.y < o.y + o.h && o.y < self.y + self.h } }

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Tool { QuickCapture, QuickRecall, ClipboardShelf, Snippets, ProjectShelf, FloatingReference, FollowUps, ResumeCards, Utilities, Favorites }

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Landmark {
    pub id: String, pub name: String, pub enabled: bool, pub monitor_id: String, pub rect: Rect, pub tool: Tool,
    /// Set when the display layout changed in a way that may have moved or distorted this region.
    #[serde(default)] pub needs_review: bool,
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum LandmarkError {
    #[error("\"{0}\" has no name.")] EmptyName(String),
    #[error("\"{0}\" is outside its monitor. Keep the region inside the screen.")] OutOfBounds(String),
    #[error("\"{0}\" is too small to wiggle in. Make it at least 3% of the screen wide and tall.")] TooSmall(String),
    #[error("\"{a}\" overlaps \"{b}\". Landmarks can't overlap, because Pip would not know which tool you meant. Move or resize one of them.")] Overlap { a: String, b: String },
    #[error("Two Landmarks share the id {0}.")] DuplicateId(String),
}
pub const MIN_SIDE: f64 = 0.03;

/// Disabled Landmarks still count: re-enabling must not create a conflict.
pub fn validate(all: &[Landmark]) -> Result<(), LandmarkError> {
    for (i, l) in all.iter().enumerate() {
        if l.name.trim().is_empty() { return Err(LandmarkError::EmptyName(l.id.clone())); }
        let (r, eps) = (l.rect, 1e-9);
        if !(r.x >= -eps && r.y >= -eps && r.w > 0.0 && r.h > 0.0 && r.x + r.w <= 1.0 + eps && r.y + r.h <= 1.0 + eps) { return Err(LandmarkError::OutOfBounds(l.name.clone())); }
        if r.w < MIN_SIDE || r.h < MIN_SIDE { return Err(LandmarkError::TooSmall(l.name.clone())); }
        for o in &all[..i] {
            if o.id == l.id { return Err(LandmarkError::DuplicateId(l.id.clone())); }
            if o.monitor_id == l.monitor_id && o.rect.overlaps(&l.rect) { return Err(LandmarkError::Overlap { a: l.name.clone(), b: o.name.clone() }); }
        }
    }
    Ok(())
}

pub fn default_presets(monitor_id: &str) -> Vec<Landmark> {
    let mk = |slot: &str, name: &str, tool, x, y, w, h| Landmark { id: format!("preset-{monitor_id}-{slot}"), name: name.into(), enabled: true, monitor_id: monitor_id.into(), rect: Rect { x, y, w, h }, tool, needs_review: false };
    vec![
        mk("top-right", "Top right", Tool::QuickCapture, 0.88, 0.0, 0.12, 0.16),
        mk("left-edge", "Left edge", Tool::ClipboardShelf, 0.0, 0.30, 0.05, 0.40),
        mk("bottom-right", "Bottom right", Tool::ProjectShelf, 0.88, 0.84, 0.12, 0.16),
        mk("top-left", "Top left", Tool::QuickRecall, 0.0, 0.0, 0.12, 0.16),
    ]
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Layout { pub monitors: Vec<Monitor>, pub landmarks: Vec<Landmark> }
impl Layout {
    pub fn pixel_rect(&self, l: &Landmark) -> Option<(f64, f64, f64, f64)> {
        let m = self.monitors.iter().find(|m| m.id == l.monitor_id)?;
        Some((m.x as f64 + l.rect.x * m.w as f64, m.y as f64 + l.rect.y * m.h as f64, l.rect.w * m.w as f64, l.rect.h * m.h as f64))
    }
    /// Enabled Landmark under the point; Landmarks flagged for review are ignored (their position is not trusted).
    pub fn hit(&self, px: f64, py: f64) -> Option<&Landmark> {
        self.landmarks.iter().filter(|l| l.enabled && !l.needs_review).find(|l| self.pixel_rect(l).map_or(false, |(x, y, w, h)| px >= x && py >= y && px < x + w && py < y + h))
    }
    /// Call when displays change. Landmarks whose monitor vanished or changed shape are flagged. Same-shape resolution changes keep working.
    pub fn reconcile(&mut self, now: Vec<Monitor>) -> Vec<String> {
        let mut flagged = vec![];
        for l in &mut self.landmarks {
            let before = self.monitors.iter().find(|m| m.id == l.monitor_id);
            let after = now.iter().find(|m| m.id == l.monitor_id);
            let bad = match (before, after) { (_, None) => true, (Some(b), Some(a)) => (b.aspect() / a.aspect() - 1.0).abs() > 0.02, (None, Some(_)) => false };
            if bad && !l.needs_review { l.needs_review = true; flagged.push(l.id.clone()); }
        }
        self.monitors = now; flagged
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct GestureOpts { pub min_travel: f64, pub reversals: u32, pub window_ms: f64, pub tolerance: f64, pub cooldown_ms: f64, pub rest_ms: f64 }
/// Tuning candidates. NOT tuned on real hardware.
pub const DEFAULT_OPTS: GestureOpts = GestureOpts { min_travel: 36.0, reversals: 4, window_ms: 800.0, tolerance: 24.0, cooldown_ms: 1200.0, rest_ms: 350.0 };
impl GestureOpts {
    /// 0 = firm, 50 = default (exactly), 100 = light.
    pub fn from_sensitivity(s: u8) -> Self {
        let t = s.min(100) as f64 / 100.0;
        let l3 = |a: f64, b: f64, c: f64| if t <= 0.5 { a + (b - a) * (t / 0.5) } else { b + (c - b) * ((t - 0.5) / 0.5) };
        GestureOpts { min_travel: l3(60.0, 36.0, 22.0), reversals: l3(5.0, 4.0, 3.0).round() as u32, window_ms: l3(900.0, 800.0, 800.0), ..DEFAULT_OPTS }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Sample { pub x: f64, pub y: f64, pub t_ms: f64, pub button_down: bool, pub injected: bool }
pub type Suppressed = bool;
#[derive(Clone, Debug, PartialEq)]
pub struct Activation { pub landmark_id: String, pub tool: Tool, pub x: f64, pub y: f64 }
#[derive(Clone, Copy)]
struct Pt { x: f64, y: f64, t: f64 }
type PRect = (f64, f64, f64, f64);
enum State {
    Idle,
    /// Locked to one Landmark for the candidate's lifetime. The tool never changes mid-gesture.
    Candidate { id: String, tool: Tool, rect: PRect, pts: Vec<Pt> },
    /// Fired. Needs a pause or an exit from the region before a fresh gesture counts.
    Spent { rect: PRect, last_t: f64 },
}
pub struct Engine { pub layout: Layout, pub opts: GestureOpts, state: State, last_t: f64, cooldown_until: f64, progress: f64 }

fn inside(r: PRect, x: f64, y: f64, pad: f64) -> bool { x >= r.0 - pad && y >= r.1 - pad && x < r.0 + r.2 + pad && y < r.1 + r.3 + pad }

/// Zigzag filter: a reversal counts only after the cursor retreats `min_travel` from the extreme it reached.
fn reversals(pts: &[Pt], get: impl Fn(&Pt) -> f64, min_travel: f64) -> u32 {
    let first = get(&pts[0]);
    let (mut lo, mut hi, mut lo_i, mut hi_i) = (first, first, 0usize, 0usize);
    let (mut dir, mut ext, mut flips) = (0, first, 0u32);
    for (i, p) in pts.iter().enumerate() {
        let v = get(p);
        match dir {
            0 => {
                if v < lo { lo = v; lo_i = i; } if v > hi { hi = v; hi_i = i; }
                if hi - lo >= min_travel { dir = if hi_i > lo_i { 1 } else { -1 }; ext = if dir > 0 { hi } else { lo }; }
            }
            1 => { if v > ext { ext = v; } else if ext - v >= min_travel { flips += 1; dir = -1; ext = v; } }
            _ => { if v < ext { ext = v; } else if v - ext >= min_travel { flips += 1; dir = 1; ext = v; } }
        }
    }
    flips
}

impl Engine {
    pub fn new(layout: Layout, opts: GestureOpts) -> Self { Engine { layout, opts, state: State::Idle, last_t: f64::NEG_INFINITY, cooldown_until: f64::NEG_INFINITY, progress: 0.0 } }
    pub fn reset(&mut self) { self.state = State::Idle; self.progress = 0.0; }
    pub fn is_candidate(&self) -> bool { matches!(self.state, State::Candidate { .. }) }
    pub fn locked_landmark(&self) -> Option<&str> { if let State::Candidate { id, .. } = &self.state { Some(id) } else { None } }
    /// 0.0 to 1.0: how close the current candidate is to firing. Reversals only, so hover and single sweeps read 0.
    pub fn progress(&self) -> f64 { if self.is_candidate() { self.progress } else { 0.0 } }

    /// Feed one sample. Returns an activation exactly once per completed gesture.
    pub fn on_move(&mut self, s: Sample, suppressed: Suppressed) -> Option<Activation> {
        let out = self.step(s, suppressed);
        if out.is_some() || !self.is_candidate() { self.progress = 0.0; }
        out
    }

    fn step(&mut self, s: Sample, suppressed: Suppressed) -> Option<Activation> {
        if s.injected { return None; }
        if s.t_ms < self.last_t { self.state = State::Idle; }
        let gap = s.t_ms - self.last_t; self.last_t = s.t_ms;
        if suppressed || s.button_down { self.state = State::Idle; return None; }
        let o = self.opts;
        if let State::Spent { rect, last_t } = &mut self.state {
            let rested = (s.t_ms - *last_t) >= o.rest_ms || gap >= o.rest_ms;
            let left = !inside(*rect, s.x, s.y, o.tolerance);
            *last_t = s.t_ms;
            if rested || left { self.state = State::Idle; } else { return None; }
        }
        if let State::Idle = self.state {
            if let Some(l) = self.layout.hit(s.x, s.y).cloned() {
                if let Some(rect) = self.layout.pixel_rect(&l) { self.state = State::Candidate { id: l.id, tool: l.tool, rect, pts: vec![Pt { x: s.x, y: s.y, t: s.t_ms }] }; }
            }
            return None;
        }
        if let State::Candidate { id, tool, rect, pts } = &mut self.state {
            if !inside(*rect, s.x, s.y, o.tolerance) { self.state = State::Idle; return None; }
            pts.push(Pt { x: s.x, y: s.y, t: s.t_ms });
            while pts.first().map_or(false, |p| s.t_ms - p.t > o.window_ms) { pts.remove(0); }
            if s.t_ms < self.cooldown_until { self.progress = 0.0; return None; }
            let n = reversals(pts, |p| p.x, o.min_travel).max(reversals(pts, |p| p.y, o.min_travel));
            self.progress = (n as f64 / o.reversals.max(1) as f64).min(1.0);
            if pts.len() >= 4 && n >= o.reversals {
                let act = Activation { landmark_id: id.clone(), tool: *tool, x: s.x, y: s.y };
                self.cooldown_until = s.t_ms + o.cooldown_ms;
                self.state = State::Spent { rect: *rect, last_t: s.t_ms };
                return Some(act);
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn screen() -> Vec<Monitor> { vec![Monitor { id: "M1".into(), x: 0, y: 0, w: 1920, h: 1080, scale: 1.0 }] }
    fn layout() -> Layout { Layout { monitors: screen(), landmarks: default_presets("M1") } }
    fn engine() -> Engine { Engine::new(layout(), DEFAULT_OPTS) }
    type Path = Vec<(f64, f64)>;
    fn wiggle(cx: f64, cy: f64, amp: f64, strokes: usize, per: usize) -> Path {
        let mut p = vec![(cx - amp / 2.0, cy)];
        for s in 0..strokes { for i in 1..=per { let k = i as f64 / per as f64; p.push((cx - amp / 2.0 + if s % 2 == 0 { amp * k } else { amp - amp * k }, cy)); } }
        p
    }
    fn run_flags(e: &mut Engine, path: &Path, t0: f64, step: f64, down: bool, injected: bool, sup: bool) -> Vec<Activation> {
        path.iter().enumerate().filter_map(|(i, (x, y))| e.on_move(Sample { x: *x, y: *y, t_ms: t0 + i as f64 * step, button_down: down, injected }, sup)).collect()
    }
    fn run_with(e: &mut Engine, p: &Path, t0: f64, step: f64, down: bool) -> Vec<Activation> { run_flags(e, p, t0, step, down, false, false) }
    fn run(p: &Path) -> Vec<Activation> { run_with(&mut engine(), p, 0.0, 8.0, false) }
    const TR: (f64, f64) = (1805.0, 86.0);

    #[test] fn deliberate_wiggle_in_region_opens_its_tool() { let a = run(&wiggle(TR.0, TR.1, 80.0, 6, 8)); assert_eq!(a.len(), 1); assert_eq!(a[0].tool, Tool::QuickCapture); assert_eq!(a[0].landmark_id, "preset-M1-top-right"); }
    #[test] fn each_preset_maps_to_its_own_tool() {
        for (cx, cy, tool) in [(25.0, 540.0, Tool::ClipboardShelf), (1805.0, 990.0, Tool::ProjectShelf), (115.0, 86.0, Tool::QuickRecall)] {
            let amp = if cx < 60.0 { 36.0 } else { 80.0 };
            let a = run_with(&mut engine(), &wiggle(cx, cy, amp, 7, 8), 0.0, 8.0, false);
            assert_eq!(a.iter().map(|x| x.tool).collect::<Vec<_>>(), vec![tool], "at ({cx},{cy})");
        }
    }
    #[test] fn same_wiggle_outside_any_region_does_nothing() { assert!(run(&wiggle(960.0, 540.0, 80.0, 8, 8)).is_empty()); }
    #[test] fn entering_a_region_does_not_trigger() { assert!(run(&(0..80).map(|i| (1500.0 + i as f64 * 5.0, 86.0)).collect()).is_empty()); }
    #[test] fn hovering_and_scrolling_in_place_do_not_trigger() {
        assert!(run(&(0..400).map(|_| TR).collect()).is_empty());
        assert!(run(&(0..400).map(|i| (TR.0 + (i % 2) as f64 * 3.0, TR.1)).collect()).is_empty());
    }
    #[test] fn single_direction_change_does_not_trigger() {
        let mut p: Path = (0..30).map(|i| (1720.0 + i as f64 * 6.0, 86.0)).collect(); p.extend((0..30).map(|i| (1900.0 - i as f64 * 6.0, 86.0)));
        assert!(run(&p).is_empty());
    }
    #[test] fn ordinary_navigation_with_small_corrections_does_not_trigger() {
        let mut p: Path = (0..40).map(|i| (1500.0 + i as f64 * 9.0, 60.0)).collect();
        for d in [-14.0, 10.0, -8.0, 6.0, -4.0, 3.0] { let last = p.last().unwrap().0; p.push((last + d, 60.0)); }
        assert!(run(&p).is_empty());
    }
    #[test] fn slow_wandering_is_not_a_wiggle() { assert!(run_with(&mut engine(), &wiggle(TR.0, TR.1, 80.0, 6, 8), 0.0, 90.0, false).is_empty()); }
    #[test] fn button_held_dragging_never_triggers() { assert!(run_with(&mut engine(), &wiggle(TR.0, TR.1, 80.0, 8, 8), 0.0, 8.0, true).is_empty()); }
    #[test] fn injected_movement_is_ignored() { assert!(run_flags(&mut engine(), &wiggle(TR.0, TR.1, 80.0, 8, 8), 0.0, 8.0, false, true, false).is_empty()); }
    #[test] fn pause_and_suppression_block_gestures() { assert!(run_flags(&mut engine(), &wiggle(TR.0, TR.1, 80.0, 8, 8), 0.0, 8.0, false, false, true).is_empty()); }
    #[test] fn leaving_the_region_cancels_the_candidate() {
        let mut p: Path = vec![]; let mut x = 1700.0;
        for s in 0..8 { for _ in 0..4 { x += if s % 2 == 0 { 22.0 } else { -30.0 }; p.push((x, 86.0)); } }
        assert!(run(&p).is_empty());
    }
    #[test] fn tool_never_changes_mid_gesture() {
        let mut p = wiggle(1800.0, 150.0, 40.0, 2, 8);
        p.extend((0..40).map(|i| (1800.0, 150.0 + i as f64 * 20.0))); p.extend(wiggle(1800.0, 990.0, 80.0, 2, 8));
        assert!(run_with(&mut engine(), &p, 0.0, 8.0, false).iter().all(|x| x.tool != Tool::QuickCapture));
    }
    #[test] fn boundary_tolerance_allows_small_excursions() { assert_eq!(run(&wiggle(1690.0, 86.0, 40.0, 10, 8)).len(), 1); }
    #[test] fn continuous_wiggling_triggers_once() { assert_eq!(run_with(&mut engine(), &wiggle(TR.0, TR.1, 80.0, 40, 8), 0.0, 8.0, false).len(), 1); }
    #[test] fn retriggers_after_pause_and_cooldown() {
        let mut e = engine();
        let a1 = run_with(&mut e, &wiggle(TR.0, TR.1, 80.0, 6, 8), 0.0, 8.0, false);
        let a2 = run_with(&mut e, &wiggle(TR.0, TR.1, 80.0, 6, 8), 3000.0, 8.0, false);
        assert_eq!((a1.len(), a2.len()), (1, 1));
    }
    #[test] fn cooldown_blocks_a_quick_second_gesture_even_after_a_pause() {
        let mut e = engine();
        let a1 = run_with(&mut e, &wiggle(TR.0, TR.1, 80.0, 6, 8), 0.0, 8.0, false);
        let a2 = run_with(&mut e, &wiggle(TR.0, TR.1, 80.0, 3, 8), 600.0, 8.0, false);
        assert_eq!((a1.len(), a2.len()), (1, 0));
    }
    #[test] fn disabled_landmark_is_inert() { let mut e = engine(); for l in &mut e.layout.landmarks { l.enabled = false; } assert!(run_with(&mut e, &wiggle(TR.0, TR.1, 80.0, 8, 8), 0.0, 8.0, false).is_empty()); }
    #[test] fn sensitivity_changes_what_counts() {
        let small = wiggle(TR.0, TR.1, 28.0, 6, 6);
        let mut firm = engine(); firm.opts = GestureOpts::from_sensitivity(0);
        let mut light = engine(); light.opts = GestureOpts::from_sensitivity(100);
        assert_eq!(GestureOpts::from_sensitivity(50), DEFAULT_OPTS);
        assert!(run_with(&mut firm, &small, 0.0, 8.0, false).is_empty());
        assert_eq!(run_with(&mut light, &small, 0.0, 8.0, false).len(), 1);
    }
    #[test] fn progress_rises_and_clears_on_fire_cancel_and_idle() {
        let mut e = engine(); let mut seen = vec![]; let mut fired = false;
        for (i, (x, y)) in wiggle(TR.0, TR.1, 80.0, 6, 8).iter().enumerate() {
            fired |= e.on_move(Sample { x: *x, y: *y, t_ms: i as f64 * 8.0, button_down: false, injected: false }, false).is_some(); seen.push(e.progress());
        }
        assert!(fired); assert!(seen.iter().any(|p| *p >= 0.5 && *p < 1.0), "{seen:?}"); assert_eq!(e.progress(), 0.0);
        let mut e = engine();
        for i in 0..60 { e.on_move(Sample { x: 1700.0 + i as f64 * 3.0, y: 86.0, t_ms: i as f64 * 8.0, button_down: false, injected: false }, false); assert_eq!(e.progress(), 0.0); }
        let mut e = engine();
        for (i, (x, y)) in wiggle(TR.0, TR.1, 80.0, 2, 8).iter().enumerate() { e.on_move(Sample { x: *x, y: *y, t_ms: i as f64 * 8.0, button_down: false, injected: false }, false); }
        assert!(e.progress() > 0.0);
        e.on_move(Sample { x: 900.0, y: 600.0, t_ms: 400.0, button_down: false, injected: false }, false); assert_eq!(e.progress(), 0.0);
    }
    #[test] fn presets_are_valid_and_do_not_overlap() { validate(&default_presets("M1")).unwrap(); }
    #[test] fn overlap_is_rejected_with_a_clear_message() {
        let mut l = default_presets("M1"); l[1].rect = Rect { x: 0.05, y: 0.05, w: 0.2, h: 0.3 };
        let e = validate(&l).unwrap_err().to_string(); assert!(e.contains("Left edge") && e.contains("Top left") && e.contains("can't overlap"), "{e}");
    }
    #[test] fn same_rect_on_different_monitors_is_fine() { let mut l = default_presets("M1"); l.extend(default_presets("M2")); validate(&l).unwrap(); }
    #[test] fn bad_rects_are_rejected() {
        let mut l = default_presets("M1"); l[0].rect.w = 0.5; assert!(matches!(validate(&l), Err(LandmarkError::OutOfBounds(_))));
        let mut l = default_presets("M1"); l[0].rect.h = 0.01; assert!(matches!(validate(&l), Err(LandmarkError::TooSmall(_))));
        let mut l = default_presets("M1"); l[0].name = "  ".into(); assert!(matches!(validate(&l), Err(LandmarkError::EmptyName(_))));
    }
    #[test] fn negative_desktop_coordinates_and_mixed_scaling() {
        let m2 = Monitor { id: "M2".into(), x: -3840, y: -200, w: 3840, h: 2160, scale: 2.0 };
        let mut lay = Layout { monitors: vec![screen()[0].clone(), m2], landmarks: default_presets("M2") }; lay.landmarks.extend(default_presets("M1"));
        let hit = lay.hit(-3840.0 + 3840.0 * 0.94, -200.0 + 2160.0 * 0.05).unwrap(); assert_eq!((hit.monitor_id.as_str(), hit.tool), ("M2", Tool::QuickCapture));
        assert_eq!(lay.hit(1805.0, 86.0).unwrap().monitor_id, "M1"); assert!(lay.hit(-10.0, 500.0).is_none());
    }
    #[test] fn wiggle_works_on_a_negative_coordinate_monitor() {
        let m2 = Monitor { id: "M2".into(), x: -3840, y: -200, w: 3840, h: 2160, scale: 2.0 };
        let mut e = Engine::new(Layout { monitors: vec![m2], landmarks: default_presets("M2") }, DEFAULT_OPTS);
        assert_eq!(run_with(&mut e, &wiggle(-3840.0 + 3840.0 * 0.94, -200.0 + 2160.0 * 0.07, 90.0, 7, 8), 0.0, 8.0, false).len(), 1);
    }
    #[test] fn resolution_change_with_same_shape_keeps_landmarks_working() {
        let mut lay = layout();
        assert!(lay.reconcile(vec![Monitor { id: "M1".into(), x: 0, y: 0, w: 2560, h: 1440, scale: 1.25 }]).is_empty());
        assert_eq!(lay.hit(2560.0 * 0.94, 1440.0 * 0.05).unwrap().tool, Tool::QuickCapture);
    }
    #[test] fn disconnected_or_reshaped_monitor_flags_landmarks_for_review() {
        let mut lay = Layout { monitors: vec![screen()[0].clone(), Monitor { id: "M2".into(), x: 1920, y: 0, w: 1920, h: 1080, scale: 1.0 }], landmarks: default_presets("M2") };
        assert_eq!(lay.reconcile(screen()).len(), 4); assert!(lay.hit(1920.0 + 1805.0, 86.0).is_none());
        let mut lay = layout(); assert_eq!(lay.reconcile(vec![Monitor { id: "M1".into(), x: 0, y: 0, w: 3440, h: 1440, scale: 1.0 }]).len(), 4);
    }
    #[test] fn layout_round_trips_through_json() { let lay = layout(); let s = serde_json::to_string(&lay).unwrap(); assert!(s.contains("quick-capture")); assert_eq!(serde_json::from_str::<Layout>(&s).unwrap(), lay); }
}
