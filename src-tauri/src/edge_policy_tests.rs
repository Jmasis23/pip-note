#[path = "edge_policy.rs"]
mod policy;
use policy::*;
fn input(t: u64) -> Sample {
    Sample {
        now: t,
        monitor: 1,
        right: false,
        top: false,
        away_top: true,
        over_surface: false,
        interacting: false,
        blocked: false,
    }
}
#[test]
fn right_enters_immediately_and_hides_after_grace() {
    let mut p = Policy::default();
    let mut s = input(0);
    s.right = true;
    assert_eq!(p.tick(s), vec![Action::ShowDock(1)]);
    assert!(p.tick(input(25)).is_empty());
    assert!(p.tick(input(449)).is_empty());
    assert_eq!(p.tick(input(475)), vec![Action::HideDock]);
}
#[test]
fn surface_and_keyboard_interaction_keep_dock_open() {
    let mut p = Policy::default();
    let mut s = input(0);
    s.right = true;
    p.tick(s);
    s = input(900);
    s.over_surface = true;
    assert!(p.tick(s).is_empty());
    s = input(1800);
    s.interacting = true;
    assert!(p.tick(s).is_empty());
    assert!(p.tick(input(2000)).is_empty());
    assert_eq!(p.tick(input(2275)), vec![Action::HideDock]);
}
#[test]
fn monitor_crossing_repositions_once() {
    let mut p = Policy::default();
    let mut s = input(0);
    s.right = true;
    p.tick(s);
    s.monitor = 2;
    s.now = 25;
    assert_eq!(p.tick(s), vec![Action::ShowDock(2)]);
    assert!(p.tick(s).is_empty());
}
#[test]
fn fullscreen_suppresses_reveal_and_hides_dock() {
    let mut p = Policy::default();
    let mut s = input(0);
    s.right = true;
    s.blocked = true;
    assert!(p.tick(s).is_empty());
    s.blocked = false;
    p.tick(s);
    s.blocked = true;
    assert_eq!(p.tick(s), vec![Action::HideDock]);
    s.top = true;
    s.now = 1000;
    assert!(p.tick(s).is_empty());
}
#[test]
fn top_dwell_latches_until_cursor_leaves_hysteresis_zone() {
    let mut p = Policy::default();
    let mut s = input(0);
    s.top = true;
    s.away_top = false;
    assert!(p.tick(s).is_empty());
    s.now = 175;
    assert_eq!(p.tick(s), vec![Action::RevealDashboard]);
    s.now = 1000;
    assert!(p.tick(s).is_empty());
    s.top = false;
    assert!(p.tick(s).is_empty());
    p.tick(input(1200));
    s.top = true;
    s.now = 1300;
    assert!(p.tick(s).is_empty());
    s.now = 1500;
    assert_eq!(p.tick(s), vec![Action::RevealDashboard]);
}
#[test]
fn blocked_top_requires_exit_before_rearming() {
    let mut p = Policy::default();
    let mut s = input(0);
    s.top = true;
    s.away_top = false;
    s.blocked = true;
    p.tick(s);
    s.blocked = false;
    s.now = 900;
    assert!(p.tick(s).is_empty());
    p.tick(input(1000));
    s.now = 1100;
    p.tick(s);
    s.now = 1300;
    assert_eq!(p.tick(s), vec![Action::RevealDashboard]);
}

#[test]
fn physical_regions_recalculate_for_dpi_and_negative_coordinates() {
    assert_eq!(
        physical_rect((-10.0, 20.0, 58.0, 100.0), 1.0),
        (-10, 20, 48, 120)
    );
    assert_eq!(
        physical_rect((-10.0, 20.0, 58.0, 100.0), 1.5),
        (-15, 30, 72, 180)
    );
}
