#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>

static void failAX(AXError error, NSString *operation, NSDictionary *node) {
    @throw [NSException exceptionWithName:@"AXRead"
        reason:[NSString stringWithFormat:@"%@ returned %d for %@ at %@", operation, error, node[@"role"], node[@"id"]]
        userInfo:@{@"code": @(error), @"node": [node copy]}];
}

static id attribute(AXUIElementRef element, CFStringRef key, NSDictionary *node) {
    CFTypeRef value = NULL;
    AXError error = AXUIElementCopyAttributeValue(element, key, &value);
    if (error == kAXErrorAttributeUnsupported || error == kAXErrorNoValue) return nil;
    if (error != kAXErrorSuccess) {
        failAX(error, [NSString stringWithFormat:@"AXUIElementCopyAttributeValue(%@)", key], node);
    }
    return CFBridgingRelease(value);
}

static BOOL focusable(AXUIElementRef element, NSDictionary *node) {
    Boolean settable = false;
    AXError error = AXUIElementIsAttributeSettable(element, kAXFocusedAttribute, &settable);
    if (error == kAXErrorAttributeUnsupported || error == kAXErrorNoValue) return NO;
    if (error != kAXErrorSuccess) failAX(error, @"AXUIElementIsAttributeSettable(AXFocused)", node);
    return settable;
}

static BOOL interactive(NSDictionary *node, NSArray *children, NSArray *actions, BOOL webContent) {
    NSString *role = node[@"role"];
    BOOL empty = ![node[@"name"] length] && !children.count && ![node[@"focused"] boolValue] && ![node[@"focusable"] boolValue];
    // WebKit live regions advertise AXPress without being controls (#1983).
    if (webContent && [role isEqual:@"AXGroup"] && [node[@"AXSubrole"] isEqual:@"AXApplicationAlert"] &&
        ![node[@"focused"] boolValue] && ![node[@"focusable"] boolValue]) return NO;
    // An empty, unfocusable group is structural even when AXPress is advertised (#1560).
    if (empty && [role isEqual:@"AXGroup"] && [node[@"AXSubrole"] isEqual:@"AXEmptyGroup"]) return NO;
    // AppKit separators are disabled blank menu items: https://developer.apple.com/documentation/appkit/nsmenuitem/isseparatoritem
    if (!webContent && empty && [role isEqual:@"AXMenuItem"] && [node[@"AXEnabled"] isEqual:@NO]) return NO;
    NSArray *roles = @[@"AXButton", @"AXCheckBox", @"AXRadioButton", @"AXTextField", @"AXTextArea", @"AXComboBox", @"AXPopUpButton", @"AXLink", @"AXSlider", @"AXMenuItem", @"AXTab"];
    return [roles containsObject:role] || [actions containsObject:@"AXPress"];
}

static void walk(AXUIElementRef element, NSString *path, NSMutableArray *nodes, NSMutableSet *visited, BOOL insideWeb) {
    if ([visited containsObject:(__bridge id)element]) return;
    [visited addObject:(__bridge id)element];
    if (nodes.count >= 20000) @throw [NSException exceptionWithName:@"AXRead" reason:@"Accessibility tree exceeded node limit" userInfo:nil];
    NSMutableDictionary *node = [@{@"id": path, @"role": @"AXUnknown", @"name": @"", @"interactive": @NO,
        @"focused": @NO, @"selected": @NO} mutableCopy];
    [nodes addObject:node];
    NSString *role = attribute(element, kAXRoleAttribute, node) ?: @"";
    node[@"role"] = role;
    BOOL webContent = insideWeb || [role isEqual:@"AXWebArea"];
    node[@"focused"] = attribute(element, kAXFocusedAttribute, node) ?: @NO;
    node[@"selected"] = attribute(element, kAXSelectedAttribute, node) ?: @NO;
    for (NSString *key in @[@"AXTitle", @"AXDescription", @"AXEnabled", @"AXIdentifier", @"AXDOMIdentifier", @"AXDOMClassList", @"AXSubrole", @"AXRoleDescription", @"AXHidden"]) {
        id value = attribute(element, (__bridge CFStringRef)key, node);
        if (value) node[key] = value;
    }
    NSString *name = node[@"AXTitle"];
    if (!name.length) name = node[@"AXDescription"];
    NSArray *windowSubroles = @[@"AXCloseButton", @"AXFullScreenButton", @"AXMinimizeButton", @"AXZoomButton"];
    BOOL systemControl = ([role isEqual:@"AXButton"] && [windowSubroles containsObject:node[@"AXSubrole"]]) ||
        ([role isEqual:@"AXMenuBarItem"] && [node[@"AXSubrole"] isEqual:@"AXMenuExtra"]);
    // Native system subroles convey purpose through their localized role descriptions; web controls still need labels (#1560).
    if (!name.length && !webContent && systemControl) name = node[@"AXRoleDescription"];
    node[@"name"] = name ?: @"";
    node[@"focusable"] = @(focusable(element, node));
    CFArrayRef actions = NULL;
    AXError actionError = AXUIElementCopyActionNames(element, &actions);
    if (actionError != kAXErrorSuccess && actionError != kAXErrorNotImplemented && actionError != kAXErrorActionUnsupported) {
        failAX(actionError, @"AXUIElementCopyActionNames", node);
    }
    NSArray *actionNames = CFBridgingRelease(actions);
    node[@"actions"] = actionNames ?: @[];
    NSArray *children = attribute(element, kAXChildrenAttribute, node) ?: @[];
    // AXContents exposes a scroll area's content separately from its controls: https://developer.apple.com/documentation/applicationservices/kaxcontentsattribute
    NSArray *contents = attribute(element, kAXContentsAttribute, node) ?: @[];
    children = [children arrayByAddingObjectsFromArray:contents];
    node[@"interactive"] = @(interactive(node, children, actionNames, webContent));
    for (NSUInteger index = 0; index < children.count; index++) {
        walk((__bridge AXUIElementRef)children[index], [path stringByAppendingFormat:@"/%lu", (unsigned long)index], nodes, visited, webContent);
    }
}

static NSDictionary *captureTree(pid_t processId) {
    NSMutableArray *attempts = [NSMutableArray array];
    for (NSUInteger attempt = 0; attempt < 2; attempt++) {
        AXUIElementRef app = AXUIElementCreateApplication(processId);
        NSMutableArray *nodes = [NSMutableArray array];
        @try {
            walk(app, @"0", nodes, [NSMutableSet set], NO);
            return @{@"denied": @NO, @"error": [NSNull null], @"nodes": nodes, @"attempts": attempts};
        } @catch (NSException *exception) {
            NSNumber *code = exception.userInfo[@"code"];
            NSDictionary *node = exception.userInfo[@"node"] ?: @{};
            // AXError.h defines kAXErrorInvalidUIElement as an invalid reference; discard it and restart at the application.
            if (code && code.intValue == kAXErrorInvalidUIElement && attempt == 0) {
                [attempts addObject:@{@"error": exception.reason, @"failure": node, @"nodes": nodes}];
                continue;
            }
            BOOL root = [node[@"id"] isEqual:@"0"];
            BOOL denied = root && code && (code.intValue == kAXErrorAPIDisabled || (!AXIsProcessTrusted() && code.intValue == kAXErrorCannotComplete));
            return @{@"denied": @(denied), @"error": exception.reason, @"failure": node, @"nodes": nodes, @"attempts": attempts};
        } @finally {
            CFRelease(app);
        }
    }
    abort();
}

static id softAttribute(AXUIElementRef element, CFStringRef key) {
    CFTypeRef value = NULL;
    if (AXUIElementCopyAttributeValue(element, key, &value) != kAXErrorSuccess) return nil;
    return CFBridgingRelease(value);
}

static NSDictionary *closeWindows(pid_t processId) {
    AXUIElementRef app = AXUIElementCreateApplication(processId);
    NSArray *windows = softAttribute(app, kAXWindowsAttribute) ?: @[];
    CFRelease(app);
    NSUInteger closed = 0;
    for (id window in windows) {
        id button = softAttribute((__bridge AXUIElementRef)window, kAXCloseButtonAttribute);
        if (!button) continue;
        AXError error = AXUIElementPerformAction((__bridge AXUIElementRef)button, kAXPressAction);
        if (error != kAXErrorSuccess) failAX(error, @"AXUIElementPerformAction(AXPress)", @{@"id": @"window", @"role": @"AXButton"});
        closed++;
    }
    if (!closed) @throw [NSException exceptionWithName:@"AXRead" reason:@"Installed app has no window to close" userInfo:nil];
    return @{@"sent": @"close", @"closed": @(closed)};
}

static NSDictionary *listWindows(pid_t processId) {
    NSArray *all = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionAll, kCGNullWindowID));
    NSMutableArray *windows = [NSMutableArray array];
    for (NSDictionary *window in all) {
        if ([window[(__bridge NSString *)kCGWindowOwnerPID] intValue] != processId) continue;
        [windows addObject:@{@"layer": window[(__bridge NSString *)kCGWindowLayer] ?: @0,
            @"onscreen": @([window[(__bridge NSString *)kCGWindowIsOnscreen] boolValue])}];
    }
    return @{@"windows": windows};
}

static NSArray *actionNames(AXUIElementRef element) {
    CFArrayRef names = NULL;
    if (AXUIElementCopyActionNames(element, &names) != kAXErrorSuccess || !names) return @[];
    return CFBridgingRelease(names);
}

static NSString *labelledAction(AXUIElementRef element, NSArray *actions, NSString *label) {
    // A notification may expose its buttons as custom actions on its group, named or described by the button title.
    for (NSString *action in actions) {
        if ([action isEqual:label] || [action hasPrefix:[NSString stringWithFormat:@"Name:%@\n", label]]) return action;
        CFStringRef description = NULL;
        if (AXUIElementCopyActionDescription(element, (__bridge CFStringRef)action, &description) == kAXErrorSuccess && description) {
            if ([(__bridge NSString *)description isEqual:label]) { CFRelease(description); return action; }
            CFRelease(description);
        }
    }
    NSString *title = softAttribute(element, kAXTitleAttribute);
    if (![title length]) title = softAttribute(element, kAXDescriptionAttribute);
    if ([softAttribute(element, kAXRoleAttribute) isEqual:@"AXButton"] && [title isEqual:label] &&
        [actions containsObject:(__bridge NSString *)kAXPressAction]) return (__bridge NSString *)kAXPressAction;
    return nil;
}

static void collectNodes(AXUIElementRef element, NSInteger parent, NSMutableArray *nodes, NSString *label, NSUInteger depth) {
    if (nodes.count >= 5000 || depth > 40) return;
    NSString *role = softAttribute(element, kAXRoleAttribute) ?: @"";
    if ([role isEqual:@"AXMenuBar"]) return;
    NSMutableArray *texts = [NSMutableArray array];
    for (NSString *key in @[@"AXTitle", @"AXDescription", @"AXValue"]) {
        id value = softAttribute(element, (__bridge CFStringRef)key);
        if ([value isKindOfClass:[NSString class]] && [value length]) [texts addObject:value];
    }
    NSArray *actions = actionNames(element);
    NSMutableDictionary *node = [@{@"element": (__bridge id)element, @"parent": @(parent),
        @"text": [texts componentsJoinedByString:@" "], @"role": role, @"actions": actions} mutableCopy];
    for (NSString *key in @[@"AXSubrole", @"AXIdentifier"]) {
        id value = softAttribute(element, (__bridge CFStringRef)key);
        if ([value isKindOfClass:[NSString class]] && [value length]) node[key] = value;
    }
    NSString *action = labelledAction(element, actions, label);
    if (action) node[@"action"] = action;
    NSInteger index = (NSInteger)nodes.count;
    [nodes addObject:node];
    for (id child in softAttribute(element, kAXChildrenAttribute) ?: @[]) {
        collectNodes((__bridge AXUIElementRef)child, index, nodes, label, depth + 1);
    }
}

static void openNotificationCenter(void) {
    // Clicking the menu bar clock opens Notification Center; Control Center owns that menu extra.
    NSRunningApplication *control = [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.controlcenter"].firstObject;
    if (!control) return;
    AXUIElementRef app = AXUIElementCreateApplication(control.processIdentifier);
    id bar = softAttribute(app, (__bridge CFStringRef)@"AXExtrasMenuBar");
    CFRelease(app);
    for (id item in bar ? softAttribute((__bridge AXUIElementRef)bar, kAXChildrenAttribute) ?: @[] : @[]) {
        NSString *identifier = softAttribute((__bridge AXUIElementRef)item, (__bridge CFStringRef)@"AXIdentifier");
        if ([identifier rangeOfString:@"clock" options:NSCaseInsensitiveSearch].location == NSNotFound) continue;
        AXUIElementPerformAction((__bridge AXUIElementRef)item, kAXPressAction);
        usleep(1000000);
        return;
    }
}

static NSMutableArray *centerNodes(pid_t processId, NSString *label) {
    AXUIElementRef app = AXUIElementCreateApplication(processId);
    NSMutableArray *nodes = [NSMutableArray array];
    collectNodes(app, -1, nodes, label, 0);
    CFRelease(app);
    return nodes;
}

// The clock press toggles Notification Center, so a press while it is open closes it. Only the open center lists its
// notification history and the Edit Widgets button (notification-done.json and notification-expired.json on macos-latest).
static BOOL centerOpen(NSArray *nodes) {
    for (NSDictionary *node in nodes) {
        if ([node[@"AXIdentifier"] isEqual:@"AXNotificationListItems"] || [node[@"AXIdentifier"] isEqual:@"widget-editor-button"]) return YES;
    }
    return NO;
}

static NSDictionary *notification(NSString *title, NSString *label, BOOL invoke, BOOL openCenter) {
    if (!AXIsProcessTrusted()) return @{@"found": @NO, @"invoked": @NO, @"denied": @YES};
    NSRunningApplication *center = [NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.apple.notificationcenterui"].firstObject;
    if (!center) return @{@"found": @NO, @"invoked": @NO, @"error": @"Notification Center is not running"};
    NSMutableArray *nodes = centerNodes(center.processIdentifier, label);
    if (openCenter && !centerOpen(nodes)) {
        openNotificationCenter();
        nodes = centerNodes(center.processIdentifier, label);
    }
    NSUInteger count = nodes.count;
    // Every reply carries the whole Notification Center tree, so a run records the real layout whether or not it matched.
    NSMutableArray *tree = [NSMutableArray arrayWithCapacity:count];
    for (NSDictionary *node in nodes) {
        NSMutableDictionary *entry = [node mutableCopy];
        [entry removeObjectForKey:@"element"];
        [tree addObject:entry];
    }
    NSMutableArray *last = [NSMutableArray arrayWithCapacity:count];
    for (NSUInteger index = 0; index < count; index++) [last addObject:@(index)];
    for (NSInteger index = (NSInteger)count - 1; index > 0; index--) {
        NSInteger parent = [nodes[index][@"parent"] integerValue];
        if (parent >= 0 && [last[index] integerValue] > [last[parent] integerValue]) last[parent] = last[index];
    }
    NSDictionary *match = nil;
    NSUInteger matchSize = NSUIntegerMax;
    for (NSUInteger index = 0; index < count; index++) {
        NSUInteger end = [last[index] unsignedIntegerValue];
        NSMutableArray *texts = [NSMutableArray array];
        NSMutableArray *actions = [NSMutableArray array];
        for (NSUInteger member = index; member <= end; member++) {
            [texts addObject:nodes[member][@"text"]];
            if (nodes[member][@"action"]) [actions addObject:nodes[member]];
        }
        if (actions.count != 1 || end - index >= matchSize) continue;
        if ([[texts componentsJoinedByString:@" "] rangeOfString:title].location == NSNotFound) continue;
        match = actions[0];
        matchSize = end - index;
    }
    if (!match) {
        NSMutableArray *seen = [NSMutableArray array];
        for (NSDictionary *node in nodes) {
            if ([node[@"text"] length] || node[@"action"]) [seen addObject:@{@"role": node[@"role"], @"text": node[@"text"], @"action": node[@"action"] ?: @""}];
            if (seen.count >= 80) break;
        }
        return @{@"found": @NO, @"invoked": @NO, @"nodes": seen, @"tree": tree};
    }
    if (invoke) {
        AXError error = AXUIElementPerformAction((__bridge AXUIElementRef)match[@"element"], (__bridge CFStringRef)match[@"action"]);
        if (error != kAXErrorSuccess) failAX(error, @"AXUIElementPerformAction(notification)", @{@"id": @"notification", @"role": match[@"role"]});
    }
    return @{@"found": @YES, @"invoked": @(invoke), @"role": match[@"role"], @"action": match[@"action"], @"tree": tree};
}

// LaunchServices lists every registered copy of a bundle identifier, best match first, and names the copy it launches:
// NSWorkspace.h URLsForApplicationsWithBundleIdentifier: and URLForApplicationWithBundleIdentifier:
static NSDictionary *bundleCopies(NSString *identifier) {
    NSMutableArray *copies = [NSMutableArray array];
    for (NSURL *url in [NSWorkspace.sharedWorkspace URLsForApplicationsWithBundleIdentifier:identifier]) [copies addObject:url.path];
    NSURL *best = [NSWorkspace.sharedWorkspace URLForApplicationWithBundleIdentifier:identifier];
    return @{@"copies": copies, @"best": best.path ?: [NSNull null]};
}

// The system-wide element names the application that receives keyboard input: https://developer.apple.com/documentation/applicationservices/kaxfocusedapplicationattribute
static pid_t focusedProcess(void) {
    AXUIElementRef system = AXUIElementCreateSystemWide();
    id application = softAttribute(system, kAXFocusedApplicationAttribute);
    CFRelease(system);
    pid_t processId = 0;
    if (application) AXUIElementGetPid((__bridge AXUIElementRef)application, &processId);
    return processId;
}

// The macOS 14 SDK marks NSApplicationActivateIgnoringOtherApps as having no effect, and cooperative activation lets the
// system refuse an activation request: https://developer.apple.com/documentation/appkit/nsapplication/activate()
// Thus a trusted AX client also sets AXFrontmost on the application.
static void raiseProcess(pid_t processId) {
    [[NSRunningApplication runningApplicationWithProcessIdentifier:processId] activateWithOptions:0];
    AXUIElementRef app = AXUIElementCreateApplication(processId);
    AXUIElementSetAttributeValue(app, kAXFrontmostAttribute, kCFBooleanTrue);
    CFRelease(app);
}

static NSDictionary *key(pid_t processId, NSString *name) {
    NSDictionary *codes = @{@"down": @125, @"home": @115, @"escape": @53, @"quit": @12, @"palette": @40};
    NSNumber *code = codes[name];
    if (!code) @throw [NSException exceptionWithName:@"Input" reason:@"Unknown keyboard operation" userInfo:nil];
    NSString *activation = @"focused";
    if (focusedProcess() != processId) {
        activation = @"raised";
        raiseProcess(processId);
        for (int attempt = 0; attempt < 20 && focusedProcess() != processId; attempt++) usleep(100000);
    }
    usleep(250000);
    pid_t focused = focusedProcess();
    // The key goes only to the installed process while it is the focused application, so its key window takes it as a typed key.
    if (focused != processId) {
        @throw [NSException exceptionWithName:@"Input"
            reason:[NSString stringWithFormat:@"Process %d did not receive keyboard focus for %@; process %d has it", processId, name, focused] userInfo:nil];
    }
    // A key posted at the HID event tap gets its target process from the session's routing (CGEventTypes.h tap locations). On
    // hosted runners that routing lost whole keys while the shell was the focused application with a key window and a blinking
    // caret (#1560), so the key enters the shell's own event stream (CGEvent.h CGEventPostToPid).
    for (NSNumber *pressed in @[@YES, @NO]) {
        CGEventRef event = CGEventCreateKeyboardEvent(NULL, code.unsignedShortValue, pressed.boolValue);
        CGEventSetFlags(event, ([name isEqual:@"quit"] || [name isEqual:@"palette"]) ? kCGEventFlagMaskCommand : 0);
        CGEventPostToPid(processId, event);
        CFRelease(event);
    }
    return @{@"sent": name, @"delivery": @"process-event", @"activation": activation, @"focusedProcess": @(focused)};
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc < 3) return 2;
        pid_t processId = atoi(argv[1]);
        NSString *command = @(argv[2]);
        int arguments = [command isEqual:@"notification"] ? 7 : [command isEqual:@"bundles"] ? 4 : 3;
        if (argc != arguments) return 2;
        @try {
            if ([command isEqual:@"terminate"]) {
                if (![[NSRunningApplication runningApplicationWithProcessIdentifier:processId] terminate]) return 1;
                return 0;
            }
            NSDictionary *result;
            if ([command isEqual:@"dump"]) result = captureTree(processId);
            else if ([command isEqual:@"close"]) result = closeWindows(processId);
            else if ([command isEqual:@"windows"]) result = listWindows(processId);
            else if ([command isEqual:@"bundles"]) result = bundleCopies(@(argv[3]));
            else if ([command isEqual:@"notification"]) {
                result = notification(@(argv[3]), @(argv[4]), atoi(argv[5]) == 1, atoi(argv[6]) == 1);
            } else result = key(processId, command);
            NSData *encoded = [NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingPrettyPrinted error:NULL];
            fwrite(encoded.bytes, 1, encoded.length, stdout);
            return 0;
        } @catch (NSException *exception) {
            fprintf(stderr, "%s\n", exception.reason.UTF8String);
            return 1;
        }
    }
}
