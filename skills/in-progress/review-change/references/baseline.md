# Baseline

What the reviewer applies when the repo says nothing, and underneath whatever it does say.

Kept short and language-neutral on purpose.
Rules specific to one language or framework belong in the repo's standards file, not here.

Severity follows the reviewer brief.
A test lie is `blocks` when the test is the only proof of the behaviour its own name describes, and `judgement` otherwise.
A design smell is always `judgement`.

## Test lies

Green checks prove the checks passed, not that the behaviour works.
These are the ways a passing test proves nothing, and they rank first.

- **Tautological**: the expected value is computed or copied the same way the code computes it, such as asserting a constant equals its own literal.
  Expected values come from an independent source: the spec, a worked example, a known answer.
- **Source-text**: the test reads source files as text and asserts on their contents or order, instead of running the code or rendering the output.
- **Mocked self**: the test replaces one of the project's own modules.
  Mocks belong only at system boundaries: external services, time, randomness, sometimes the filesystem or a database.
- **Always-succeeding boundary**: a boundary mock that can only succeed, so the real dependency's error paths are never exercised.
- **Past the interface**: the test calls internals that callers never see, so a refactor breaks it with no change in behaviour.
- **Cannot fail**: an assertion that holds whether or not the behaviour is right, including one that races the thing it checks.

## Design smells

- **Duplicated code**: the same logic or the same list written out twice, so changing one leaves the other wrong.
- **Shallow module**: a module or function whose interface is as complex as what it hides.
  Deletion test: if removing it makes complexity vanish rather than reappear in its callers, it was a pass-through.
- **Feature envy**: code that reaches into another module's data more than it uses its own.
- **Shotgun surgery**: one conceptual change forces edits scattered across many places.
- **Poor locality**: logic that changes together lives apart, or one unit holds several modes switched by flags.
- **Leaky interface**: callers must know an implementation detail, such as a sentinel value, an ordering, or a markup shape, to use it correctly.
- **Rule held on one side**: a constraint enforced only by a caller, which the module that owns the data would accept being broken.
- **Misleading name**: a name that says something the code does not do, or shadows another name in reach.
- **Untested logic**: new logic with defined inputs and outputs that no test exercises, proven only by a manual or end-to-end run.

When nothing here fits a problem you found, do not stretch a label over it.
If it is about how the code is written, name it plainly as a `judgement`; if it is about whether the code is right, it is a `question`.
