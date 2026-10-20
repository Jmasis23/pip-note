//! Deterministic hover policy, independent of Win32 and webview visibility.
#[derive(Clone, Copy)]
pub struct Sample {
    pub now: u64,
    pub monitor: isize,
    pub right: bool,
    pub top: bool,
    pub away_top: bool,
    pub over_surface: bool,
    pub interacting: bool,
    pub blocked: bool,
}
#[derive(Debug, PartialEq)]
pub enum Action {
    ShowDock(isize),
    HideDock,
    RevealDashboard,
}
#[derive(Default)]
pub struct Policy {
    dock: Option<isize>,
    last_inside: u64,
    top_since: Option<u64>,
    top_latched: bool,
}
impl Policy {
    pub fn tick(&mut self, s: Sample) -> Vec<Action> {
        let mut actions = Vec::new();
        if s.blocked {
            if self.dock.take().is_some() {
                actions.push(Action::HideDock);
            }
            self.top_since = None;
            self.top_latched = !s.away_top;
            return actions;
        }
        if s.right {
            if self.dock != Some(s.monitor) {
                self.dock = Some(s.monitor);
                actions.push(Action::ShowDock(s.monitor));
            }
            self.last_inside = s.now;
        } else if s.over_surface || s.interacting {
            self.last_inside = s.now;
        } else if self.dock.is_some() && s.now.saturating_sub(self.last_inside) >= 450 {
            self.dock = None;
            actions.push(Action::HideDock);
        }
        if s.away_top {
            self.top_latched = false;
            self.top_since = None;
        } else if s.top && !self.top_latched {
            let start = *self.top_since.get_or_insert(s.now);
            if s.now.saturating_sub(start) >= 175 {
                self.top_latched = true;
                self.top_since = None;
                actions.push(Action::RevealDashboard);
            }
        } else if !s.top {
            self.top_since = None;
        }
        actions
    }
}

pub fn physical_rect(
    (x, y, width, height): (f64, f64, f64, f64),
    scale: f64,
) -> (i32, i32, i32, i32) {
    (
        (x * scale).floor() as i32,
        (y * scale).floor() as i32,
        ((x + width) * scale).ceil() as i32,
        ((y + height) * scale).ceil() as i32,
    )
}
