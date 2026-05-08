# Task Management CLI

Track and manage feature subtasks with status, dependencies, and validation.

## Commands

Run from the project root:

```bash
bash .opencode/skills/task-management/router.sh status [feature]
bash .opencode/skills/task-management/router.sh next [feature]
bash .opencode/skills/task-management/router.sh parallel [feature]
bash .opencode/skills/task-management/router.sh deps <feature> <seq>
bash .opencode/skills/task-management/router.sh blocked [feature]
bash .opencode/skills/task-management/router.sh complete <feature> <seq> "summary"
bash .opencode/skills/task-management/router.sh validate [feature]
```

Tasks are stored in `.tmp/tasks/` at the project root.