//! Capture geometry in physical pixels, including negative monitor coordinates.
#[derive(Debug, PartialEq)]
pub struct Bounds {
    pub min: (u32, u32),
    pub max: (u32, u32),
    pub size: (u32, u32),
    pub position: (i32, i32),
}
pub fn fit(
    origin: (i32, i32),
    work: (u32, u32),
    scale: f64,
    size: (u32, u32),
    position: (i32, i32),
    center: bool,
) -> Bounds {
    let margin = ((8.0 * scale).round() as u32).min(work.0.min(work.1).saturating_sub(1) / 2);
    let max = (
        work.0
            .saturating_sub(2 * margin)
            .max(1)
            .min((1000.0 * scale).max(1.0) as u32),
        work.1
            .saturating_sub(2 * margin)
            .max(1)
            .min((800.0 * scale).max(1.0) as u32),
    );
    let min = (
        ((360.0 * scale) as u32).min(max.0),
        ((280.0 * scale) as u32).min(max.1),
    );
    let size = (size.0.clamp(min.0, max.0), size.1.clamp(min.1, max.1));
    let left = origin.0 + margin as i32;
    let top = origin.1 + margin as i32;
    let right = (origin.0 + work.0 as i32 - margin as i32 - size.0 as i32).max(left);
    let bottom = (origin.1 + work.1 as i32 - margin as i32 - size.1 as i32).max(top);
    let position = if center {
        (left + (right - left) / 2, top + (bottom - top) / 2)
    } else {
        (position.0.clamp(left, right), position.1.clamp(top, bottom))
    };
    Bounds {
        min,
        max,
        size,
        position,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn taskbar_and_overlarge_window() {
        let b = fit((0, 0), (1920, 1040), 1.0, (9000, 9000), (1900, 1030), false);
        assert_eq!(b.max, (1000, 800));
        assert_eq!(b.size, (1000, 800));
        assert_eq!(b.position, (912, 232));
    }
    #[test]
    fn second_monitor_negative_origin_and_dpi() {
        let b = fit(
            (-2560, -400),
            (2560, 1400),
            1.5,
            (600, 330),
            (5000, 5000),
            true,
        );
        assert_eq!(b.min, (540, 420));
        assert_eq!(b.size, (600, 420));
        assert_eq!(b.position, (-1580, 90));
    }
    #[test]
    fn small_work_area_beats_minimum() {
        let b = fit((200, 50), (320, 240), 2.0, (600, 330), (0, 0), false);
        assert_eq!(b.size, (288, 208));
        assert_eq!(b.position, (216, 66));
        assert_eq!(b.min, b.max);
    }
    #[test]
    fn resized_position_is_clamped_on_all_edges() {
        let b = fit(
            (-1920, 0),
            (1920, 1040),
            1.0,
            (500, 300),
            (-3000, -400),
            false,
        );
        assert_eq!(b.position, (-1912, 8));
        assert_eq!(b.size, (500, 300));
    }
    #[test]
    fn display_change_shrinks_existing_window() {
        let b = fit((0, 0), (800, 560), 1.0, (1500, 1000), (1000, 1000), false);
        assert_eq!(b.size, (784, 544));
        assert_eq!(b.position, (8, 8));
    }
}
