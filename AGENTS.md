# Project instructions

## Preserve the scheduling algorithm

- Treat the existing scheduling algorithm and behavior as the baseline. Do not
  modify, replace, refactor, optimize, or retune them unless the user's current
  request explicitly asks for a scheduling algorithm change or a specific
  scheduling behavior fix. Authorization applies only to the requested change;
  it does not carry over to unrelated future prompts.
- General requests to fix errors, improve the app, clean up code, update the UI,
  or add unrelated features do not authorize scheduling algorithm changes.
- This protection includes genetic algorithm initialization, fitness scoring,
  selection, crossover, mutation, population size, generation count, randomness
  and seeds, ordering and tie-breaking, constraint enforcement, distribution
  rules, break intervals, exam grouping, room and proctor allocation, fallbacks,
  and automatic rescheduling behavior. Do not weaken constraints to make a
  schedule generate successfully.
- Apply this rule to both direct and indirect changes. Key implementation files
  include `backend/utils/scheduler.py`, `backend/routers/scheduler.py`, and
  `backend/services/auto_rescheduler.py`. Scheduling behavior in other routes,
  shared helpers, models, defaults, input preprocessing, and frontend request
  payloads has the same protection.
- For unrelated tasks, keep edits focused on the requested feature and preserve
  scheduling behavior. Do not revert existing user changes or regenerate, clear,
  or overwrite schedules as part of unrelated work.
- If the requested task cannot be completed without an otherwise unauthorized
  scheduling behavior change, complete independent work first, explain the exact
  change needed and its effect, and obtain explicit user authorization before
  making that change.
- When a scheduling change is explicitly requested, make the smallest necessary
  change, preserve all unrelated scheduling rules, run focused relevant checks,
  and describe the behavior changed and the validation performed.
- Before completing any code task, review the diff for unintended direct or
  indirect scheduling behavior changes and remove any introduced by that task.
  Different results from a randomized run alone are not evidence that the
  algorithm needs editing; investigate inputs and randomness before proposing a
  change, and do not add a fixed seed without an explicit request.
