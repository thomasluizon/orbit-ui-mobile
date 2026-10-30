#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>

static id attribute(AXUIElementRef element, CFStringRef key) {
    CFTypeRef value = NULL;
    AXError error = AXUIElementCopyAttributeValue(element, key, &value);
    if (error == kAXErrorAttributeUnsupported || error == kAXErrorNoValue) return nil;
    if (error != kAXErrorSuccess) {
        @throw [NSException exceptionWithName:@"AXRead" reason:[NSString stringWithFormat:@"AXUIElementCopyAttributeValue(%@) returned %d", key, error] userInfo:nil];
    }
    return CFBridgingRelease(value);
}

static void walk(AXUIElementRef element, NSString *path, NSMutableArray *nodes, NSMutableSet *visited) {
    if ([visited containsObject:(__bridge id)element]) return;
    [visited addObject:(__bridge id)element];
    if (nodes.count >= 20000) @throw [NSException exceptionWithName:@"AXRead" reason:@"Accessibility tree exceeded node limit" userInfo:nil];
    NSString *role = attribute(element, kAXRoleAttribute) ?: @"";
    NSString *name = attribute(element, kAXTitleAttribute);
    if (!name.length) name = attribute(element, kAXDescriptionAttribute) ?: @"";
    CFArrayRef actions = NULL;
    AXError actionError = AXUIElementCopyActionNames(element, &actions);
    if (actionError != kAXErrorSuccess && actionError != kAXErrorNotImplemented && actionError != kAXErrorActionUnsupported) {
        @throw [NSException exceptionWithName:@"AXRead" reason:[NSString stringWithFormat:@"AXUIElementCopyActionNames returned %d", actionError] userInfo:nil];
    }
    NSArray *actionNames = CFBridgingRelease(actions);
    NSArray *interactiveRoles = @[@"AXButton", @"AXCheckBox", @"AXRadioButton", @"AXTextField", @"AXTextArea", @"AXComboBox", @"AXPopUpButton", @"AXLink", @"AXSlider", @"AXMenuItem", @"AXTab"];
    BOOL interactive = [interactiveRoles containsObject:role] || [actionNames containsObject:@"AXPress"];
    [nodes addObject:@{@"id": path, @"role": role, @"name": name,
        @"interactive": @(interactive), @"focused": attribute(element, kAXFocusedAttribute) ?: @NO,
        @"selected": attribute(element, kAXSelectedAttribute) ?: @NO}];
    NSArray *children = attribute(element, kAXChildrenAttribute) ?: @[];
    for (NSUInteger index = 0; index < children.count; index++) {
        walk((__bridge AXUIElementRef)children[index], [path stringByAppendingFormat:@"/%lu", (unsigned long)index], nodes, visited);
    }
}

static void key(pid_t processId, NSString *name) {
    NSDictionary *codes = @{@"down": @125, @"home": @115, @"escape": @53, @"quit": @12, @"palette": @40};
    NSNumber *code = codes[name];
    if (!code) @throw [NSException exceptionWithName:@"Input" reason:@"Unknown keyboard operation" userInfo:nil];
    [[NSRunningApplication runningApplicationWithProcessIdentifier:processId] activateWithOptions:NSApplicationActivateIgnoringOtherApps];
    usleep(250000);
    for (NSNumber *pressed in @[@YES, @NO]) {
        CGEventRef event = CGEventCreateKeyboardEvent(NULL, code.unsignedShortValue, pressed.boolValue);
        if ([name isEqual:@"quit"] || [name isEqual:@"palette"]) CGEventSetFlags(event, kCGEventFlagMaskCommand);
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
            AXUIElementRef app = AXUIElementCreateApplication(processId);
            CFTypeRef children = NULL;
            AXError error = AXUIElementCopyAttributeValue(app, kAXChildrenAttribute, &children);
            if (children) CFRelease(children);
            NSDictionary *result;
            if (error != kAXErrorSuccess) {
                BOOL denied = error == kAXErrorAPIDisabled || (!AXIsProcessTrusted() && error == kAXErrorCannotComplete);
                result = @{@"denied": @(denied), @"error": [NSString stringWithFormat:@"AXIsProcessTrusted=%@; AXUIElementCopyAttributeValue(AXChildren) returned %d", AXIsProcessTrusted() ? @"true" : @"false", error], @"nodes": @[]};
                if (!denied) { CFRelease(app); fprintf(stderr, "%s\n", [result[@"error"] UTF8String]); return 1; }
            } else if ([command isEqual:@"dump"]) {
                NSMutableArray *nodes = [NSMutableArray array];
                walk(app, @"0", nodes, [NSMutableSet set]);
                result = @{@"denied": @NO, @"error": [NSNull null], @"nodes": nodes};
            } else {
                key(processId, command);
                result = @{@"sent": command};
            }
            CFRelease(app);
            NSData *encoded = [NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingPrettyPrinted error:NULL];
            fwrite(encoded.bytes, 1, encoded.length, stdout);
            return 0;
        } @catch (NSException *exception) {
            fprintf(stderr, "%s\n", exception.reason.UTF8String);
            return 1;
        }
    }
}
