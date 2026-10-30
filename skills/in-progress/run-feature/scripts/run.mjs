#!/usr/bin/env node
// run-feature: loop implement-slice sessions in a dedicated worktree until
// every slice of a feature is committed and the branch is closed.
// State is read only from git trailers and slices.json, never from harness stdout.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function fail(message) {
  process.stderr.write(`run-feature: ${message}\n`);
  process.exit(1);
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

function addWorktree(repo, slug, base) {
  const worktree = path.join(path.dirname(repo), `${path.basename(repo)}-slices-${slug}`);
  if (existsSync(worktree)) {
    fail(`worktree ${worktree} already exists; remove it or finish that run first`);
  }
  const branch = `slices/${slug}`;
  if (gitOk(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])) {
    git(repo, ["worktree", "add", worktree, branch]);
  } else if (gitOk(repo, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`])) {
    git(repo, ["worktree", "add", "--track", "-b", branch, worktree, `origin/${branch}`]);
  } else {
    git(repo, ["worktree", "add", "--no-track", "-b", branch, worktree, base]);
  }
  return worktree;
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

function quoteArg(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}

// The one place the harness is invoked, so a second harness stays additive.
// stdout and stderr stream straight to the terminal and are never captured.
function runHarnessSession({ worktree, slug, allowlist, iteration }) {
  const args = [
    "-p",
    `/implement-slice spec/features/${slug}/`,
    "--permission-mode",
    "acceptEdits",
  ];
  if (allowlist.length > 0) args.push("--allowedTools", allowlist.join(","));
  log(`iteration ${iteration}: claude ${args.map(quoteArg).join(" ")}`);
  const result = spawnSync("claude", args, {
    cwd: worktree,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.error) fail(`could not start claude: ${result.error.message}`);
  log(`iteration ${iteration}: session ended with exit code ${result.status}`);
}

function main() {
  const { repo, slug } = parseArgs(process.argv.slice(2));
  if (!gitOk(repo, ["rev-parse", "--git-dir"])) fail(`${repo} is not a git repository`);

  const branch = defaultBranch(repo);
  const base = baseRef(repo, branch);
  const worktree = addWorktree(repo, slug, base);
  log(`worktree ${worktree} on slices/${slug}`);

  const slices = readSlices(worktree, slug);
  const allowlist = bashAllowlist(worktree);

  const hasOrigin = gitOk(repo, ["remote", "get-url", "origin"]);

  let iteration = 0;
  let closeRan = false;
  for (;;) {
    if (hasOrigin) git(worktree, ["fetch", "origin", "--quiet"]);
    const states = sliceStates(worktree, base, slices);
    const allDone = slices.every((slice) => states.done.has(slice.id));

    if (allDone && closeRan) {
      log(`all ${slices.length} slices done, branch closed, worktree kept at ${worktree}`);
      process.exit(0);
    }
    if (!allDone && states.ready.length === 0) {
      fail(
        `nothing is ready: done [${[...states.done].join(", ")}], pending [${[...states.pending].join(", ")}]`,
      );
    }

    iteration++;
    runHarnessSession({ worktree, slug, allowlist, iteration });

    if (allDone) {
      closeRan = true;
      continue;
    }
    // Progress is a grown done or pending set, so a pending slice turning
    // done still counts even though the combined count stays constant.
    const after = sliceStates(worktree, base, slices);
    if (after.done.size <= states.done.size && after.pending.size <= states.pending.size) {
      fail(`no progress: iteration ${iteration} added no slice trailer on slices/${slug}`);
    }
  }
}

main();
