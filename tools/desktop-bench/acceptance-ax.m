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

static void key(pid_t processId, NSString *name) {
    NSDictionary *codes = @{@"down": @125, @"home": @115, @"escape": @53, @"quit": @12, @"palette": @40};
    NSNumber *code = codes[name];
    if (!code) @throw [NSException exceptionWithName:@"Input" reason:@"Unknown keyboard operation" userInfo:nil];
    [[NSRunningApplication runningApplicationWithProcessIdentifier:processId] activateWithOptions:NSApplicationActivateIgnoringOtherApps];
    usleep(250000);
    for (NSNumber *pressed in @[@YES, @NO]) {
        CGEventRef event = CGEventCreateKeyboardEvent(NULL, code.unsignedShortValue, pressed.boolValue);
        CGEventSetFlags(event, ([name isEqual:@"quit"] || [name isEqual:@"palette"]) ? kCGEventFlagMaskCommand : 0);
        CGEventPost(kCGHIDEventTap, event);
        CFRelease(event);
    }
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 3) return 2;
        pid_t processId = atoi(argv[1]);
        NSString *command = @(argv[2]);
        @try {
            if ([command isEqual:@"terminate"]) {
                if (![[NSRunningApplication runningApplicationWithProcessIdentifier:processId] terminate]) return 1;
                return 0;
            }
            NSDictionary *result;
            if ([command isEqual:@"dump"]) result = captureTree(processId);
            else {
                key(processId, command);
                result = @{@"sent": command};
            }
            NSData *encoded = [NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingPrettyPrinted error:NULL];
            fwrite(encoded.bytes, 1, encoded.length, stdout);
            return 0;
        } @catch (NSException *exception) {
            fprintf(stderr, "%s\n", exception.reason.UTF8String);
            return 1;
        }
    }
}
