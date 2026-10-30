// Seam tests for run.mjs: drive the runner's process boundary against a
// throwaway target repo with a stub harness and gh on PATH.
// Covers slice S1 of spec/features/run-feature/spec.md.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, it } from "node:test";

const RUNNER = fileURLToPath(new URL("./run.mjs", import.meta.url));

function git(repo, ...args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

const CLAUDE_STUB = `#!/usr/bin/env node
// Stands in for a headless implement-slice session: commits the next ready
// slice's trailer and pushes, or marks the PR ready once every slice is done.
// Extensionless file, so Node parses it as CommonJS.
const { appendFileSync, readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
appendFileSync(process.env.STUB_CLAUDE_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
// Misleading noise: a runner parsing harness stdout for state would halt here.
console.log("HARNESS NOISE: fatal, 0 slices done, Slice=[S9], halting run");
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const slices = JSON.parse(readFileSync("spec/features/demo/slices.json", "utf8")).slices;
const out = git("log", "--format=%(trailers:key=Slice,valueonly)", "origin/main..HEAD");
const done = new Set(out.split("\\n").filter(Boolean));
const next = slices.find((s) => !done.has(s.id) && s.blocked_by.every((b) => done.has(b)));
if (!next) {
  execFileSync("gh", ["pr", "ready", "demo"]);
} else {
  git("commit", "--allow-empty", "-m", next.title + "\\n\\nProof.\\n\\nSlice: " + next.id);
  git("push", "--quiet", "origin", "HEAD");
}
`;

const GH_STUB = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
appendFileSync(process.env.STUB_GH_LOG, process.argv.slice(2).join(" ") + "\\n");
`;

const SLICES = {
  spec: "spec/features/demo/spec.md",
  slices: [
    { id: "S1", title: "First slice", blocked_by: [], autonomy: "afk" },
    { id: "S2", title: "Second slice", blocked_by: ["S1"], autonomy: "afk" },
  ],
};

function makeFixture() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "run-feature-"));
  const origin = path.join(tmp, "origin.git");
  const repo = path.join(tmp, "repo");
  execFileSync("git", ["init", "--bare", "--quiet", "-b", "main", origin]);
  execFileSync("git", ["clone", "--quiet", origin, repo]);
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");

  mkdirSync(path.join(repo, "spec", "features", "demo"), { recursive: true });
  writeFileSync(path.join(repo, "spec", "features", "demo", "spec.md"), "# demo\n");
  writeFileSync(
    path.join(repo, "spec", "features", "demo", "slices.json"),
    JSON.stringify(SLICES, null, 2),
  );
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
  writeFileSync(path.join(bin, "claude"), CLAUDE_STUB);
  writeFileSync(path.join(bin, "gh"), GH_STUB);
  chmodSync(path.join(bin, "claude"), 0o755);
  chmodSync(path.join(bin, "gh"), 0o755);

  return { tmp, repo, bin };
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
    claudeLog = path.join(fixture.tmp, "claude.log");
    ghLog = path.join(fixture.tmp, "gh.log");
    writeFileSync(claudeLog, "");
    writeFileSync(ghLog, "");
    result = spawnSync("node", [RUNNER, "demo"], {
      cwd: fixture.repo,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fixture.bin}:${process.env.PATH}`,
        STUB_CLAUDE_LOG: claudeLog,
        STUB_GH_LOG: ghLog,
      },
    });
  });

  it("one kick lands every afk slice trailer on the slices branch and marks the PR ready", () => {
    assert.equal(result.status, 0, result.stderr);
    const trailers = git(
      fixture.repo,
      "log",
      "--format=%(trailers:key=Slice,valueonly)",
      "origin/main..origin/slices/demo",
    )
      .split("\n")
      .filter(Boolean)
      .sort();
    assert.deepEqual(trailers, ["S1", "S2"]);
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
    const trailers = git(
      fixture.repo,
      "log",
      "--format=%(trailers:key=Slice,valueonly)",
      "origin/main..origin/slices/demo",
    );
    assert.ok(!trailers.includes("S9"));
  });
});
