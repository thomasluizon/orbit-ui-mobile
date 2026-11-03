#import <AppKit/AppKit.h>
#import <objc/runtime.h>

@interface OrbitLaunchView : NSView
@property NSImage *mark;
@property NSColor *canvas;
@property NSTimer *deadline;
- (void)present;
- (void)finish;
@end

@implementation OrbitLaunchView
- (BOOL)isOpaque { return YES; }
- (void)drawRect:(NSRect)rect {
    (void)rect;
    [self.canvas setFill];
    NSRectFill(self.bounds);
    CGFloat size = MIN(128, MIN(NSWidth(self.bounds), NSHeight(self.bounds)));
    NSRect target = NSMakeRect((NSWidth(self.bounds) - size) / 2,
        (NSHeight(self.bounds) - size) / 2, size, size);
    [self.mark drawInRect:target];
}
- (void)present {
    [self.deadline invalidate];
    self.hidden = NO;
    [self setNeedsDisplay:YES];
    __weak OrbitLaunchView *weakSelf = self;
    self.deadline = [NSTimer timerWithTimeInterval:15 repeats:NO block:^(NSTimer *timer) {
        (void)timer;
        if (weakSelf.deadline == timer) [weakSelf finish];
    }];
    [NSRunLoop.mainRunLoop addTimer:self.deadline forMode:NSRunLoopCommonModes];
}
- (void)finish {
    [self.deadline invalidate];
    self.deadline = nil;
    self.hidden = YES;
}
- (void)dealloc { [self.deadline invalidate]; }
@end

static char launch_view_key;

bool orbit_launch_install(void *webview, const unsigned char *png, size_t length,
    unsigned char red, unsigned char green, unsigned char blue) {
    NSView *web = (__bridge NSView *)webview;
    NSImage *mark = [[NSImage alloc] initWithData:[NSData dataWithBytes:png length:length]];
    if (!web.superview || !mark) return false;
    OrbitLaunchView *launch = [[OrbitLaunchView alloc] initWithFrame:web.frame];
    launch.autoresizingMask = web.autoresizingMask;
    launch.mark = mark;
    launch.canvas = [NSColor colorWithSRGBRed:red / 255.0 green:green / 255.0 blue:blue / 255.0 alpha:1];
    launch.accessibilityElement = NO;
    [web.superview addSubview:launch positioned:NSWindowAbove relativeTo:web];
    objc_setAssociatedObject(web, &launch_view_key, launch, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    [launch present];
    return true;
}

void orbit_launch_set_visible(void *webview, bool visible) {
    OrbitLaunchView *launch = objc_getAssociatedObject((__bridge NSView *)webview, &launch_view_key);
    if (visible) [launch present];
    else [launch finish];
}

bool orbit_launch_is_dark(void) {
    if (@available(macOS 10.14, *)) {
        NSString *match = [NSApp.effectiveAppearance bestMatchFromAppearancesWithNames:
            @[NSAppearanceNameAqua, NSAppearanceNameDarkAqua]];
        return [match isEqualToString:NSAppearanceNameDarkAqua];
    }
    return false;
}
