#import <AppKit/AppKit.h>

bool orbit_launch_is_dark(void) {
    if (@available(macOS 10.14, *)) {
        NSString *match = [NSApp.effectiveAppearance bestMatchFromAppearancesWithNames:
            @[NSAppearanceNameAqua, NSAppearanceNameDarkAqua]];
        return [match isEqualToString:NSAppearanceNameDarkAqua];
    }
    return false;
}
