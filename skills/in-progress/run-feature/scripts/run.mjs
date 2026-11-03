#!/usr/bin/env node
// run-feature: loop implement-slice sessions in a dedicated worktree until
// every slice of a feature is committed and the branch is closed.
// State is read only from git trailers and slices.json, never from harness stdout.
// The one exception is closeGap, which asks gh whether the PR left draft.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// One kick never starts a session beyond this ceiling.
const MAX_ITERATIONS = 12;

// The Bash allowlist seeded into a project that has no committed Claude
// settings yet. The headless sessions skip the permission system entirely;
// this baseline is for the attended sessions a human runs in a kept worktree.
const DEFAULT_SETTINGS = {
  permissions: {
    allow: [
      "Bash(git:*)",
      "Bash(gh:*)",
      "Bash(pnpm:*)",
      "Bash(node:*)",
      "Bash(nohup:*)",
      "Bash(.agents/skills/verify/rpc:*)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(grep:*)",
      "Bash(rg:*)",
      "Bash(find:*)",
      "Bash(wc:*)",
      "Bash(sed:*)",
      "Bash(awk:*)",
      "Bash(cut:*)",
      "Bash(sort:*)",
      "Bash(uniq:*)",
      "Bash(tr:*)",
      "Bash(diff:*)",
      "Bash(jq:*)",
      "Bash(mkdir:*)",
      "Bash(mv:*)",
      "Bash(cp:*)",
      "Bash(echo:*)",
      "Bash(printf:*)",
      "Bash(date:*)",
      "Bash(sleep:*)",
      "Bash(kill:*)",
    ],
  },
};

// Exit codes: 0 clean completion, 1 bad input or environment, 2 halt.
// A halt always keeps the worktree in place so a human can cd in and fix.
function fail(message) {
  board.detail = message;
  process.stderr.write(`run-feature: ${message}\n`);
  process.exit(1);
}

// A halt reads Stopped on the board unless it says otherwise: only a person
// being needed and a double failure read as anything else.
function halt(state, message, worktree, { outcome = "stopped", detail = message } = {}) {
  board.outcome = outcome;
  board.detail = detail;
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

// Every checkout of the repo (the main checkout counts) as
// { checkout, branch }, with branch null for a detached head.
function worktreeEntries(repo) {
  const entries = [];
  let current = null;
  for (const line of git(repo, ["worktree", "list", "--porcelain"]).split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { checkout: line.slice("worktree ".length), branch: null };
      entries.push(current);
    } else if (line.startsWith("branch ") && current) {
      current.branch = line.slice("branch ".length);
    }
  }
  return entries;
}

// The branch checked out at worktreePath, when git knows that path as a
// worktree of this repo; null otherwise.
function worktreeBranch(repo, worktreePath) {
  const target = realpathSync(worktreePath);
  for (const { checkout, branch } of worktreeEntries(repo)) {
    let resolved;
    try {
      resolved = realpathSync(checkout);
    } catch {
      continue;
    }
    if (resolved === target && branch) {
      return branch.replace("refs/heads/", "");
    }
  }
  return null;
}

// The checkout already holding this branch (the main checkout counts), so a
// kick can refuse readably instead of failing inside git worktree add.
function branchCheckout(repo, branch) {
  for (const entry of worktreeEntries(repo)) {
    if (entry.branch === `refs/heads/${branch}`) return entry.checkout;
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
    const holder = branchCheckout(repo, branch);
    if (holder) {
      fail(
        `${branch} is already checked out at ${holder}; switch that checkout to another branch, then re-kick`,
      );
    }
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

// Commit one file to the slices branch, pushed when a remote exists, so the
// worktree stays clean. A session may already have committed the file itself,
// so a clean index just skips to the push.
function commitFile(worktree, relative, message, hasOrigin) {
  git(worktree, ["add", relative]);
  if (!gitOk(worktree, ["diff", "--cached", "--quiet"])) {
    git(worktree, ["commit", "--quiet", "-m", message]);
  }
  if (hasOrigin) git(worktree, ["push", "--quiet", "origin", "HEAD"]);
}

// Seed a project that has no committed Claude settings with a default Bash
// allowlist, committed like the pre-steps so the worktree stays clean.
function ensureSettings(worktree, hasOrigin) {
  const relative = path.join(".claude", "settings.json");
  const target = path.join(worktree, relative);
  if (existsSync(target)) return;
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(DEFAULT_SETTINGS, null, 2) + "\n");
  commitFile(worktree, relative, "chore: seed the default Claude settings allowlist", hasOrigin);
  log(`seeded ${relative} with the default Bash allowlist`);
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

// What the close session left undone, or null. A session can end without
// finishing, so "complete" is only reported on what it actually left behind.
// A hitl slice's manual items were confirmed through sign-off, so only the
// other slices' items need the checklist.
function closeGap({ worktree, base, slices, slug, hasOrigin }) {
  const needsChecks = slices.some(
    (slice) => slice.autonomy !== "hitl" && slice.done?.manual?.length > 0,
  );
  if (needsChecks) {
    const trailers = git(worktree, [
      "log",
      "--format=%(trailers:key=Manual-Checks,valueonly)",
      `${base}..HEAD`,
    ]);
    if (trailers === "") return "no commit with a Manual-Checks trailer, so the PR has no checklist";
  }
  if (!hasOrigin) return null;
  const view = spawnSync("gh", ["pr", "view", `slices/${slug}`, "--json", "isDraft"], {
    cwd: worktree,
    encoding: "utf8",
  });
  let isDraft;
  try {
    ({ isDraft } = JSON.parse(view.stdout));
  } catch {
    isDraft = undefined;
  }
  if (typeof isDraft !== "boolean") return `could not confirm the PR state through gh for slices/${slug}`;
  return isDraft ? "the PR is still a draft" : null;
}

function quoteArg(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}

// Appended to every session's system prompt: a skill that would end its turn
// asking a question (write-slices did, on granularity) stalls a headless run,
// so each session is told to settle open choices itself.
const HEADLESS_NOTE =
  "This session runs headlessly inside the run-feature loop: no human can answer mid-run. " +
  "Never end the turn asking a question or waiting for input; " +
  "settle every open choice with the default you would otherwise propose, note it, and finish the task.";

const DAEMON_SESSION = fileURLToPath(new URL("./daemon-session.mjs", import.meta.url));
const DAEMON_LOST = 1;
const DAEMON_UNAVAILABLE = 3;
const DAEMON_ENDED_BY_SOMEONE_ELSE = 4;

// What the board knows of this kick: the run it shows and the end state recorded
// when the process exits.
const board = { runId: "", outcome: "failed", detail: undefined, lastSteps: "" };

function daemonCall(...args) {
  return spawnSync(process.execPath, [DAEMON_SESSION, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

// A kick spends its life waiting on sessions, and a signal handler can only run
// while the process waits without blocking, so sessions never use spawnSync.
function waitFor(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, options);
    child.once("error", (error) => resolve({ status: null, error }));
    child.once("close", (status) => resolve({ status }));
  });
}

// The key makes every kick of this feature in this repo reopen one run, so its
// cost and time stay whole. The name is the slug, which the card shows.
function startRun(repo, slug) {
  const key = `${realpathSync(repo)}:${slug}`;
  board.runId = daemonCall("run-start", slug, `Run the ${slug} feature to a ready PR`, key).stdout?.trim() ?? "";
  if (board.runId === "") return;
  process.on("exit", () => {
    // No session outlives the kick on purpose, so no step should read as running.
    if (board.lastSteps !== "") {
      reportSteps(JSON.parse(board.lastSteps).map((step) => (step.state === "running" ? { ...step, state: "pending" } : step)));
    }
    daemonCall("run-end", board.runId, board.outcome, board.detail ?? "");
  });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      board.outcome = "stopped";
      board.detail = `The run received ${signal}.`;
      process.exit(2);
    });
  }
}

// The plan as git has it, plus what this kick knows and git cannot say yet: the
// slice a session is on now, and the slice that just failed for good.
function planSteps(slices, { done, pending }, { running, failed } = {}) {
  const state = ({ id }) => {
    if (done.has(id)) return "done";
    if (pending.has(id)) return "waiting";
    if (id === failed) return "failed";
    return id === running ? "running" : "pending";
  };
  return slices.map((slice) => ({ id: slice.id, title: slice.title ?? slice.id, state: state(slice) }));
}

// The daemon takes the plan whole, so only a change is worth a call.
function reportSteps(steps) {
  const sent = JSON.stringify(steps);
  if (board.runId === "" || sent === board.lastSteps) return;
  board.lastSteps = sent;
  daemonCall("run-steps", board.runId, sent);
}

function settleSession(sessionId, outcome, detail) {
  if (board.runId === "" || sessionId === undefined) return;
  daemonCall("run-settle", board.runId, sessionId, outcome, detail ?? "");
}

// Through the local agents-hq daemon when one can take it, so it shows on the board and
// can be stopped there; otherwise directly, off the board, with no session id to return.
async function runHarnessSession({ worktree, prompt, label, name, task, parent, stepId }) {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "run-feature-"));
  const resultFile = path.join(scratch, "session-id");
  const viaDaemon = await waitFor(
    process.execPath,
    [
      DAEMON_SESSION,
      "session",
      worktree,
      prompt,
      HEADLESS_NOTE,
      name,
      task,
      resultFile,
      board.runId,
      parent ?? "",
      stepId ?? "",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  const sessionId = existsSync(resultFile) ? readFileSync(resultFile, "utf8") : undefined;
  rmSync(scratch, { recursive: true, force: true });
  // Both halt rather than retry. A lost session may still be working in this
  // worktree, and a person who ended one wants the kick to stop.
  if (viaDaemon.status === DAEMON_LOST) {
    halt(
      "session lost",
      `lost ${sessionId ?? "a session being launched"} on the daemon, so it may still be working in the worktree; check the board, then re-kick`,
      worktree,
    );
  }
  if (viaDaemon.status === DAEMON_ENDED_BY_SOMEONE_ELSE) {
    const reason = `${sessionId} was ended on the board; re-kick to continue`;
    settleSession(sessionId, "stopped", reason);
    halt("session ended", reason, worktree);
  }
  if (viaDaemon.status !== DAEMON_UNAVAILABLE) {
    log(`${label}: daemon session ended with exit code ${viaDaemon.status}`);
    return sessionId;
  }
  log(`${label}: running off the board, as no agents-hq daemon can take it`);
  await runClaudeSession({ worktree, prompt, label });
  return undefined;
}

// The one place the harness is invoked directly, so a second harness stays additive.
// The worktree is dedicated and the loop is already trusted to commit and
// push, so sessions skip the permission system instead of stalling behind an
// allowlist. stdout and stderr stream straight to the terminal and are never
// captured.
async function runClaudeSession({ worktree, prompt, label }) {
  const args = ["-p", prompt, "--dangerously-skip-permissions", "--append-system-prompt", HEADLESS_NOTE];
  log(`${label}: claude ${args.map(quoteArg).join(" ")}`);
  const result = await waitFor("claude", args, {
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
async function runPreStep({ worktree, slug, file, prompt, session, hasOrigin }) {
  const relative = path.join("spec", "features", slug, file);
  const target = path.join(worktree, relative);
  if (existsSync(target)) return;
  const skill = prompt.split(" ")[0];
  const sessionId = await session(prompt, `pre-step ${skill.slice(1)}`, {
    name: skill.slice(1),
    task: `Write ${file}`,
  });
  const wrote = existsSync(target);
  settleSession(sessionId, wrote ? "completed" : "failed", wrote ? undefined : `It did not write ${file}.`);
  if (!wrote) {
    halt(
      "pre-step failed",
      `the ${skill} session did not write ${target}; write it by hand in the worktree, commit and push, then re-kick`,
      worktree,
    );
  }
  commitFile(worktree, relative, `spec: write ${slug} ${file} headlessly`, hasOrigin);
  log(`pre-step committed ${relative}`);
}

async function main() {
  const { repo, slug } = parseArgs(process.argv.slice(2));
  if (!gitOk(repo, ["rev-parse", "--git-dir"])) fail(`${repo} is not a git repository`);

  const branch = defaultBranch(repo);
  const base = baseRef(repo, branch);
  const worktree = addWorktree(repo, slug, base);
  log(`worktree ${worktree} on slices/${slug}`);
  startRun(repo, slug);

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

  ensureSettings(worktree, hasOrigin);

  const session = (prompt, label, member) => runHarnessSession({ worktree, prompt, label, ...member });

  const featureDir = path.join(worktree, "spec", "features", slug);
  if (!existsSync(path.join(featureDir, "spec.md")) && !existsSync(path.join(featureDir, "decisions.md"))) {
    fail(`spec/features/${slug}/decisions.md is missing; settle the decisions and commit them first`);
  }
  await runPreStep({
    worktree,
    slug,
    file: "spec.md",
    prompt: `/write-spec spec/features/${slug}/decisions.md`,
    session,
    hasOrigin,
  });
  await runPreStep({
    worktree,
    slug,
    file: "slices.json",
    prompt: `/write-slices spec/features/${slug}/spec.md`,
    session,
    hasOrigin,
  });

  const slices = readSlices(worktree, slug);
  reportSteps(planSteps(slices, sliceStates(worktree, base, slices)));

  let iteration = 0;
  let closeRan = false;
  let closeSession;
  let lastSession;
  let failingSlice = null;
  for (;;) {
    if (hasOrigin) git(worktree, ["fetch", "origin", "--quiet"]);
    const states = sliceStates(worktree, base, slices);
    const allDone = slices.every((slice) => states.done.has(slice.id));

    if (allDone && closeRan) {
      const gap = closeGap({ worktree, base, slices, slug, hasOrigin });
      settleSession(closeSession, gap ? "failed" : "completed", gap);
      if (gap) {
        halt("close incomplete", `the close session did not finish: ${gap}; fix it or re-kick`, worktree);
      }
      removeWorktree(repo, worktree);
      board.outcome = "completed";
      board.detail = undefined;
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
          { outcome: "waiting" },
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
        { detail: "re-kick to continue" },
      );
    }

    iteration++;
    // implement-slice takes the lowest ready id, so a failed iteration is
    // attributed to that slice.
    const expected = states.ready
      .map((slice) => slice.id)
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))[0];
    const title = slices.find((slice) => slice.id === expected)?.title ?? expected;
    const retrying = failingSlice === expected;
    if (!allDone) reportSteps(planSteps(slices, states, { running: expected }));
    const sessionId = await session(`/implement-slice spec/features/${slug}/`, `iteration ${iteration}`, {
      name: allDone ? "Close the branch" : retrying ? `${expected} retry` : expected,
      task: allDone ? "Close the branch and mark the PR ready" : title,
      parent: retrying ? lastSession : undefined,
      stepId: allDone ? undefined : expected,
    });

    if (allDone) {
      closeSession = sessionId;
      closeRan = true;
      continue;
    }
    // Progress is a grown done or pending set, so a pending slice turning
    // done still counts even though the combined count stays constant.
    const after = sliceStates(worktree, base, slices);
    const progressed = after.done.size > states.done.size || after.pending.size > states.pending.size;
    settleSession(
      sessionId,
      progressed ? "completed" : "failed",
      progressed ? undefined : `No commit marked ${expected} done or pending.`,
    );
    lastSession = sessionId;
    if (!progressed) {
      if (retrying) {
        reportSteps(planSteps(slices, after, { failed: expected }));
        halt("no progress", `no progress: slice ${expected} failed twice in a row`, worktree, { outcome: "failed" });
      }
      failingSlice = expected;
      log(`iteration ${iteration} added no trailer for ${expected}; retrying once`);
      continue;
    }
    reportSteps(planSteps(slices, after));
    failingSlice = null;
  }
}

main();
