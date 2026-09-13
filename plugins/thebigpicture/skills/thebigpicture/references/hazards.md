# Search and verification hazards

Every item here cost a real false result. They are ordered by how much.

## A silent zero reads exactly like a finding

**Never write `timeout N command grep …`.** It exits **127** — `command` is a shell builtin
`timeout` cannot exec — and returns nothing, which is indistinguishable from "no matches".

**Check exit status before treating empty output as absence.** A timeout, a permission error and a
genuine miss all print the same thing.

**Size can time a sweep out.** A single large skill or asset directory can exceed the budget of a
repo-wide content sweep; the sweep returns empty and looks like a clean result.

**Ignore rules hide directories you meant to search.** `rg` honours `.gitignore`, and agent
tooling is very often ignored. Measured on one repo: a bare `rg` `*.md` sweep found **1 of 330**
files under `.claude/`; `rg --no-ignore` and `grep` both found 330. It is the gitignore gate, not
the hidden-file gate, and naming the path explicitly does **not** defeat it. Use `rg -uu`, or
`grep` with an explicit path.

## A string probe over a rendered blob is not a content check

Grepping the built page or the JSON will lie in **both** directions.

- **False ABSENT from escaping.** `json.dumps(..., ensure_ascii=True)` writes `·` as the six characters `\u00b7`, so a
  probe for `Gate 1 · classification` misses a node that is plainly there. Same for any non-ASCII.
- **False ABSENT from a mangled probe.** A quote-stripped literal stops matching anything real.
- **False ABSENT from case.** Authored prose capitalises for emphasis, so a lowercase substring
  sweep reports content gone when it is not — and on a live artifact that reads as data loss, the
  most alarming possible false alarm.
- **False ABSENT from the wrong wording.** A sweep for one phrasing reported a page clean that
  states the same dead claim in different words. Only reading it found that.
- **False PRESENT from the wrong field.** A retired claim appears in the published page **on
  purpose**, inside `corrections.was`, because the mechanism keeps superseded claims visible. Read
  as a regression; actually the correction mechanism working.
- **False PRESENT from the embedded document.** The whole `universe.json` is embedded in every
  rendered scene, so a probe for a phrase from scene B "finds" it while looking at scene A. Per
  scene, only the rendered DOM tells you what is on screen.

So: **parse the DATA and check the field, never grep the render.** When you must sweep, a hit tells
you where to look and a miss tells you nothing.

This is the same failure as counting `<rect>` elements to check that a diagram drew — a proxy that
resembles a measurement.

## Never narrate a command's result in the same message that runs it

A distinct failure with the same symptom: there a proxy lied, here nobody read the output.

- A loop ending `&& echo OK || echo FAIL` is a check only if somebody reads what it printed.
  Writing "all three still render" in the breath that runs the loop reports what you EXPECTED — and
  it has gone out as fact and been relayed onward before the two `FAIL` lines were noticed.
- A batch of edits that prints `patched` per step and then **raises before writing the file** has
  patched nothing. The prints are not evidence; the file on disk is. Re-read the target, or grep it,
  after the write.

Run it, read what came back, then write the sentence. If a report says "verified", the verifying
already happened in a previous turn.

## Two rules about controls and mechanisms

1. **A control sharing the measurement's harness is not a control.** If control and measurement
   fail the same way, the control cannot fail. Vary the *binary and the invocation*, not just the
   pattern, and put the positive control **inside** the region you claim is empty.
2. **Do not publish a mechanism when you have only observed a symptom.** "grep returned 0 where rg
   returned 7" was true; "a wrapper swallows it" was invented, matched a story already believed, and
   was ratified downstream before anyone re-tested it. The observation stood on its own.

## Counting a code surface

Counting how much of a declared surface is implemented is the most common measurement this skill
asks for, and the most common place to be wrong by an order of magnitude.

A first pass counting `.register('op')` calls in one repository found **14** of 197 operations
implemented — 7%. The real answer was **193** of 197, because almost every handler arrives through
`registerAll({ 'op': handler, … })`. A second pass with a multi-line-only pattern still missed the
single-line `registerAll({ 'op': h })` form and reported 192.

The lesson is not "use a better regex". It is:

- find the registration mechanism by reading one implementation before counting all of them;
- when a coverage number comes out surprisingly low, suspect the pattern before the code;
- state the command that produced the number next to the number, so the next reader can re-run it
  rather than believe it.
