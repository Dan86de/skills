// Seam tests for run.mjs: drive the runner's process boundary against a
// throwaway target repo with a stub harness and gh on PATH.
// Covers slices S1 through S6 of spec/features/run-feature/spec.md.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, it } from "node:test";

const RUNNER = fileURLToPath(new URL("./run.mjs", import.meta.url));

function git(repo, ...args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

const SLICES = {
  spec: "spec/features/demo/spec.md",
  slices: [
    { id: "S1", title: "First slice", blocked_by: [], autonomy: "afk" },
    { id: "S2", title: "Second slice", blocked_by: ["S1"], autonomy: "afk" },
  ],
};

const CLAUDE_STUB = `#!/usr/bin/env node
// Stands in for a headless implement-slice session: commits the next ready
// slice's trailer (Slice-Pending for a hitl slice) and pushes, or marks the
// PR ready once every slice is done.
// Extensionless file, so Node parses it as CommonJS.
const { appendFileSync, readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
appendFileSync(process.env.STUB_CLAUDE_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
// Misleading noise: a runner parsing harness stdout for state would halt here.
console.log("HARNESS NOISE: fatal, 0 slices done, Slice=[S9], halting run");
const prompt = process.argv[3] || "";
if (prompt.startsWith("/write-spec")) {
  require("node:fs").writeFileSync("spec/features/demo/spec.md", "# demo\\n");
  process.exit(0);
}
if (prompt.startsWith("/write-slices")) {
  require("node:fs").writeFileSync(
    "spec/features/demo/slices.json",
    JSON.stringify(${JSON.stringify(SLICES)}, null, 2),
  );
  process.exit(0);
}
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const slices = JSON.parse(readFileSync("spec/features/demo/slices.json", "utf8")).slices;
const read = (key) =>
  new Set(
    git("log", "--format=%(trailers:key=" + key + ",valueonly)", "origin/main..HEAD")
      .split("\\n")
      .filter(Boolean),
  );
const done = read("Slice");
const pending = read("Slice-Pending");
const next = slices.find(
  (s) => !done.has(s.id) && !pending.has(s.id) && s.blocked_by.every((b) => done.has(b)),
);
if (!next) {
  execFileSync("gh", ["pr", "ready", "demo"]);
} else {
  const trailer = (next.autonomy === "hitl" ? "Slice-Pending: " : "Slice: ") + next.id;
  git("commit", "--allow-empty", "-m", next.title + "\\n\\nProof.\\n\\n" + trailer);
  git("push", "--quiet", "origin", "HEAD");
}
`;

const GH_STUB = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
appendFileSync(process.env.STUB_GH_LOG, process.argv.slice(2).join(" ") + "\\n");
`;

const OSASCRIPT_STUB = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
appendFileSync(process.env.STUB_OSA_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
`;

// A session whose write-spec pre-step produces nothing, for the
// "pre-step failed" halt and its banner.
const PRESTEP_FAIL_STUB = CLAUDE_STUB.replace(
  'require("node:fs").writeFileSync("spec/features/demo/spec.md", "# demo\\n");',
  "",
);

const HITL_SLICES = {
  spec: SLICES.spec,
  slices: [
    { id: "S1", title: "Needs sign-off", blocked_by: [], autonomy: "hitl" },
    { id: "S2", title: "Second slice", blocked_by: ["S1"], autonomy: "afk" },
  ],
};

const MANY_SLICES = {
  spec: SLICES.spec,
  slices: Array.from({ length: 20 }, (_, i) => ({
    id: `S${i + 1}`,
    title: `Slice ${i + 1}`,
    blocked_by: [],
    autonomy: "afk",
  })),
};

function makeFixture(claudeStub = CLAUDE_STUB, slices = SLICES, opts = {}) {
  const { specFiles = true, verifySkill = true, decisionsFile = true } = opts;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "run-feature-"));
  const origin = path.join(tmp, "origin.git");
  const repo = path.join(tmp, "repo");
  execFileSync("git", ["init", "--bare", "--quiet", "-b", "main", origin]);
  execFileSync("git", ["clone", "--quiet", origin, repo]);
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");

  mkdirSync(path.join(repo, "spec", "features", "demo"), { recursive: true });
  if (decisionsFile) {
    writeFileSync(path.join(repo, "spec", "features", "demo", "decisions.md"), "# decisions\n");
  }
  if (specFiles) {
    writeFileSync(path.join(repo, "spec", "features", "demo", "spec.md"), "# demo\n");
    writeFileSync(
      path.join(repo, "spec", "features", "demo", "slices.json"),
      JSON.stringify(slices, null, 2),
    );
  }
  if (verifySkill) {
    mkdirSync(path.join(repo, ".agents", "skills", "verify"), { recursive: true });
    writeFileSync(path.join(repo, ".agents", "skills", "verify", "SKILL.md"), "# verify\n");
  }
  mkdirSync(path.join(repo, ".claude"), { recursive: true });
  writeFileSync(
    path.join(repo, ".claude", "settings.json"),
    JSON.stringify({ permissions: { allow: ["Bash(pnpm test:*)", "Bash(git push:*)"] } }),
  );
  git(repo, "add", "-A");
  git(repo, "commit", "--quiet", "-m", "spec and slices");
  git(repo, "push", "--quiet", "-u", "origin", "main");
  git(repo, "remote", "set-head", "origin", "main");

  const bin = path.join(tmp, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "claude"), claudeStub);
  writeFileSync(path.join(bin, "gh"), GH_STUB);
  writeFileSync(path.join(bin, "osascript"), OSASCRIPT_STUB);
  chmodSync(path.join(bin, "claude"), 0o755);
  chmodSync(path.join(bin, "gh"), 0o755);
  chmodSync(path.join(bin, "osascript"), 0o755);

  const worktree = path.join(tmp, "repo-slices-demo");
  return { tmp, repo, bin, worktree };
}

function runRunner(fixture) {
  const claudeLog = path.join(fixture.tmp, "claude.log");
  const ghLog = path.join(fixture.tmp, "gh.log");
  const osaLog = path.join(fixture.tmp, "osascript.log");
  writeFileSync(claudeLog, "");
  writeFileSync(ghLog, "");
  writeFileSync(osaLog, "");
  const result = spawnSync("node", [RUNNER, "demo"], {
    cwd: fixture.repo,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fixture.bin}:${process.env.PATH}`,
      STUB_CLAUDE_LOG: claudeLog,
      STUB_GH_LOG: ghLog,
      STUB_OSA_LOG: osaLog,
    },
  });
  return { result, claudeLog, ghLog, osaLog };
}

// The Slice trailers landed on origin's slices branch, sorted.
function landedTrailers(repo) {
  return git(
    repo,
    "log",
    "--format=%(trailers:key=Slice,valueonly)",
    "origin/main..origin/slices/demo",
  )
    .split("\n")
    .filter(Boolean)
    .sort();
}

// The notification body of each recorded osascript call.
function bannerPayloads(osaLog) {
  return readFileSync(osaLog, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const script = JSON.parse(line).join(" ");
      return script.match(/display notification "([^"]*)"/)?.[1] ?? script;
    });
}

describe("run.mjs loops slices to a ready PR in a worktree", () => {
  let fixture;
  let result;
  let headBefore;
  let claudeLog;
  let ghLog;

  before(() => {
    fixture = makeFixture();
    headBefore = git(fixture.repo, "rev-parse", "HEAD");
    ({ result, claudeLog, ghLog } = runRunner(fixture));
  });

  it("one kick lands every afk slice trailer on the slices branch and marks the PR ready", () => {
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(landedTrailers(fixture.repo), ["S1", "S2"]);
    assert.match(readFileSync(ghLog, "utf8"), /pr ready/);
  });

  it("leaves the main checkout's HEAD unchanged and its status clean", () => {
    assert.equal(git(fixture.repo, "rev-parse", "HEAD"), headBefore);
    assert.equal(git(fixture.repo, "status", "--porcelain"), "");
  });

  it("logs one fresh harness invocation per iteration with acceptEdits and the Bash allowlist", () => {
    const lines = result.stdout
      .split("\n")
      .filter((line) => /^\[run-feature\] iteration \d+: claude /.test(line));
    assert.equal(lines.length, 3, result.stdout);
    for (const line of lines) {
      assert.match(line, /--permission-mode acceptEdits/);
      assert.match(line, /Bash\(pnpm test:\*\)/);
      assert.match(line, /Bash\(git push:\*\)/);
      assert.match(line, /\/implement-slice spec\/features\/demo\//);
    }
    const invocations = readFileSync(claudeLog, "utf8").split("\n").filter(Boolean);
    assert.equal(invocations.length, 3);
    for (const invocation of invocations) {
      const args = JSON.parse(invocation);
      assert.equal(args[0], "-p");
      assert.deepEqual(args.slice(2, 4), ["--permission-mode", "acceptEdits"]);
    }
  });

  it("never reads harness stdout for state: misleading noise changes nothing", () => {
    // The stub printed "0 slices done, Slice=[S9], halting" on every
    // invocation; the runner still ran exactly one session per slice plus
    // one close pass, and no S9 trailer exists anywhere.
    assert.equal(result.status, 0);
    const invocations = readFileSync(claudeLog, "utf8").split("\n").filter(Boolean);
    assert.equal(invocations.length, 3);
    assert.ok(!landedTrailers(fixture.repo).includes("S9"));
  });

  it("removes the worktree on clean completion, leaving the branch and PR intact", () => {
    assert.equal(result.status, 0);
    assert.ok(!existsSync(fixture.worktree), "worktree should be removed");
    assert.ok(git(fixture.repo, "rev-parse", "origin/slices/demo"));
    assert.match(readFileSync(ghLog, "utf8"), /pr ready/);
  });
});

// A stub session that burns an iteration without landing a trailer.
const IDLE_STUB = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
appendFileSync(process.env.STUB_CLAUDE_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
console.log("session wandered and gave up without committing");
`;

// Simulates a session whose Bash call is not allowlisted: Claude Code runs
// the PermissionRequest hooks from --settings, no hook approves, the call
// stays denied, and the session gives up without committing.
const DENIAL_STUB = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require("node:fs");
const { execSync } = require("node:child_process");
appendFileSync(process.env.STUB_CLAUDE_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
const settingsPath = process.argv[process.argv.indexOf("--settings") + 1];
const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
const command = settings.hooks.PermissionRequest[0].hooks[0].command;
const request = JSON.stringify({
  hook_event_name: "PermissionRequest",
  tool_name: "Bash",
  tool_input: { command: "curl https://example.com" },
});
execSync(command, { input: request });
console.log("Bash call denied; cannot continue");
`;

describe("run.mjs halts keep the worktree and exit non-zero", () => {
  it("a slice failing twice in a row halts the run as no progress, naming the slice", () => {
    const fixture = makeFixture(IDLE_STUB);
    const { result, claudeLog } = runRunner(fixture);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /no progress: slice S1 failed twice in a row/);
    assert.ok(existsSync(fixture.worktree), "worktree should be kept");
    // One attempt and one retry, never a third.
    assert.equal(readFileSync(claudeLog, "utf8").split("\n").filter(Boolean).length, 2);
  });

  it("a session's non-allowlisted tool call halts the run naming the denial", () => {
    const fixture = makeFixture(DENIAL_STUB);
    const { result } = runRunner(fixture);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /permission denied for Bash/);
    assert.ok(existsSync(fixture.worktree), "worktree should be kept");
  });

  it("a single kick never starts a 13th iteration", () => {
    // 20 independent afk slices would take 21 sessions; the ceiling stops
    // the kick after 12.
    const fixture = makeFixture(CLAUDE_STUB, MANY_SLICES);
    const { result, claudeLog } = runRunner(fixture);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /iteration ceiling: 12 sessions/);
    assert.ok(existsSync(fixture.worktree), "worktree should be kept");
    assert.equal(readFileSync(claudeLog, "utf8").split("\n").filter(Boolean).length, 12);
  });

  it("one failed iteration recovers on retry and the run still completes", () => {
    // The stub fails only its first invocation, so the retry lands S1 and
    // the twice-in-a-row counter provably resets instead of halting.
    const flaky = CLAUDE_STUB.replace(
      "// Misleading noise",
      `const attempts = readFileSync(process.env.STUB_CLAUDE_LOG, "utf8")
  .split("\\n")
  .filter(Boolean).length;
if (attempts === 1) {
  console.log("first attempt wandered and committed nothing");
  process.exit(0);
}
// Misleading noise`,
    );
    const fixture = makeFixture(flaky);
    const { result, claudeLog } = runRunner(fixture);
    assert.equal(result.status, 0, result.stderr);
    // The failed attempt, its retry landing S1, then S2 and the close pass.
    assert.equal(readFileSync(claudeLog, "utf8").split("\n").filter(Boolean).length, 4);
    assert.ok(!existsSync(fixture.worktree), "worktree should be removed");
  });

  it("a pending hitl slice with nothing else ready halts naming the waiting slice", () => {
    const fixture = makeFixture(CLAUDE_STUB, HITL_SLICES);
    const { result } = runRunner(fixture);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /waiting for human sign-off on S1/);
    assert.ok(existsSync(fixture.worktree), "worktree should be kept");
  });
});

describe("run.mjs runs the pre-steps headlessly and gates on the verify skill", () => {
  // One run from a fixture holding only a committed decisions.md.
  let fixture;
  let result;
  let claudeLog;
  let ghLog;

  before(() => {
    fixture = makeFixture(CLAUDE_STUB, SLICES, { specFiles: false });
    ({ result, claudeLog, ghLog } = runRunner(fixture));
  });

  it("one command takes a committed decisions.md with no spec to a ready PR, exit 0", () => {
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(landedTrailers(fixture.repo), ["S1", "S2"]);
    assert.match(readFileSync(ghLog, "utf8"), /pr ready/);
    assert.ok(!existsSync(fixture.worktree), "worktree should be removed");
  });

  it("a missing spec or slices file is written and committed headlessly before the loop", () => {
    const prompts = readFileSync(claudeLog, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line)[1]);
    assert.equal(prompts.length, 5, JSON.stringify(prompts));
    assert.match(prompts[0], /^\/write-spec spec\/features\/demo\/decisions\.md$/);
    assert.match(prompts[1], /^\/write-slices spec\/features\/demo\/spec\.md$/);
    // Oldest commits on the branch are the two pre-step commits.
    const subjects = git(
      fixture.repo,
      "log",
      "--format=%s",
      "origin/main..origin/slices/demo",
    ).split("\n");
    assert.deepEqual(subjects.slice(-2), [
      "spec: write demo slices.json headlessly",
      "spec: write demo spec.md headlessly",
    ]);
    assert.equal(git(fixture.repo, "show", "origin/slices/demo:spec/features/demo/spec.md"), "# demo");
  });

  it("a pre-step session that writes nothing halts the run as pre-step failed", () => {
    const failing = makeFixture(PRESTEP_FAIL_STUB, SLICES, { specFiles: false });
    const run = runRunner(failing);
    assert.equal(run.result.status, 2, run.result.stderr);
    assert.match(run.result.stderr, /\/write-spec session did not write/);
    assert.ok(existsSync(failing.worktree), "worktree should be kept");
  });

  it("a missing decisions.md with no spec refuses the kick with exit 1", () => {
    const bare = makeFixture(CLAUDE_STUB, SLICES, { specFiles: false, decisionsFile: false });
    const { result } = runRunner(bare);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /decisions\.md is missing/);
  });

  it("with the verify skill removed, the runner halts naming make-verify before any session", () => {
    const gated = makeFixture(CLAUDE_STUB, SLICES, { verifySkill: false });
    const run = runRunner(gated);
    assert.equal(run.result.status, 2, run.result.stderr);
    assert.match(run.result.stderr, /make-verify/);
    assert.equal(readFileSync(run.claudeLog, "utf8"), "", "no harness session may start");
    assert.ok(existsSync(gated.worktree), "worktree should be kept");
  });
});

describe("run.mjs resumes from git state on re-kick", () => {
  it("re-running the same command after a halt and a human fix completes the rest", () => {
    // First kick: every S1 attempt fails, so the run halts and keeps the
    // worktree.
    const fixture = makeFixture(IDLE_STUB);
    const first = runRunner(fixture);
    assert.equal(first.result.status, 2, first.result.stderr);
    assert.ok(existsSync(fixture.worktree), "worktree should be kept");
    // The human fix: commit S1's trailer in the kept worktree and push.
    git(
      fixture.worktree,
      "commit",
      "--allow-empty",
      "-m",
      "First slice\n\nFixed by hand.\n\nSlice: S1",
    );
    git(fixture.worktree, "push", "--quiet", "origin", "HEAD");
    // Re-kick the same command, now with a working session stub.
    writeFileSync(path.join(fixture.bin, "claude"), CLAUDE_STUB);
    const second = runRunner(fixture);
    assert.equal(second.result.status, 0, second.result.stderr);
    assert.match(second.result.stdout, /resuming in existing worktree/);
    // Only the remaining work ran: S2 and the close pass.
    assert.equal(readFileSync(second.claudeLog, "utf8").split("\n").filter(Boolean).length, 2);
    assert.deepEqual(landedTrailers(fixture.repo), ["S1", "S2"]);
    assert.match(readFileSync(second.ghLog, "utf8"), /pr ready/);
    assert.ok(!existsSync(fixture.worktree), "worktree should be removed after completion");
  });

  it("a kept worktree with uncommitted changes refuses the re-kick readably", () => {
    const fixture = makeFixture(IDLE_STUB);
    const first = runRunner(fixture);
    assert.equal(first.result.status, 2);
    writeFileSync(path.join(fixture.worktree, "half-done.txt"), "wip");
    const second = runRunner(fixture);
    assert.equal(second.result.status, 1, second.result.stderr);
    assert.match(second.result.stderr, /uncommitted changes/);
  });

  it("a foreign directory at the worktree path refuses the kick", () => {
    const fixture = makeFixture();
    mkdirSync(fixture.worktree);
    const { result } = runRunner(fixture);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /not a worktree on slices\/demo/);
  });

  it("a branch that diverged from origin refuses the re-kick readably", () => {
    const fixture = makeFixture(IDLE_STUB);
    const first = runRunner(fixture);
    assert.equal(first.result.status, 2);
    // Push one fix, then rewrite it locally so the branch diverges.
    git(fixture.worktree, "commit", "--allow-empty", "-m", "Fix A\n\nSlice: S1");
    git(fixture.worktree, "push", "--quiet", "origin", "HEAD");
    git(fixture.worktree, "reset", "--hard", "--quiet", "HEAD~1");
    git(fixture.worktree, "commit", "--allow-empty", "-m", "Fix B\n\nSlice: S1");
    const second = runRunner(fixture);
    assert.equal(second.result.status, 1, second.result.stderr);
    assert.match(second.result.stderr, /did not fast-forward/);
  });

  it("a halted run leaves no watcher, timer, or background process", () => {
    const fixture = makeFixture(IDLE_STUB);
    const { result } = runRunner(fixture);
    assert.equal(result.status, 2);
    // Nothing referencing the fixture survives the runner's exit, so nothing
    // can resume on its own; only typing the command again starts a run.
    const processes = execFileSync("ps", ["-axo", "command"], { encoding: "utf8" });
    assert.ok(!processes.includes(fixture.tmp), "no process should reference the fixture");
  });
});

describe("run.mjs fires one end-state banner", () => {
  // One run per end state, each with a recording osascript stub on PATH.
  const runs = [];

  before(() => {
    // The close pass leaves an untracked file, so the worktree removal on
    // clean completion fails and that halt's banner gets exercised too.
    const dirtyCloseStub = CLAUDE_STUB.replace(
      '  execFileSync("gh", ["pr", "ready", "demo"]);',
      `  require("node:fs").writeFileSync("leftover.txt", "dirt");
  execFileSync("gh", ["pr", "ready", "demo"]);`,
    );
    const cases = [
      ["complete", makeFixture()],
      ["no progress", makeFixture(IDLE_STUB)],
      ["permission denied", makeFixture(DENIAL_STUB)],
      ["awaiting sign-off", makeFixture(CLAUDE_STUB, HITL_SLICES)],
      ["iteration ceiling", makeFixture(CLAUDE_STUB, MANY_SLICES)],
      ["worktree not removed", makeFixture(dirtyCloseStub)],
      ["no verify skill", makeFixture(CLAUDE_STUB, SLICES, { verifySkill: false })],
      ["pre-step failed", makeFixture(PRESTEP_FAIL_STUB, SLICES, { specFiles: false })],
    ];
    for (const [state, fixture] of cases) {
      const { osaLog } = runRunner(fixture);
      runs.push({ state, payloads: bannerPayloads(osaLog) });
    }
  });

  it("clean completion and each halt path invoke notify exactly once with the end state", () => {
    for (const run of runs) {
      assert.equal(run.payloads.length, 1, `${run.state}: ${JSON.stringify(run.payloads)}`);
    }
  });

  it("the banner payload carries only the end state name", () => {
    for (const run of runs) {
      assert.deepEqual(run.payloads, [run.state]);
    }
  });

  it("an exit-1 input failure is not an end state and fires no banner", () => {
    const fixture = makeFixture();
    const osaLog = path.join(fixture.tmp, "osascript.log");
    writeFileSync(osaLog, "");
    const result = spawnSync("node", [RUNNER, "Bad_Slug"], {
      cwd: fixture.repo,
      encoding: "utf8",
      env: { ...process.env, PATH: `${fixture.bin}:${process.env.PATH}`, STUB_OSA_LOG: osaLog },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(bannerPayloads(osaLog), []);
  });
});
