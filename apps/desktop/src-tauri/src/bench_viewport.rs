use tauri::{LogicalSize, WebviewWindow};

pub fn set_size(window: &WebviewWindow, requested: LogicalSize<f64>) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    let requested = {
        let scale_factor = window.scale_factor()?;
        let frame = window.outer_size()?.to_logical::<f64>(scale_factor);
        let viewport = window.as_ref().bounds()?.size.to_logical::<f64>(scale_factor);
        window_size_for_viewport(requested, frame, viewport)
    };
    window.set_size(requested)
}

#[cfg(any(target_os = "macos", test))]
fn window_size_for_viewport(
    requested: LogicalSize<f64>,
    frame: LogicalSize<f64>,
    viewport: LogicalSize<f64>,
) -> LogicalSize<f64> {
    // The visible title bar's full-size content includes chrome outside WKWebView (#1560).
    LogicalSize::new(
        frame.width + requested.width - viewport.width,
        frame.height + requested.height - viewport.height,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::Size;

    #[test]
    fn window_grows_by_the_measured_webview_shortfall() {
        let requested = LogicalSize::new(900.0, 600.0);
        let frame = LogicalSize::new(900.0, 600.0);
        for title_bar in [0.0, 32.0, 28.0, 38.5] {
            let viewport = LogicalSize::new(900.0, 600.0 - title_bar);
            assert_eq!(
                window_size_for_viewport(requested, frame, viewport),
                LogicalSize::new(900.0, 600.0 + title_bar),
            );
        }
    }

    #[test]
    fn frame_and_webview_units_resolve_to_the_same_logical_size() {
        let requested = LogicalSize::new(900.0, 600.0);
        for scale_factor in [1.0, 1.5, 2.0] {
            let physical_frame = requested.to_physical::<u32>(scale_factor);
            let logical_viewport = LogicalSize::new(900.0, 568.0);
            for bounds_size in [
                Size::Logical(logical_viewport),
                Size::Physical(logical_viewport.to_physical::<u32>(scale_factor)),
            ] {
                assert_eq!(
                    window_size_for_viewport(
                        requested,
                        physical_frame.to_logical(scale_factor),
                        bounds_size.to_logical(scale_factor),
                    ),
                    LogicalSize::new(900.0, 632.0),
                );
            }
        }
    }

    #[test]
    fn restored_geometry_is_replaced_without_changing_the_measured_insets() {
        assert_eq!(
            window_size_for_viewport(
                LogicalSize::new(900.0, 600.0),
                LogicalSize::new(1200.0, 800.0),
                LogicalSize::new(1196.0, 768.0),
            ),
            LogicalSize::new(904.0, 632.0),
        );
    }

    #[test]
    fn matching_viewport_is_unchanged_and_oversized_viewport_shrinks() {
        let requested = LogicalSize::new(900.0, 600.0);
        let frame = LogicalSize::new(900.0, 632.0);
        assert_eq!(window_size_for_viewport(requested, frame, requested), frame);
        assert_eq!(
            window_size_for_viewport(
                requested,
                LogicalSize::new(1000.0, 732.0),
                LogicalSize::new(1000.0, 700.0),
            ),
            frame,
        );
    }
}
