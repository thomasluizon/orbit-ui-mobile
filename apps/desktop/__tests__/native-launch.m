#import "../src-tauri/native/macos/launch.m"
#include <assert.h>

@interface RecordingMark : NSImage
@property NSRect target;
@end

@implementation RecordingMark
- (void)drawInRect:(NSRect)rect { self.target = rect; }
@end

static void assertMarkFrame(OrbitLaunchView *launch, NSSize bounds, NSRect expected) {
    launch.frame = NSMakeRect(0, 0, bounds.width, bounds.height);
    NSImage *original = launch.mark;
    RecordingMark *recording = [[RecordingMark alloc] initWithSize:NSMakeSize(512, 512)];
    launch.mark = recording;
    NSImage *surface = [[NSImage alloc] initWithSize:bounds];
    [surface lockFocus];
    [launch drawRect:launch.bounds];
    [surface unlockFocus];
    assert(NSEqualRects(recording.target, expected));
    launch.mark = original;
}

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
            NSImage *originalMark = launch.mark;
            NSTimer *originalDeadline = launch.deadline;
            assert(orbit_launch_install((__bridge void *)web, png.bytes, png.length, 9, 9, 11));
            assert(parent.subviews.count == 2);
            assert(launch.mark != originalMark);
            assert(launch.canvas.redComponent == 9 / 255.0);
            assert(launch.canvas.blueComponent == 11 / 255.0);
            assert(launch.deadline == originalDeadline);
            [parent setFrameSize:NSMakeSize(1000, 700)];
            assert(NSEqualRects(launch.frame, web.frame));
            assertMarkFrame(launch, NSMakeSize(1000, 700), NSMakeRect(436, 286, 128, 128));
            assertMarkFrame(launch, NSMakeSize(80, 100), NSMakeRect(0, 10, 80, 80));
            NSTimer *firstDeadline = launch.deadline;
            orbit_launch_set_visible((__bridge void *)web, false);
            assert(launch.hidden && !firstDeadline.valid);
            assert(orbit_launch_install((__bridge void *)web, png.bytes, png.length, 250, 250, 250));
            assert(launch.hidden && !launch.deadline);
            assert(launch.canvas.redComponent == 250 / 255.0);
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
