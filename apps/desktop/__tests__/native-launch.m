#import "../src-tauri/native/macos/launch.m"
#include <assert.h>

int main(int count, const char *arguments[]) {
    assert(count == 3);
    @autoreleasepool {
        for (int index = 1; index < count; index++) {
            NSData *png = [NSData dataWithContentsOfFile:[NSString stringWithUTF8String:arguments[index]]];
            assert(png);
            NSView *parent = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 800, 600)];
            NSView *web = [[NSView alloc] initWithFrame:parent.bounds];
            web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
            [parent addSubview:web];
            unsigned char canvas = index == 1 ? 9 : 250;
            assert(orbit_launch_install((__bridge void *)web, png.bytes, png.length, canvas, canvas, canvas));
            OrbitLaunchView *launch = objc_getAssociatedObject(web, &launch_view_key);
            assert(parent.subviews.lastObject == launch);
            assert(!launch.hidden);
            assert(launch.mark.valid);
            assert(launch.opaque);
            assert(launch.deadline.valid);
            assert(launch.deadline.fireDate.timeIntervalSinceNow > 14);
            assert(launch.deadline.fireDate.timeIntervalSinceNow <= 15);
            [parent setFrameSize:NSMakeSize(1000, 700)];
            assert(NSEqualRects(launch.frame, web.frame));
            NSTimer *firstDeadline = launch.deadline;
            orbit_launch_set_visible((__bridge void *)web, false);
            assert(launch.hidden && !firstDeadline.valid);
            orbit_launch_set_visible((__bridge void *)web, true);
            assert(!launch.hidden && launch.deadline.valid);
            NSTimer *reloadDeadline = launch.deadline;
            orbit_launch_set_visible((__bridge void *)web, true);
            assert(!reloadDeadline.valid && launch.deadline.valid);
            [launch.deadline fire];
            assert(launch.hidden && !launch.deadline);
            orbit_launch_set_visible((__bridge void *)web, true);
            assert(!launch.hidden && launch.deadline.valid);
            [launch finish];
        }
    }
    return 0;
}
