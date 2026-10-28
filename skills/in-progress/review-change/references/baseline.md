# Baseline

Applied when the repo says nothing, and underneath whatever it does say.
Language-neutral; framework rules belong in the repo's standards.

## Test lies

A passing test that proves nothing.
These rank first.
One is `blocks` when the test is the only proof of the behaviour its own name describes, `judgement` otherwise.

- **Tautological**: the expected value is computed or copied the way the code computes it.
  Expected values come from the spec, a worked example, or a known answer.
- **Source-text**: the test asserts on source files as text instead of running the code.
- **Mocked self**: the test replaces one of the project's own modules.
  Mocks belong at system boundaries.
- **Always-succeeding boundary**: a boundary mock that can only succeed, so error paths never run.
- **Past the interface**: the test calls internals callers never see.
- **Cannot fail**: an assertion that holds whether or not the behaviour is right, including one that races what it checks.

## Fit

Locally valid code that disagrees with the rest of the codebase is **decoherence**: each new way of doing a thing makes every later change translate between two.
Before judging the diff, find how the codebase already does what it does.

- **Parallel model**: a second way of doing something the codebase already does one way, such as a new HTTP wrapper, error type, date helper, state pattern, or config loader.
  The why names the existing one's file and says which should win.
- **Drifted term**: a new name for a concept the code, glossary or UI already names.
  Use the existing term.
- **Half migration**: the change moves some callers to a new pattern and leaves the rest on the old one, with no note of who finishes it.

## Design smells

Always `judgement`.

- **Duplicated code**: the same logic or list written twice, so changing one leaves the other wrong.
- **Shallow module**: an interface as complex as what it hides.
  Deletion test: if removing it makes complexity vanish rather than move to callers, it was a pass-through.
- **Feature envy**: code that uses another module's data more than its own.
- **Shotgun surgery**: one conceptual change scattered across many places.
- **Poor locality**: logic that changes together lives apart, or one unit holds several modes switched by flags.
- **Leaky interface**: callers must know an implementation detail, such as a sentinel, an ordering, or a markup shape.
- **Rule held on one side**: a constraint only a caller enforces, which the owning module would accept being broken.
- **Misleading name**: a name that says something the code does not do, or shadows another name in reach.
- **Untested logic**: new logic with defined inputs and outputs that no test exercises.

A problem nothing here names gets a plain `judgement` if it is about how the code is written, or a `question` if it is about whether it is right.
