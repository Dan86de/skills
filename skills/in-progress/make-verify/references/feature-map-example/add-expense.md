# Add an expense

A user records what they spent, on what and when, and it shows up at the top of their expenses straight away.

## Entry points

- The `Add expense` button on the Expenses page.
- Pressing `n` on the Expenses page while no field has focus.
- `tally add <amount> <category> [--note <text>]` in a terminal.

## Steps

- **Open the form from the button.** Run `drive click button "Add expense"`. A dialog named `New expense` opens with focus in `Amount`.
- **Open the form from the keyboard.** Close the dialog, then run `drive press n`. The same dialog opens, and no `n` is typed anywhere.
- **Refuse an empty amount.** Leave `Amount` empty and run `drive click button "Save"`. The dialog stays open and `Amount` reads `Enter an amount`.
- **Save one.** Run `drive fill Amount 12.50`, `drive select Category Food`, `drive fill Note "Lunch"`, then `drive click button "Save"`. The dialog closes and the first row of the `Expenses` table reads `Lunch`, `Food`, `12.50`.
- **Add from the CLI.** Run `tally add 40 Travel --note "Train" --db <run folder>/tally.db --json`. It exits 0 and prints one object with `"category": "Travel"`.
- **See the CLI's expense on the page.** Run `drive goto /expenses`. The first row reads `Train`, `Travel`, `40.00`.

## Behind it

Each save is one row in `expenses`, and nothing else changes:

```sql
select amount_cents, category, note from expenses order by created_at;
```

After the steps above it prints `1250|Food|Lunch` and `4000|Travel|Train`, and no other rows.

## Gotchas

- Pressing `n` inside a field types the letter instead of opening the form.
- Amounts are stored in cents; the page shows two decimals. Compare the right one.
- An unknown category from the CLI exits 1 and adds nothing. It is a refusal, not a crash.
- The table sorts newest first by the time of saving, not by the date field.
