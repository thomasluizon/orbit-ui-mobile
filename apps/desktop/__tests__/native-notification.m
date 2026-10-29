#import "../src-tauri/native/macos/push.m"
#include <assert.h>

@interface CapturedCenter : NSObject
@property NSSet<UNNotificationCategory *> *categories;
@end
@implementation CapturedCenter
- (void)setNotificationCategories:(NSSet<UNNotificationCategory *> *)categories { self.categories = categories; }
@end

static CapturedCenter *captured;
static id current_center(id receiver, SEL selector) { (void)receiver; (void)selector; return captured; }
static int event_kind;
static NSDictionary *event_payload;
static void capture(int kind, const unsigned char *bytes, size_t length) {
    event_kind = kind;
    NSData *payload = [NSData dataWithBytes:bytes length:length];
    event_payload = [NSJSONSerialization JSONObjectWithData:payload options:0 error:nil];
}

// WHY: The response selectors follow objc2-user-notifications generated UNNotificationResponse, UNNotification, UNNotificationRequest and UNNotificationContent (#1861).
@interface ResponseEnvelope : NSObject
@property NSString *actionIdentifier;
@property NSDictionary *userInfo;
@end
@implementation ResponseEnvelope
- (id)notification { return self; }
- (id)request { return self; }
- (id)content { return self; }
@end

@interface LaunchDelegate : NSObject
@property BOOL expectedNotificationLaunch;
@property BOOL launched;
@end
@implementation LaunchDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;
    assert(orbit_push_notification_launch() == self.expectedNotificationLaunch);
    self.launched = YES;
}
@end

int main(void) {
    @autoreleasepool {
        LaunchDelegate *launch = [LaunchDelegate new];
        assert(prepare_launch(launch));
        for (NSNumber *notificationLaunch in @[@YES, @NO]) {
            launch.expectedNotificationLaunch = notificationLaunch.boolValue;
            launch.launched = NO;
            NSDictionary *launchOptions = notificationLaunch.boolValue
                ? @{NSApplicationLaunchUserNotificationKey: [NSUserNotification new]} : @{};
            [launch applicationDidFinishLaunching:[NSNotification notificationWithName:NSApplicationDidFinishLaunchingNotification object:nil userInfo:launchOptions]];
            assert(launch.launched);
        }
        captured = [CapturedCenter new];
        Method center = class_getClassMethod(UNUserNotificationCenter.class, @selector(currentNotificationCenter));
        method_setImplementation(center, (IMP)current_center);
        orbit_push_category("Done");
        UNNotificationCategory *category = captured.categories.anyObject;
        assert([category.identifier isEqualToString:@"orbit-repeat-reminder"]);
        assert(category.actions.count == 1);
        UNNotificationAction *action = category.actions.firstObject;
        assert([action.identifier isEqualToString:@"orbit-reminder-done"]);
        assert([action.title isEqualToString:@"Done"]);
        assert((action.options & UNNotificationActionOptionForeground) == 0);
        orbit_push_category("Concluir");
        assert([captured.categories.anyObject.actions.firstObject.title isEqualToString:@"Concluir"]);
        callback = capture;
        OrbitPushDelegate *delegate = [OrbitPushDelegate new];
        ResponseEnvelope *response = [ResponseEnvelope new];
        response.userInfo = @{ @"body": @{ @"doneToken": @"one-use-token", @"habitId": @"11111111-1111-4111-8111-111111111111", @"url": @"/" } };
        NSArray *identifiers = @[@"orbit-reminder-done", UNNotificationDefaultActionIdentifier, UNNotificationDismissActionIdentifier];
        NSArray *kinds = @[@8, @6, @0];
        for (NSUInteger index = 0; index < identifiers.count; index++) {
            response.actionIdentifier = identifiers[index];
            event_kind = 0;
            __block BOOL completed = NO;
            [delegate userNotificationCenter:(id)captured didReceiveNotificationResponse:(id)response withCompletionHandler:^{ completed = YES; }];
            assert(event_kind == [kinds[index] intValue]);
            assert(completed);
            if (event_kind) assert([event_payload isEqual:response.userInfo]);
        }
    }
    return 0;
}
