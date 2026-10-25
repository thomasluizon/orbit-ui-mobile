#import <AppKit/AppKit.h>
#import <UserNotifications/UserNotifications.h>
#import <Security/Security.h>
#import <objc/runtime.h>
#include <stdatomic.h>

typedef void (*OrbitPushCallback)(int, const unsigned char *, size_t);
static OrbitPushCallback callback;
static BOOL installed;
static atomic_bool active;

static void emit(int kind, NSString *payload) {
    NSData *bytes = [payload dataUsingEncoding:NSUTF8StringEncoding];
    callback(kind, bytes.bytes, bytes.length);
}

static BOOL configured(void) {
    SecTaskRef task = SecTaskCreateFromSelf(kCFAllocatorDefault);
    if (!task) return NO;
    CFTypeRef entitlement = SecTaskCopyValueForEntitlement(task, CFSTR("com.apple.developer.aps-environment"), NULL);
    CFRelease(task);
    BOOL enabled = entitlement && CFGetTypeID(entitlement) == CFStringGetTypeID()
        && (CFEqual(entitlement, CFSTR("development")) || CFEqual(entitlement, CFSTR("production")));
    if (entitlement) CFRelease(entitlement);
    return enabled;
}

static void registered(id delegate, SEL selector, NSApplication *application, NSData *token) {
    NSMutableString *hex = [NSMutableString stringWithCapacity:token.length * 2];
    const unsigned char *bytes = token.bytes;
    for (NSUInteger index = 0; index < token.length; index++) [hex appendFormat:@"%02x", bytes[index]];
    emit(4, hex);
}

static void failed(id delegate, SEL selector, NSApplication *application, NSError *error) {
    emit(7, @"");
}

@interface OrbitPushDelegate : NSObject <UNUserNotificationCenterDelegate>
@end

@implementation OrbitPushDelegate
- (void)userNotificationCenter:(UNUserNotificationCenter *)center willPresentNotification:(UNNotification *)notification withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler {
    emit(5, @"");
    completionHandler(atomic_load(&active) ? (UNNotificationPresentationOptionBanner | UNNotificationPresentationOptionList | UNNotificationPresentationOptionSound) : UNNotificationPresentationOptionNone);
}
- (void)userNotificationCenter:(UNUserNotificationCenter *)center didReceiveNotificationResponse:(UNNotificationResponse *)response withCompletionHandler:(void (^)(void))completionHandler {
    if ([response.actionIdentifier isEqualToString:UNNotificationDefaultActionIdentifier]) {
        NSData *payload = [NSJSONSerialization dataWithJSONObject:response.notification.request.content.userInfo options:0 error:nil];
        callback(6, payload.bytes, payload.length);
    }
    completionHandler();
}
@end

static OrbitPushDelegate *notificationDelegate;

void orbit_push_init(OrbitPushCallback handler) {
    callback = handler;
    if (!configured()) return;
    notificationDelegate = [OrbitPushDelegate new];
    UNUserNotificationCenter.currentNotificationCenter.delegate = notificationDelegate;
    Class delegateClass = object_getClass(NSApp.delegate);
    BOOL tokenAdded = class_addMethod(delegateClass, @selector(application:didRegisterForRemoteNotificationsWithDeviceToken:), (IMP)registered, "v@:@@");
    BOOL failureAdded = class_addMethod(delegateClass, @selector(application:didFailToRegisterForRemoteNotificationsWithError:), (IMP)failed, "v@:@@");
    installed = tokenAdded && failureAdded;
}

static void finish(UNAuthorizationStatus status, BOOL token) {
    if (status == UNAuthorizationStatusDenied) { emit(3, @""); return; }
    if (status == UNAuthorizationStatusNotDetermined) { emit(1, @""); return; }
    emit(2, @"");
    if (token) dispatch_async(dispatch_get_main_queue(), ^{ [NSApp registerForRemoteNotifications]; });
}

void orbit_push_request(BOOL prompt, BOOL token) {
    if (!configured()) { emit(0, @""); return; }
    if (!installed) { emit(7, @""); return; }
    UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
    [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
        if (prompt && settings.authorizationStatus == UNAuthorizationStatusNotDetermined) {
            [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound) completionHandler:^(BOOL granted, NSError *error) {
                if (error) { emit(7, @""); return; }
                finish(granted ? UNAuthorizationStatusAuthorized : UNAuthorizationStatusDenied, token);
            }];
        } else finish(settings.authorizationStatus, token);
    }];
}

BOOL orbit_push_stop(void) {
    if (!configured()) return YES;
    dispatch_sync(dispatch_get_main_queue(), ^{
        [NSApp unregisterForRemoteNotifications];
        [UNUserNotificationCenter.currentNotificationCenter removeAllDeliveredNotifications];
    });
    return YES;
}

void orbit_push_set_active(BOOL enabled) {
    atomic_store(&active, enabled);
    if (!enabled && configured()) orbit_push_stop();
}
