#include <stdio.h>
#include <stdlib.h>
#include <spawn.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

extern int responsibility_get_pid_responsible_for_pid(int pid);
extern int responsibility_spawnattrs_setdisclaim(posix_spawnattr_t *attributes, int disclaim);
extern char **environ;

int main(int count, char **arguments) {
    if (count > 2 && !strcmp(arguments[1], "launch")) {
        posix_spawnattr_t attributes;
        posix_spawnattr_init(&attributes);
        if (responsibility_spawnattrs_setdisclaim(&attributes, 1)) return 2;
        pid_t child;
        int error = posix_spawn(&child, arguments[2], NULL, &attributes, arguments + 2, environ);
        posix_spawnattr_destroy(&attributes);
        if (error) return error;
        int status;
        if (waitpid(child, &status, 0) < 0) return 3;
        return WIFEXITED(status) ? WEXITSTATUS(status) : 1;
    }
    for (int index = 1; index < count; index++) {
        int pid = atoi(arguments[index]);
        printf("%d %d\n", pid, responsibility_get_pid_responsible_for_pid(pid));
    }
    return 0;
}
