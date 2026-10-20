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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn regions_respect_dpi_and_negative_coordinates() {
        assert_eq!(
            physical_rect((-10.0, 20.0, 58.0, 100.0), 1.0),
            (-10, 20, 48, 120)
        );
        assert_eq!(
            physical_rect((-10.0, 20.0, 58.0, 100.0), 1.5),
            (-15, 30, 72, 180)
        );
    }
}
