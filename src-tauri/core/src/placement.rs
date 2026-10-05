//! Where a compact tool window opens relative to the cursor. All values are physical pixels.
//! The window prefers the lower right of the cursor, flips to the other side when it would leave the work area,
//! and is always clamped inside it. The cursor is never covered when there is room to avoid it.
pub type Pt = (i32, i32);
pub type Sz = (u32, u32);

/// `work` is (origin, size) of the monitor work area that contains the cursor. `gap` keeps the window off the cursor.
pub fn place_near(cursor: Pt, win: Sz, work: (Pt, Sz), gap: i32) -> Pt {
    let (o, s) = work;
    let (w, h) = (win.0 as i32, win.1 as i32);
    let (right, bottom) = (o.0 + s.0 as i32, o.1 + s.1 as i32);
    let mut x = cursor.0 + gap;
    if x + w > right { x = cursor.0 - gap - w; }
    let mut y = cursor.1 + gap;
    if y + h > bottom { y = cursor.1 - gap - h; }
    // Last resort for windows larger than the free space on both sides: stay fully on screen.
    x = x.min(right - w).max(o.0);
    y = y.min(bottom - h).max(o.1);
    (x, y)
}

#[cfg(test)]
mod tests {
    use super::*;
    const W: (Pt, Sz) = ((0, 0), (1920, 1040));
    #[test] fn opens_below_right_when_there_is_room() { assert_eq!(place_near((500, 300), (400, 300), W, 16), (516, 316)); }
    #[test] fn top_right_corner_flips_left_but_stays_below() { assert_eq!(place_near((1900, 20), (400, 300), W, 16), (1484, 36)); }
    #[test] fn bottom_right_corner_flips_up_and_left() { assert_eq!(place_near((1900, 1030), (400, 300), W, 16), (1484, 714)); }
    #[test] fn bottom_left_corner_flips_up_only() { assert_eq!(place_near((10, 1030), (400, 300), W, 16), (26, 714)); }
    #[test] fn never_covers_the_cursor_when_there_is_room() {
        for &(cx, cy) in &[(0, 0), (1919, 0), (0, 1039), (1919, 1039), (960, 520), (1900, 500)] {
            let (x, y) = place_near((cx, cy), (400, 300), W, 16);
            assert!(!(cx >= x && cx < x + 400 && cy >= y && cy < y + 300), "cursor ({cx},{cy}) covered at ({x},{y})");
            assert!(x >= 0 && y >= 0 && x + 400 <= 1920 && y + 300 <= 1040);
        }
    }
    #[test] fn negative_origin_monitor_with_taskbar_offset() {
        let w: (Pt, Sz) = ((-2560, -180), (2560, 1400));
        assert_eq!(place_near((-20, -170), (500, 400), w, 20), (-540, -150));
        let (x, y) = place_near((-2550, 1200), (500, 400), w, 20); assert!(x >= -2560 && y + 400 <= 1220);
    }
    #[test] fn window_larger_than_work_area_is_pinned_to_the_origin() { assert_eq!(place_near((100, 100), (3000, 2000), ((0, 0), (800, 600)), 16), (0, 0)); }
}
