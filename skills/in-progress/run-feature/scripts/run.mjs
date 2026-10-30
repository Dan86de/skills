#!/usr/bin/env node
// run-feature: loop implement-slice sessions in a dedicated worktree until
// every slice of a feature is committed and the branch is closed.
// State is read only from git trailers and slices.json, never from harness stdout.

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

// One kick never starts a session beyond this ceiling.
const MAX_ITERATIONS = 12;

// Exit codes: 0 clean completion, 1 bad input or environment, 2 halt.
// A halt always keeps the worktree in place so a human can cd in and fix.
function fail(message) {
  process.stderr.write(`run-feature: ${message}\n`);
  process.exit(1);
}

function halt(state, message, worktree) {
  notify(state);
  process.stderr.write(`run-feature: halt: ${message}\n`);
  process.stderr.write(`run-feature: worktree kept at ${worktree}\n`);
  process.exit(2);
}

// The one end-state signal: a macOS banner with sound carrying only the end
// state name; detail stays in the terminal output and the PR. One function,
// so routing it to ntfy later is a local change.
function notify(state) {
  const payload = state.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const script = `display notification "${payload}" with title "run-feature" sound name "Glass"`;
  const result = spawnSync("osascript", ["-e", script], { stdio: "ignore" });
  if (result.error || result.status !== 0) log("banner not shown");
}

function log(message) {
  process.stdout.write(`[run-feature] ${message}\n`);
}

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function gitOk(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  return result.status === 0;
}

function parseArgs(argv) {
  const args = { repo: process.cwd(), slug: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") {
      args.repo = argv[++i] ?? fail("--repo needs a path");
    } else {
      rest.push(argv[i]);
    }
  }
  if (rest.length !== 1) fail("usage: node run.mjs <slug> [--repo <path>]");
  args.slug = rest[0];
  if (!/^[a-z0-9-]+$/.test(args.slug)) fail(`slug "${args.slug}" is not lowercase kebab-case`);
  args.repo = path.resolve(args.repo);
  return args;
}

function defaultBranch(repo) {
  const remoteHead = spawnSync(
    "git",
    ["-C", repo, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    { encoding: "utf8" },
  );
  if (remoteHead.status === 0) return remoteHead.stdout.trim().replace(/^origin\//, "");
  for (const name of ["main", "master"]) {
    if (gitOk(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`])) return name;
  }
  fail("cannot determine the default branch: no origin/HEAD and no main or master");
}

// The ref slice work is measured against: the pushed default branch when a
// remote exists, the local one otherwise.
function baseRef(repo, branch) {
  if (gitOk(repo, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`])) {
    return `origin/${branch}`;
  }
  return branch;
}

// The branch checked out at worktreePath, when git knows that path as a
// worktree of this repo; null otherwise.
function worktreeBranch(repo, worktreePath) {
  const target = realpathSync(worktreePath);
  let current = null;
  for (const line of git(repo, ["worktree", "list", "--porcelain"]).split("\n")) {
    if (line.startsWith("worktree ")) {
      try {
        current = realpathSync(line.slice("worktree ".length));
      } catch {
        current = null;
      }
    } else if (line.startsWith("branch ") && current === target) {
      return line.slice("branch ".length).replace("refs/heads/", "");
    }
  }
  return null;
}

function addWorktree(repo, slug, base) {
  const worktree = path.join(path.dirname(repo), `${path.basename(repo)}-slices-${slug}`);
  const branch = `slices/${slug}`;
  if (existsSync(worktree)) {
    // A kept worktree from a halted run: resume in it once it is settled.
    if (worktreeBranch(repo, worktree) !== branch) {
      fail(`${worktree} exists but is not a worktree on ${branch}; remove it, then re-kick`);
    }
    if (git(worktree, ["status", "--porcelain"]) !== "") {
      fail(`worktree ${worktree} has uncommitted changes; commit or clean them, then re-kick`);
    }
    log(`resuming in existing worktree ${worktree}`);
    return worktree;
  }
  if (gitOk(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])) {
    git(repo, ["worktree", "add", worktree, branch]);
  } else if (gitOk(repo, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`])) {
    git(repo, ["worktree", "add", "--track", "-b", branch, worktree, `origin/${branch}`]);
  } else {
    git(repo, ["worktree", "add", "--no-track", "-b", branch, worktree, base]);
  }
  return worktree;
}

// Clean completion settles the worktree; a failed removal means the tree is
// not actually clean, so it is a halt, not a success.
function removeWorktree(repo, worktree) {
  const result = spawnSync("git", ["-C", repo, "worktree", "remove", worktree], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    halt("worktree not removed", `could not remove the worktree: ${result.stderr.trim()}`, worktree);
  }
}

function readSlices(worktree, slug) {
  const file = path.join(worktree, "spec", "features", slug, "slices.json");
  if (!existsSync(file)) fail(`${file} not found; write and commit the slices file first`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed.slices) || parsed.slices.length === 0) {
    fail(`${file} has no slices`);
  }
  for (const [index, slice] of parsed.slices.entries()) {
    if (typeof slice?.id !== "string" || slice.id === "") {
      fail(`${file}: slice ${index} has no id`);
    }
    if (!Array.isArray(slice.blocked_by)) {
      fail(`${file}: slice ${slice.id} has no blocked_by array`);
    }
  }
  return parsed.slices;
}

function bashAllowlist(worktree) {
  const file = path.join(worktree, ".claude", "settings.json");
  if (!existsSync(file)) return [];
  try {
    const settings = JSON.parse(readFileSync(file, "utf8"));
    const allow = settings?.permissions?.allow;
    if (!Array.isArray(allow)) return [];
    return allow.filter((entry) => typeof entry === "string" && entry.startsWith("Bash("));
  } catch {
    return [];
  }
}

// Slice states from git trailers alone, per the implement-slice contract:
// done has a Slice trailer, pending only a Slice-Pending one,
// ready has neither and every blocker done.
function sliceStates(worktree, base, slices) {
  const out = git(worktree, [
    "log",
    "--format=%(trailers:key=Slice,valueonly,separator=%x2C)%x00%(trailers:key=Slice-Pending,valueonly,separator=%x2C)",
    `${base}..HEAD`,
  ]);
  const done = new Set();
  const pending = new Set();
  for (const line of out.split("\n")) {
    const [doneIds = "", pendingIds = ""] = line.split("\0");
    for (const id of doneIds.split(",").filter(Boolean)) done.add(id);
    for (const id of pendingIds.split(",").filter(Boolean)) pending.add(id);
  }
  for (const id of done) pending.delete(id);
  const ready = slices.filter(
    (slice) =>
      !done.has(slice.id) &&
      !pending.has(slice.id) &&
      slice.blocked_by.every((blocker) => done.has(blocker)),
  );
  return { done, pending, ready };
}

// A headless session cannot show a permission prompt, so a tool call that is
// not allowlisted raises PermissionRequest and stays denied when no hook
// approves it. This injected hook writes each request to a log file outside
// the worktree, which is how a denial reaches the runner without parsing
// harness stdout.
function denialChannel(slug) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `run-feature-${slug}-`));
  const logFile = path.join(dir, "denials.jsonl");
  const settingsFile = path.join(dir, "settings.json");
  if (logFile.includes("'")) {
    fail(`temp dir ${dir} contains a single quote, which would break the denial hook`);
  }
  const command = `cat >> '${logFile}'; echo >> '${logFile}'`;
  writeFileSync(
    settingsFile,
    JSON.stringify({
      hooks: {
        PermissionRequest: [{ hooks: [{ type: "command", command }] }],
      },
    }),
  );
  return { dir, settingsFile, logFile };
}

function deniedTools(logFile) {
  if (!existsSync(logFile)) return [];
  const names = [];
  for (const line of readFileSync(logFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      names.push(entry.tool_name ?? "unknown tool");
    } catch {
      names.push("unknown tool");
    }
  }
  return names;
}

function quoteArg(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}

// The one place the harness is invoked, so a second harness stays additive.
// stdout and stderr stream straight to the terminal and are never captured.
function runHarnessSession({ worktree, prompt, allowlist, label, settingsFile }) {
  const args = ["-p", prompt, "--permission-mode", "acceptEdits", "--settings", settingsFile];
  if (allowlist.length > 0) args.push("--allowedTools", allowlist.join(","));
  log(`${label}: claude ${args.map(quoteArg).join(" ")}`);
  const result = spawnSync("claude", args, {
    cwd: worktree,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.error) fail(`could not start claude: ${result.error.message}`);
  log(`${label}: session ended with exit code ${result.status}`);
}

// The verify skill the slices gate on, at its contract home or a harness
// skills folder.
function hasVerifySkill(worktree) {
  return [".agents/skills/verify/SKILL.md", ".claude/skills/verify/SKILL.md"].some((candidate) =>
    existsSync(path.join(worktree, candidate)),
  );
}

// One headless pre-step: have a writing skill produce a missing spec file,
// then commit it, so the loop starts from committed state as always.
function runPreStep({ worktree, slug, file, prompt, session, hasOrigin }) {
  const relative = path.join("spec", "features", slug, file);
  const target = path.join(worktree, relative);
  if (existsSync(target)) return;
  const skill = prompt.split(" ")[0];
  session(prompt, `pre-step ${skill.slice(1)}`);
  if (!existsSync(target)) {
    halt("pre-step failed", `the ${skill} session did not write ${target}`, worktree);
  }
  git(worktree, ["add", relative]);
  git(worktree, ["commit", "--quiet", "-m", `spec: write ${slug} ${file} headlessly`]);
  if (hasOrigin) git(worktree, ["push", "--quiet", "origin", "HEAD"]);
  log(`pre-step committed ${relative}`);
}

function main() {
  const { repo, slug } = parseArgs(process.argv.slice(2));
  if (!gitOk(repo, ["rev-parse", "--git-dir"])) fail(`${repo} is not a git repository`);

  const branch = defaultBranch(repo);
  const base = baseRef(repo, branch);
  const worktree = addWorktree(repo, slug, base);
  log(`worktree ${worktree} on slices/${slug}`);

  const hasOrigin = gitOk(repo, ["remote", "get-url", "origin"]);
  // A human fix may have been pushed from outside the worktree; catch up when
  // it fast-forwards and refuse readably when the branch diverged.
  if (hasOrigin) {
    git(worktree, ["fetch", "origin", "--quiet"]);
    if (gitOk(repo, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/slices/${slug}`])) {
      const merged = spawnSync(
        "git",
        ["-C", worktree, "merge", "--ff-only", "--quiet", `origin/slices/${slug}`],
        { encoding: "utf8" },
      );
      if (merged.status !== 0) {
        const cause = merged.stderr.trim() || "the branches diverged";
        fail(
          `slices/${slug} did not fast-forward onto origin/slices/${slug}: ${cause}; reconcile, then re-kick`,
        );
      }
    }
  }

  if (!hasVerifySkill(worktree)) {
    halt(
      "no verify skill",
      "no verify skill at .agents/skills/verify; run make-verify in the project, commit it, then re-kick",
      worktree,
    );
  }

  const allowlist = bashAllowlist(worktree);
  const { dir: denialDir, settingsFile, logFile } = denialChannel(slug);
  log(`denial log ${logFile}`);

  const session = (prompt, label) => {
    runHarnessSession({ worktree, prompt, allowlist, label, settingsFile });
    const denied = deniedTools(logFile);
    if (denied.length > 0) {
      halt(
        "permission denied",
        `permission denied for ${denied.join(", ")} during ${label}; grow the project's allowlist or run it attended`,
        worktree,
      );
    }
  };

  const featureDir = path.join(worktree, "spec", "features", slug);
  if (!existsSync(path.join(featureDir, "spec.md")) && !existsSync(path.join(featureDir, "decisions.md"))) {
    fail(`spec/features/${slug}/decisions.md is missing; settle the decisions and commit them first`);
  }
  runPreStep({
    worktree,
    slug,
    file: "spec.md",
    prompt: `/write-spec spec/features/${slug}/decisions.md`,
    session,
    hasOrigin,
  });
  runPreStep({
    worktree,
    slug,
    file: "slices.json",
    prompt: `/write-slices spec/features/${slug}/spec.md`,
    session,
    hasOrigin,
  });

  const slices = readSlices(worktree, slug);

  let iteration = 0;
  let closeRan = false;
  let failingSlice = null;
  for (;;) {
    if (hasOrigin) git(worktree, ["fetch", "origin", "--quiet"]);
    const states = sliceStates(worktree, base, slices);
    const allDone = slices.every((slice) => states.done.has(slice.id));

    if (allDone && closeRan) {
      removeWorktree(repo, worktree);
      rmSync(denialDir, { recursive: true, force: true });
      notify("complete");
      log(`all ${slices.length} slices done, branch closed, worktree removed`);
      process.exit(0);
    }
    if (!allDone && states.ready.length === 0) {
      if (states.pending.size > 0) {
        halt(
          "awaiting sign-off",
          `waiting for human sign-off on ${[...states.pending].join(", ")} and nothing else is ready; sign off, then re-kick`,
          worktree,
        );
      }
      halt(
        "nothing ready",
        `nothing is ready: done [${[...states.done].join(", ")}]; check the blocked_by edges in slices.json`,
        worktree,
      );
    }
    if (iteration >= MAX_ITERATIONS) {
      halt(
        "iteration ceiling",
        `iteration ceiling: ${MAX_ITERATIONS} sessions in one kick; re-kick to continue`,
        worktree,
      );
    }

    iteration++;
    // implement-slice takes the lowest ready id, so a failed iteration is
    // attributed to that slice.
    const expected = states.ready
      .map((slice) => slice.id)
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))[0];
    session(`/implement-slice spec/features/${slug}/`, `iteration ${iteration}`);

    if (allDone) {
      closeRan = true;
      continue;
    }
    // Progress is a grown done or pending set, so a pending slice turning
    // done still counts even though the combined count stays constant.
    const after = sliceStates(worktree, base, slices);
    if (after.done.size <= states.done.size && after.pending.size <= states.pending.size) {
      if (failingSlice === expected) {
        halt("no progress", `no progress: slice ${expected} failed twice in a row`, worktree);
      }
      failingSlice = expected;
      log(`iteration ${iteration} added no trailer for ${expected}; retrying once`);
      continue;
    }
    failingSlice = null;
  }
}

main();
