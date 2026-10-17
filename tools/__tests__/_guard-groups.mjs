export function guardGroups(workflow) {
  if (!workflow.jobs.guards) return workflow.jobs
  const preparation = workflow.jobs.guards.steps.filter((step) => step.uses?.startsWith("actions/checkout@") || step.uses?.startsWith("actions/setup-node@") || /^npm ci\b/.test(step.run ?? "") || step.name === "Resolve pull request changed paths")
  const groups = {}
  for (const step of workflow.jobs.guards.steps) {
    const group = step.id?.match(/^(.+)__\d+$/)?.[1]
    if (!group) continue
    groups[group] ??= { steps: [...preparation] }
    groups[group].steps.push({ ...step, name: step.name.replace(/^[^:]+: /, "") })
  }
  return groups
}
