use tauri::utils::config::{Color, WindowConfig};
use tauri::Theme;

pub fn configure(config: &mut WindowConfig) {
    let dark = config
        .theme
        .map_or_else(system_is_dark, |theme| theme == Theme::Dark);
    config.background_color = Some(canvas(dark));
}

fn system_is_dark() -> bool {
    unsafe { orbit_launch_is_dark() }
}

pub fn canvas(dark: bool) -> Color {
    if dark {
        Color(9, 9, 11, 255)
    } else {
        Color(250, 250, 250, 255)
    }
}

extern "C" {
    fn orbit_launch_is_dark() -> bool;
}
