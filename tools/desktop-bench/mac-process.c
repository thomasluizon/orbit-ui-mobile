#import <AppKit/AppKit.h>
#include <errno.h>
#include <libproc.h>
#include <mach/mach_time.h>
#include <signal.h>
#include <unistd.h>

extern int responsibility_get_pid_responsible_for_pid(int pid);
extern int coalition_info_resource_usage(uint64_t coalition, void *usage, size_t size);

// XNU proc_info_private.h: PROC_PIDCOALITIONINFO (20), resource coalition index 0 (#1560).
struct CoalitionIds { uint64_t coalition_id[2], reserved1, reserved2, reserved3; };
// XNU sys_coalition.c copies MIN(buffer size, structure size), permitting this ABI prefix (#1560).
struct CoalitionUsage { uint64_t tasks_started, tasks_exited, time_nonempty, cpu_time; };

static uint64_t resource_coalition(pid_t pid) {
    struct CoalitionIds identifiers = {0};
    if (proc_pidinfo(pid, 20, 0, &identifiers, sizeof(identifiers)) != sizeof(identifiers)) return 0;
    return identifiers.coalition_id[0];
}

static void require(BOOL accepted, NSString *message) {
    if (!accepted) @throw [NSException exceptionWithName:@"BenchmarkAccounting" reason:message userInfo:nil];
}

static double cpu_seconds(uint64_t ticks) {
    mach_timebase_info_data_t timebase;
    require(mach_timebase_info(&timebase) == KERN_SUCCESS, @"Cannot read the Mach timebase");
    return (double)ticks * timebase.numer / timebase.denom / 1e9;
}

static void emit(NSDictionary *reply) {
    NSError *error;
    NSData *encoded = [NSJSONSerialization dataWithJSONObject:reply options:0 error:&error];
    require(encoded != nil, error.localizedDescription);
    fwrite(encoded.bytes, 1, encoded.length, stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

static void stop_coalition(uint64_t coalition) {
    if (!coalition) return;
    int capacity = proc_listallpids(NULL, 0) + 128;
    require(capacity > 128, @"Cannot enumerate processes for cleanup");
    for (;;) {
        pid_t *pids = calloc(capacity, sizeof(pid_t));
        require(pids != NULL, @"Cannot allocate process list");
        int count = proc_listallpids(pids, capacity * sizeof(pid_t));
        if (count >= capacity) { free(pids); capacity *= 2; continue; }
        require(count > 0, @"Cannot read processes for cleanup");
        for (int index = 0; index < count; index++) {
            if (pids[index] > 0 && resource_coalition(pids[index]) == coalition) {
                require(kill(pids[index], SIGKILL) == 0 || errno == ESRCH, @"Cannot stop coalition member");
            }
        }
        free(pids);
        return;
    }
}

int main(int count, char **arguments) {
    if (count > 1 && !strcmp(arguments[1], "owners")) {
        for (int index = 2; index < count; index++) {
            int pid = atoi(arguments[index]);
            printf("%d %d %llu\n", pid, responsibility_get_pid_responsible_for_pid(pid),
                (unsigned long long)resource_coalition(pid));
        }
        return 0;
    }
    @autoreleasepool {
        __block NSRunningApplication *application;
        __block NSError *launch_error;
        uint64_t coalition = 0;
        @try {
            require(count == 2, @"Expected a packaged application executable");
            char command[32];
            while (fgets(command, sizeof(command), stdin)) {
                if (!strcmp(command, "launch\n")) {
                    require(application == nil, @"Application already launched");
                    NSURL *bundle = [NSURL fileURLWithPath:@(arguments[1])];
                    for (int level = 0; level < 3; level++) bundle = bundle.URLByDeletingLastPathComponent;
                    require([bundle.pathExtension isEqualToString:@"app"], @"Expected an application bundle");
                    NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
                    configuration.createsNewApplicationInstance = YES;
                    configuration.environment = NSProcessInfo.processInfo.environment;
                    dispatch_semaphore_t launched = dispatch_semaphore_create(0);
                    double epoch = NSDate.date.timeIntervalSince1970 * 1000;
                    [NSWorkspace.sharedWorkspace openApplicationAtURL:bundle configuration:configuration
                        completionHandler:^(NSRunningApplication *app, NSError *error) {
                            application = app; launch_error = error; dispatch_semaphore_signal(launched);
                        }];
                    dispatch_semaphore_wait(launched, DISPATCH_TIME_FOREVER);
                    require(application != nil, launch_error.localizedDescription);
                    uint64_t candidate = resource_coalition(application.processIdentifier);
                    require(candidate != 0 && candidate != resource_coalition(getpid()), @"Application needs its own resource coalition");
                    coalition = candidate;
                    emit(@{ @"kind": @"launch", @"epochMs": @(epoch), @"pid": @(application.processIdentifier), @"coalitionId": @(coalition).stringValue });
                } else if (!strcmp(command, "sample\n")) {
                    require(application != nil && resource_coalition(application.processIdentifier) == coalition, @"Shell process exited");
                    struct CoalitionUsage usage = {0};
                    require(coalition_info_resource_usage(coalition, &usage, sizeof(usage)) == 0, @"Cannot read cumulative coalition CPU");
                    emit(@{ @"kind": @"sample", @"epochMs": @(NSDate.date.timeIntervalSince1970 * 1000),
                        @"cpuSeconds": @(cpu_seconds(usage.cpu_time)), @"coalitionId": @(coalition).stringValue,
                        @"accounting": @{ @"tasks_started": @(usage.tasks_started), @"tasks_exited": @(usage.tasks_exited),
                            @"time_nonempty": @(usage.time_nonempty).stringValue, @"cpu_time": @(usage.cpu_time).stringValue } });
                } else if (!strcmp(command, "stop\n")) {
                    stop_coalition(coalition); coalition = 0;
                    emit(@{ @"kind": @"stop" });
                    return 0;
                } else require(NO, @"Unknown accounting command");
            }
        } @catch (NSException *error) {
            if (!coalition && application != nil) [application forceTerminate];
            fprintf(stderr, "%s\n", error.reason.UTF8String);
            return 1;
        } @finally {
            stop_coalition(coalition);
        }
    }
    return 0;
}
