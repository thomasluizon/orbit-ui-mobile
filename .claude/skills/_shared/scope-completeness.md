# Scope completeness before work starts

**At a glance:** the shared search and evidence contract for `/feature`, `/ticket`, and
`/orchestrate`. It prevents a ticket from covering the obvious code edit while missing a
call site, operating document, or agent instruction that must change with it. Run it before
decomposing, drafting, or dispatching work.

Search the target repository and the brain vault for every named symbol, command, config,
workflow, path, and user-facing concept. Produce a checkable `Scope completeness` list that
records the search terms and every affected occurrence, with exact paths, under all of these
categories:

- every code call site and integration point;
- product and engineering docs;
- ADRs and brain notes;
- runbooks;
- every `.claude/` rule, playbook, skill, agent, hook, and settings reference.

Record `none found` under a category only after searching it. An omitted category is an
incomplete search. An occurrence is identified once it is recorded as a checkbox entry. An
entry is accounted for once it is assigned to a specific ticket in the run or explicitly
marked out of scope with a reason. Unchecked boxes are the normal pre-dispatch state: they
track completion, and the implementation worker checks them off as the work lands. Add any
affected reference discovered during implementation so the list stays complete. The
invoking skill determines how the list is assigned to tickets and handed to the
implementation worker.
