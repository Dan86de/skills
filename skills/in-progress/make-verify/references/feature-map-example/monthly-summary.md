# Monthly summary

A user sees how much they spent in a month, split by category, and can tell a month with no spending from one that failed to load.

## Entry points

- The `Summary` link in the sidebar.
- `tally summary [<yyyy-mm>]` in a terminal, defaulting to the current month.

## Steps

Preconditions: the two expenses from [Add an expense](./add-expense.md), both this month.

- **Open it.** Run `drive click link Summary`. The page heading reads the current month and year.
- **Totals by category.** Run `drive snapshot table "By category"`. It has a `Food` row with `12.50`, a `Travel` row with `40.00`, and a `Total` row with `52.50`.
- **An empty month.** Run `drive goto /summary/2020-01`. A status named `No expenses this month` shows, and there is no table.
- **The same totals from the CLI.** Run `tally summary --db <run folder>/tally.db --json`. It exits 0 and prints `"total_cents": 5250` with the same two categories.
- **An empty month from the CLI.** Run `tally summary 2020-01 --db <run folder>/tally.db --json`. It exits 0 and prints `"total_cents": 0` with no categories.

## Behind it

The summary is read-only: running every step above leaves `expenses` exactly as it was.

## Gotchas

- Months are in the product's time zone, not the machine's. An expense saved just after midnight can land in the other month.
- A category with no expenses in the month is left out, not shown as `0.00`.
- A failed load shows `Could not load the summary`, which is not the empty state. Never accept one for the other.
