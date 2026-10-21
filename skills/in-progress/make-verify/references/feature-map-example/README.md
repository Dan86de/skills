# Tally manual

What Tally does, feature by feature, and what you should see at each step.
A person reads it as the product's checklist; the verify skill reads it as the recipe for a check.

Tally is the example product: an expense tracker with a web page, a `tally` CLI, and one SQLite file.
Its verify skill ships one helper, `drive`, which keeps a browser page open between commands.

## Start from a known state

- Start a run with the verify skill; it prints the run folder and the URL.
- The run's database, in the run folder, has no expenses and two categories: `Food` and `Travel`.
- Run the doctor before the first step, and require the run's own URL and database.

## Driving conventions

- Name page elements by role and accessible name, or by a field's label.
- Run the CLI with `--db <run folder>/tally.db`, and `--json` when the output is asserted.
- Follow a step that writes something with a read of what it wrote.
- Every step and every `Behind it` line is a check; an entry point with no step of its own is not driven.
- Quoted output is how the output starts.
- Start a fresh run per feature file.

## Feature file shape

The feature's name, one paragraph on what a user gets, then in order:

1. `Entry points`: every way a user reaches the feature.
2. `Steps`: the user's action, the command that performs it, and what you should see.
3. `Behind it`: the state the steps leave, and how to read it.
4. `Gotchas`: what wastes a run or makes a check lie.

Only user paths, handles, commands, state and what proves it: no implementation details.

## Features

- [Add an expense](./add-expense.md): from the page and the CLI, with validation and what gets stored.
- [Monthly summary](./monthly-summary.md): totals by category on the page and in the CLI, including an empty month.
