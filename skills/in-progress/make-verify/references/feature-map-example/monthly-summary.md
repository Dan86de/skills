# Monthly summary

A user sees how much they spent in a month, split by category, and can tell an empty month from one that failed to load.

## Entry points

- The `Summary` link in the sidebar.
- `tally summary [<yyyy-mm>]` in a terminal, defaulting to the current month.

## Steps

Preconditions: the two expenses from [Add an expense](./add-expense.md), both this month.

- **Open it.** Run `drive click link Summary`.
  The heading reads the current month and year.
- **Totals by category.** Run `drive snapshot table "By category"`.
  It has `Food` `12.50`, `Travel` `40.00`, and `Total` `52.50`.
- **An empty month.** Run `drive goto /summary/2020-01`.
  A status named `No expenses this month` shows, and no table.
- **The same totals from the CLI.** Run `tally summary --db <run folder>/tally.db --json`.
  It exits 0 and prints `"total_cents": 5250` with the same two categories.

## Behind it

The summary is read-only: `expenses` is unchanged after every step.

## Gotchas

- Months are in the product's time zone, not the machine's.
- A failed load shows `Could not load the summary`, which is not the empty state.
