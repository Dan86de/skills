#!/usr/bin/env node
// run-feature: loop implement-slice sessions in a dedicated worktree until
// every slice of a feature is committed and the branch is closed.
// State is read only from git trailers and slices.json, never from harness stdout.
// The one exception is closeGap, which asks GitHub whether the PR left draft.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  lstatSync,
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

// The agent account stops starting sessions here, so 5% of its week is left
// for a person to log in to that account and debug a stuck run.
const AGENT_WEEKLY_RESERVE = 0.95;
const RESERVE_PERCENT = `${AGENT_WEEKLY_RESERVE * 100}%`;
// A timer can fire a moment early, which would read the reset as still ahead.
const RESET_MARGIN_MS = 1000;

// Prints a 1-hour GitHub App token for the <owner>/<repo> it is given.
const TOKEN_MINTER = "github-app-token";

// The PR as sessions see it, at the worktree's root and kept out of git: no
// session holds a GitHub credential, so each reads the PR here and writes the
// changes it wants, which the runner applies once it has pushed the session's work.
const PR_DIR = ".run-feature";
const PR_FILE = `${PR_DIR}/pr.json`;
// The only labels a session may set, as implement-slice and pr-brief touch no others.
const PR_LABEL_PREFIX = "attention: ";

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

// A halt reads Stopped on the Runs page unless it says otherwise: only a person
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
  const args = { repo: process.cwd(), slug: null, onHost: false, agentAccount: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") {
      args.repo = argv[++i] ?? fail("--repo needs a path");
    } else if (argv[i] === "--on-host") {
      args.onHost = true;
    } else if (argv[i] === "--agent-account") {
      args.agentAccount = true;
    } else {
      rest.push(argv[i]);
    }
  }
  if (rest.length !== 1) fail("usage: node run.mjs <slug> [--repo <path>] [--on-host] [--agent-account]");
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

// Commit one file to the slices branch, then push it, so the worktree stays
// clean. A session may already have committed the file itself, so a clean
// index just skips to the push.
function commitFile(worktree, relative, message, push) {
  git(worktree, ["add", relative]);
  if (!gitOk(worktree, ["diff", "--cached", "--quiet"])) {
    gitOrHalt(worktree, ["commit", "--quiet", "-m", message], "commit refused", `committing ${relative}`);
  }
  push();
}

// A hook or remote can refuse what the runner commits; that is a halt naming
// git's own reason, never a stack trace.
function gitOrHalt(dir, args, state, doing, { env, worktree = dir } = {}) {
  const result = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", env });
  if (result.status === 0) return;
  const cause = (result.stderr || result.stdout || "").trim() || `git exited with ${result.status}`;
  halt(state, `git refused ${doing}: ${cause}; fix it in the worktree, then re-kick`, worktree);
}

// A bare clone only the host writes, the one place the slices branch is pushed
// from. Bare, so nothing ever checks a file out and runs a filter on it.
function hostClone(repo, slug) {
  const common = git(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const clone = path.join(common, "run-feature", `${slug}.git`);
  if (!existsSync(clone)) git(repo, ["init", "--bare", "--quiet", "--template=", clone]);
  return clone;
}

// The App's token, or null when no minter is installed; a minter that fails is
// a halt, never a push with some other credential.
function mintToken(repository, worktree, state) {
  const result = spawnSync(TOKEN_MINTER, [repository], { encoding: "utf8" });
  if (result.error?.code === "ENOENT") return null;
  const token = result.stdout?.trim() ?? "";
  if (result.status !== 0 || token === "") {
    const cause = result.error?.message || result.stderr?.trim() || `it exited with ${result.status}`;
    halt(state, `${TOKEN_MINTER} gave no token for ${repository}: ${cause}; fix the minter, then re-kick`, worktree);
  }
  return token;
}

let warnedNoMinter = false;

// Pushes the slices branch as the session's tree holds it, without running git
// in that tree: the host clone fetches from it, which runs none of its hooks,
// config or filters, and pushes with every hook off.
function publish({ worktree, clone, slug, origin }) {
  const ref = `refs/heads/slices/${slug}`;
  const hostArgs = [`--git-dir=${clone}`, "-c", "core.hooksPath=/dev/null"];
  const hostGit = (args, doing, env) =>
    gitOrHalt(clone, [...hostArgs, ...args], "push refused", doing, { env, worktree });
  // Only a broken worktree or a lost branch fails this, so it is no push refusal.
  const fetch = [...hostArgs, "fetch", "--quiet", "--no-tags", worktree, `+${ref}:${ref}`];
  const fetched = spawnSync("git", ["-C", clone, ...fetch], { encoding: "utf8" });
  if (fetched.status !== 0) fail(`could not fetch slices/${slug} from ${worktree}: ${fetched.stderr.trim()}`);
  const app = appRemote(origin);
  const token = mintToken(app.repository, worktree, "push refused");
  if (token === null) {
    if (!warnedNoMinter) log(`push: no ${TOKEN_MINTER} on PATH, so pushes use this shell's own git credential`);
    warnedNoMinter = true;
    hostGit(["push", "--quiet", origin, `${ref}:${ref}`], `pushing slices/${slug}`);
    return;
  }
  // The token goes in through the environment, so it never shows in a process
  // list or lands in a config file. The user's and the system's git config
  // files stay out, so no insteadOf of theirs rewrites the push to SSH and no
  // stored login answers in the App's place.
  const header = `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  hostGit(["push", "--quiet", app.url, `${ref}:${ref}`], `pushing slices/${slug} with the App token`, {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraHeader",
    GIT_CONFIG_VALUE_0: header,
  });
}

// Origin's push address as configured, before any insteadOf rewrites it.
function originUrl(repo) {
  const pushUrl = spawnSync("git", ["-C", repo, "config", "--get", "remote.origin.pushurl"], { encoding: "utf8" });
  return pushUrl.status === 0 ? pushUrl.stdout.trim() : git(repo, ["config", "--get", "remote.origin.url"]);
}

// The <owner>/<repo> the minter is asked for, and where the App's token is
// pushed: an App token works only over HTTPS, so a GitHub SSH remote is pushed
// to at its HTTPS address.
function appRemote(url) {
  const ssh = url.match(/^(?:ssh:\/\/)?git@github\.com[:/](.+?)(?:\.git)?\/?$/);
  if (ssh) return { repository: ssh[1], url: `https://github.com/${ssh[1]}.git` };
  return { repository: url.replace(/\.git\/?$/, "").split(/[/:]/).slice(-2).join("/"), url };
}

// One gh call on the slices branch's PR, as the App when a minter is installed
// and with the shell's own gh login otherwise. It runs outside the worktree, so
// no git that gh starts reads the session's config.
function github(remote, token, args, doing, input) {
  const env = token === null ? process.env : { ...process.env, GH_TOKEN: token };
  const result = spawnSync("gh", [...args, "--repo", remote.repository], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    env,
    input,
  });
  if (result.status === 0) return result.stdout;
  const cause = result.error?.message || (result.stderr || result.stdout || "").trim() || `gh exited with ${result.status}`;
  halt("pr refused", `gh refused ${doing}: ${cause}; fix it, then re-kick`, remote.worktree);
}

function prToken(remote) {
  return mintToken(remote.repository, remote.worktree, "pr refused");
}

// A gh call that prints a JSON list; anything else halts rather than guessing.
function githubList(remote, token, args, doing) {
  let list;
  try {
    list = JSON.parse(github(remote, token, args, doing));
  } catch {
    list = undefined;
  }
  if (!Array.isArray(list)) halt("pr refused", `gh gave no list ${doing}; fix it, then re-kick`, remote.worktree);
  return list;
}

// The open PR from slices/<slug>, or null when none is open.
function findPr(remote, token) {
  const [pr] = githubList(
    remote,
    token,
    ["pr", "list", "--head", `slices/${remote.slug}`, "--state", "open", "--limit", "1", "--json", "number,url,title,body,labels,isDraft"],
    `reading the PR for slices/${remote.slug}`,
  );
  return pr ? { ...pr, labels: pr.labels.map((label) => label.name) } : null;
}

// Removes what stands at the PR file's place before the runner writes there, so
// a link a session left cannot point the write at a file outside the worktree;
// a link itself is removed, never what it points at.
function clearPrFile(worktree) {
  rmSync(path.join(worktree, PR_DIR), { recursive: true, force: true });
}

// Hands the next session the PR as GitHub has it, with the repository and base
// a new PR needs; number and url stay null until a session opens one.
function writePrFile(remote) {
  const pr = findPr(remote, prToken(remote));
  clearPrFile(remote.worktree);
  mkdirSync(path.join(remote.worktree, PR_DIR), { recursive: true });
  const file = {
    repository: remote.repository,
    base: remote.base,
    head: `slices/${remote.slug}`,
    number: pr?.number ?? null,
    url: pr?.url ?? null,
    title: pr?.title ?? null,
    body: pr?.body ?? null,
    labels: pr?.labels ?? [],
    draft: pr?.isDraft ?? true,
  };
  writeFileSync(path.join(remote.worktree, PR_FILE), JSON.stringify(file, null, 2) + "\n", { flag: "wx" });
}

// What the session wants of the PR, read only when the file is a plain file
// inside the worktree, so a link cannot have the runner post a host file.
function readPrFile(worktree) {
  const file = path.join(worktree, PR_FILE);
  // lstat, as existsSync would read a dangling link as no file at all.
  if (lstatSync(file, { throwIfNoEntry: false }) === undefined) return null;
  if (!existsSync(file)) {
    halt("pr refused", `${PR_FILE} in the worktree is not a plain file; remove it, then re-kick`, worktree);
  }
  const expected = path.join(realpathSync(worktree), PR_FILE);
  if (realpathSync(file) !== expected || !lstatSync(file).isFile()) {
    halt("pr refused", `${PR_FILE} in the worktree is not a plain file; remove it, then re-kick`, worktree);
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    halt("pr refused", `${PR_FILE} in the worktree is not valid JSON: ${error.message}; fix it, then re-kick`, worktree);
  }
}

// Applies the session's PR file after its work is pushed: opens the PR as a
// draft, rewrites its body, sets its attention labels and marks it ready.
function applyPr(remote) {
  const wanted = readPrFile(remote.worktree);
  if (wanted === null) return;
  const token = prToken(remote);
  let pr = findPr(remote, token);
  if (pr === null) {
    if (typeof wanted.title !== "string" || wanted.title === "") return;
    github(
      remote,
      token,
      ["pr", "create", "--draft", "--base", remote.base, "--head", `slices/${remote.slug}`, "--title", wanted.title, "--body-file", "-"],
      `opening the PR for slices/${remote.slug}`,
      wanted.body ?? "",
    );
    pr = findPr(remote, token);
    if (pr === null) halt("pr refused", `gh opened no PR for slices/${remote.slug}; re-kick`, remote.worktree);
    log(`pr: opened ${pr.url} as a draft`);
  }
  if (typeof wanted.body === "string" && wanted.body !== pr.body) {
    github(remote, token, ["pr", "edit", String(pr.number), "--body-file", "-"], `editing the PR body`, wanted.body);
  }
  if (Array.isArray(wanted.labels)) {
    const attention = (labels) => labels.filter((label) => typeof label === "string" && label.startsWith(PR_LABEL_PREFIX));
    const add = attention(wanted.labels).filter((label) => !pr.labels.includes(label));
    const remove = attention(pr.labels).filter((label) => !wanted.labels.includes(label));
    if (add.length > 0) {
      const existing = githubList(remote, token, ["label", "list", "--limit", "1000", "--json", "name"], "listing labels");
      for (const label of add.filter((name) => !existing.some((entry) => entry.name === name))) {
        github(remote, token, ["label", "create", label], `creating the label ${label}`);
      }
    }
    if (add.length > 0 || remove.length > 0) {
      const flags = [...add.flatMap((label) => ["--add-label", label]), ...remove.flatMap((label) => ["--remove-label", label])];
      github(remote, token, ["pr", "edit", String(pr.number), ...flags], "setting the PR's attention label");
    }
  }
  if (wanted.draft === false && pr.isDraft) {
    github(remote, token, ["pr", "ready", String(pr.number)], "marking the PR ready");
    log(`pr: marked ${pr.url} ready`);
  }
}

// Keeps the PR file out of every checkout's status, so it is never committed
// and a tree holding it still reads clean.
function excludePrFile(repo) {
  const exclude = git(repo, ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"]);
  const line = `/${PR_DIR}/`;
  const current = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  if (current.split("\n").includes(line)) return;
  mkdirSync(path.dirname(exclude), { recursive: true });
  appendFileSync(exclude, `${current === "" || current.endsWith("\n") ? "" : "\n"}${line}\n`);
}

// The lockfile names the package manager, and its frozen install is the one
// that never rewrites the lockfile.
const INSTALLERS = [
  ["pnpm-lock.yaml", "pnpm", ["install", "--frozen-lockfile"]],
  ["package-lock.json", "npm", ["ci"]],
  ["yarn.lock", "yarn", ["install", "--frozen-lockfile"]],
  ["bun.lock", "bun", ["install", "--frozen-lockfile"]],
  ["bun.lockb", "bun", ["install", "--frozen-lockfile"]],
];

// A fresh worktree has no node_modules, and a project's commit hooks and
// verify skill usually need them, so the worktree gets them before any session.
async function installDependencies(worktree) {
  if (existsSync(path.join(worktree, "node_modules"))) return;
  const installer = INSTALLERS.find(([lockfile]) => existsSync(path.join(worktree, lockfile)));
  if (!installer) return;
  const [lockfile, command, args] = installer;
  log(`installing dependencies: ${command} ${args.join(" ")}`);
  const { status, error } = await waitFor(command, args, {
    cwd: worktree,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (status !== 0) {
    const cause = error ? error.message : `it exited with ${status}`;
    halt(
      "install failed",
      `${command} ${args.join(" ")} failed for ${lockfile}: ${cause}; install by hand in the worktree, then re-kick`,
      worktree,
    );
  }
}

// Seed a project that has no committed Claude settings with a default Bash
// allowlist, committed like the pre-steps so the worktree stays clean.
function ensureSettings(worktree, push) {
  const relative = path.join(".claude", "settings.json");
  const target = path.join(worktree, relative);
  if (existsSync(target)) return;
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(DEFAULT_SETTINGS, null, 2) + "\n");
  commitFile(worktree, relative, "chore: seed the default Claude settings allowlist", push);
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

// Slices a person must act on wait until the unattended work is done.
function nextSlice(ready) {
  const byId = (a, b) => a.id.localeCompare(b.id, "en", { numeric: true });
  const afk = ready.filter((slice) => slice.autonomy !== "hitl").sort(byId);
  return (afk[0] ?? [...ready].sort(byId)[0])?.id;
}

// A proven bug the close could not fix: the newest Address review names each
// one in a Known-Failure trailer and leaves the PR a draft for a person.
function knownFailures(worktree, base) {
  const commits = git(worktree, [
    "log",
    "--format=%s%x1f%(trailers:key=Known-Failure,valueonly,separator=%x1f)%x1e",
    `${base}..HEAD`,
  ]).split("\x1e");
  const review = commits.map((commit) => commit.trim().split("\x1f")).find(([subject]) => subject === "Address review");
  return review?.slice(1).filter(Boolean) ?? [];
}

// What the close session left undone, or null. A session can end without
// finishing, so "complete" is only reported on what it actually left behind.
// A hitl slice's manual items were confirmed through sign-off, so only the
// other slices' items need the checklist.
function closeGap({ worktree, base, slices, remote }) {
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
  if (remote === null) return null;
  const pr = findPr(remote, prToken(remote));
  if (pr === null) return `no open PR for slices/${remote.slug}`;
  return pr.isDraft ? "the PR is still a draft" : null;
}

function quoteArg(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}

// Appended to every session's system prompt: a skill that would end its turn
// asking a question (write-slices did, on granularity) stalls a headless run,
// so each session is told to settle open choices itself. A watcher left armed
// after the work is done reads as working until it expires, and once held a
// finished slice open for 24 minutes.
const HEADLESS_NOTE =
  "This session runs headlessly inside a run-feature run: no human can answer mid-run. " +
  "Never end the turn asking a question or waiting for input; " +
  "settle every open choice with the default you would otherwise propose, note it, and finish the task. " +
  "Before your final turn ends, stop every Monitor and background command you started: " +
  "the run moves on only once nothing of this session is still running, so a leftover one stalls it until it expires.";

// Appended after the headless note: the session pushes nothing and touches the
// PR only through the PR file, which the runner applies as the GitHub App.
const PR_NOTE =
  "run-feature owns this branch's pushes and pull request, so never run `git push` or `gh`: " +
  `after the session the runner pushes HEAD, then applies \`${PR_FILE}\` at the worktree root, which git ignores. ` +
  "That file holds the PR: `repository` (owner/name), `base`, `head`, `number` and `url` (null until it is opened), " +
  "`title`, `body`, `labels` and `draft`. Read the PR from it, and change the PR by writing the file back: " +
  "set `title`, `body` and `draft: true` to open it, rewrite `body` to edit it, list its `attention:` labels in `labels`, " +
  "and set `draft` to false to mark it ready. The PR's head is HEAD once the runner has pushed.";
const LOCAL_NOTE = "This run has no remote, so never run `git push` or `gh`; there is no PR.";

const DAEMON_SESSION = fileURLToPath(new URL("./daemon-session.mjs", import.meta.url));
const DAEMON_LOST = 1;
const DAEMON_UNAVAILABLE = 3;
const DAEMON_ENDED_BY_SOMEONE_ELSE = 4;

// What the Runs page knows of this kick: the run it shows, the call that opens it, and
// the end state recorded when the process exits.
// sessionFile is where the session now running writes its id, set only while one runs.
const board = { runId: "", open: [], outcome: "failed", detail: undefined, lastSteps: "", sessionFile: undefined };

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
  board.open = ["run-start", slug, `Run the ${slug} feature to a ready PR`, `${realpathSync(repo)}:${slug}`];
  // A member a killed kick left unsettled, such as its last slice, is stopped here.
  board.runId = daemonCall(...board.open).stdout?.trim() ?? "";
  // The session's process may outlive the kick's even with no run to show it in.
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.on(signal, () => {
      board.outcome = "stopped";
      board.detail = `The run received ${signal}.`;
      stopLiveSession(board.detail);
      process.exit(2);
    });
  }
  if (board.runId === "") return;
  process.on("exit", () => {
    // No session outlives the kick on purpose, so no step should read as running.
    reportSteps(stepsAtRest());
    daemonCall("run-end", board.runId, board.outcome, board.detail ?? "");
  });
}

// A kick stopped mid-session ends that session, since nothing would push its
// work or settle it, and records its member as stopped with the reason.
function stopLiveSession(detail) {
  const file = board.sessionFile;
  if (file === undefined || !existsSync(file)) return;
  const sessionId = readFileSync(file, "utf8").trim();
  if (sessionId !== "") daemonCall("session-stop", board.runId, sessionId, detail);
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

// The plan last sent, with no step running, for while no session is.
function stepsAtRest() {
  if (board.lastSteps === "") return [];
  return JSON.parse(board.lastSteps).map((step) => (step.state === "running" ? { ...step, state: "pending" } : step));
}

// The daemon takes the plan whole, so only a change is worth a call.
function reportSteps(steps) {
  const sent = JSON.stringify(steps);
  if (board.runId === "" || steps.length === 0 || sent === board.lastSteps) return;
  board.lastSteps = sent;
  daemonCall("run-steps", board.runId, sent);
}

function settleSession(sessionId, outcome, detail) {
  if (board.runId === "" || sessionId === undefined) return;
  daemonCall("run-settle", board.runId, sessionId, outcome, detail ?? "");
}

// The daemon's latest rate-limit reading, or undefined when no daemon has one.
function readQuota() {
  const printed = daemonCall("quota").stdout?.trim() ?? "";
  if (printed === "") return undefined;
  try {
    return JSON.parse(printed);
  } catch {
    return undefined;
  }
}

// What holds the agent account's sessions back, or null. The daemon only learns
// a new reading from a session, so a reading whose reset has passed is stale.
function quotaHold(reading) {
  if (reading === undefined) return null;
  const limited = reading.status === "rejected";
  const reserved = reading.window === "seven_day" && (reading.utilization ?? 0) >= AGENT_WEEKLY_RESERVE;
  if (!limited && !reserved) return null;
  const resetsAt = reading.resetsAt === undefined ? undefined : Date.parse(reading.resetsAt);
  if (resetsAt !== undefined && resetsAt <= Date.now()) return null;
  return {
    what: limited ? `the ${reading.window ?? "usage"} limit` : `the agent account's ${RESERVE_PERCENT} weekly reserve`,
    limited,
    resetsAt,
  };
}

// Starts no session while the agent account is held back: the run reads waiting
// with the reset time, one banner fires, and the run reopens once it resets.
async function waitOutQuota(worktree) {
  for (let hold = quotaHold(readQuota()); hold !== null; hold = quotaHold(readQuota())) {
    if (hold.resetsAt === undefined) {
      halt("quota reached", `${hold.what} was reached with no reset time; re-kick once it resets`, worktree, {
        outcome: "waiting",
      });
    }
    const resetTime = new Date(hold.resetsAt).toISOString();
    const detail = `Waiting for ${hold.what} to reset at ${resetTime}.`;
    log(`quota: ${detail}`);
    const plan = board.lastSteps;
    if (board.runId !== "") {
      reportSteps(stepsAtRest());
      daemonCall("run-end", board.runId, "waiting", detail);
    }
    notify("waiting for quota");
    await new Promise((resolve) => setTimeout(resolve, hold.resetsAt - Date.now() + RESET_MARGIN_MS));
    log(`quota: ${hold.what} reset, resuming`);
    if (board.runId !== "") {
      daemonCall(...board.open);
      if (plan !== "") reportSteps(JSON.parse(plan));
    }
  }
}

// Through the local agents-hq daemon when one can take it, so it shows on the Runs page and
// can be stopped there; otherwise directly, outside agents-hq, with no session id to return.
async function runHarnessSession({ worktree, prompt, note, label, name, task, parent, stepId }) {
  const scratch = mkdtempSync(path.join(os.tmpdir(), "run-feature-"));
  const resultFile = path.join(scratch, "session-id");
  board.sessionFile = resultFile;
  const viaDaemon = await waitFor(
    process.execPath,
    [
      DAEMON_SESSION,
      "session",
      worktree,
      prompt,
      note,
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
  board.sessionFile = undefined;
  rmSync(scratch, { recursive: true, force: true });
  // Both halt rather than retry. A lost session may still be working in this
  // worktree, and a person who ended one wants the kick to stop.
  if (viaDaemon.status === DAEMON_LOST) {
    halt(
      "session lost",
      `lost ${sessionId ?? "a session being launched"} on the daemon, so it may still be working in the worktree; check the Runs page, then re-kick`,
      worktree,
    );
  }
  if (viaDaemon.status === DAEMON_ENDED_BY_SOMEONE_ELSE) {
    const reason = `${sessionId} was ended in agents-hq; re-kick to continue`;
    settleSession(sessionId, "stopped", reason);
    halt("session ended", reason, worktree);
  }
  if (viaDaemon.status !== DAEMON_UNAVAILABLE) {
    log(`${label}: daemon session ended with exit code ${viaDaemon.status}`);
    return sessionId;
  }
  log(`${label}: running outside agents-hq, as no agents-hq daemon can take it`);
  await runClaudeSession({ worktree, prompt, note, label });
  return undefined;
}

// The one place the harness is invoked directly, so a second harness stays additive.
// The worktree is dedicated and the loop is already trusted to commit and
// push, so sessions skip the permission system instead of stalling behind an
// allowlist. stdout and stderr stream straight to the terminal and are never
// captured.
async function runClaudeSession({ worktree, prompt, note, label }) {
  const args = ["-p", prompt, "--dangerously-skip-permissions", "--append-system-prompt", note];
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
async function runPreStep({ worktree, slug, file, prompt, session, push }) {
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
  commitFile(worktree, relative, `spec: write ${slug} ${file} headlessly`, push);
  log(`pre-step committed ${relative}`);
}

async function main() {
  const { repo, slug, onHost, agentAccount } = parseArgs(process.argv.slice(2));
  // No session starts in a container yet.
  if (!onHost) {
    fail(
      "refusing to start sessions outside a container: they would run on this host with full access, beside your credentials; pass --on-host to run them here anyway",
    );
  }
  log("on host: --on-host given, so every session runs outside a container, with full access");
  if (agentAccount) {
    log(`agent account: --agent-account given, so no session starts at ${RESERVE_PERCENT} of the week or at a usage limit until it resets`);
  }
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

  await installDependencies(worktree);

  if (!hasVerifySkill(worktree)) {
    halt(
      "no verify skill",
      "no verify skill at .agents/skills/verify; run make-verify in the project, commit it, then re-kick",
      worktree,
    );
  }

  const remote = hasOrigin
    ? (() => {
        const origin = originUrl(repo);
        return { worktree, slug, base: branch, clone: hostClone(repo, slug), origin, repository: appRemote(origin).repository };
      })()
    : null;
  if (remote) excludePrFile(repo);
  const note = `${HEADLESS_NOTE} ${remote ? PR_NOTE : LOCAL_NOTE}`;
  const push = () => {
    if (remote) publish(remote);
  };
  ensureSettings(worktree, push);

  // A session never pushes or reaches GitHub for the run: whatever it committed
  // is published here, and then the PR it asked for.
  const session = async (prompt, label, member) => {
    if (agentAccount) await waitOutQuota(worktree);
    if (remote) writePrFile(remote);
    const sessionId = await runHarnessSession({ worktree, prompt, note, label, ...member });
    push();
    if (remote) applyPr(remote);
    return sessionId;
  };

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
    push,
  });
  await runPreStep({
    worktree,
    slug,
    file: "slices.json",
    prompt: `/write-slices spec/features/${slug}/spec.md`,
    session,
    push,
  });

  const slices = readSlices(worktree, slug);
  reportSteps(planSteps(slices, sliceStates(worktree, base, slices)));

  let iteration = 0;
  let closeRan = false;
  let closeSession;
  let lastSession;
  let failingSlice = null;
  for (;;) {
    const states = sliceStates(worktree, base, slices);
    const allDone = slices.every((slice) => states.done.has(slice.id));

    if (allDone && closeRan) {
      const known = knownFailures(worktree, base);
      // A known failure leaves the PR a draft on purpose, so only the checklist is checked.
      const gap = closeGap({ worktree, base, slices, remote: known.length === 0 ? remote : null });
      settleSession(closeSession, gap ? "failed" : "completed", gap);
      if (gap) {
        halt("close incomplete", `the close session did not finish: ${gap}; fix it or re-kick`, worktree);
      }
      if (known.length > 0) {
        halt(
          "known failure",
          `the close committed ${known.join(", ")} as a known failure it could not fix, and left the PR a draft; read it under Needs you, then re-kick`,
          worktree,
          { outcome: "waiting" },
        );
      }
      clearPrFile(worktree);
      removeWorktree(repo, worktree);
      if (remote) rmSync(remote.clone, { recursive: true, force: true });
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
    // implement-slice takes the lowest ready afk id, or the lowest ready id
    // when none is afk, so a failed iteration is attributed to that slice.
    const expected = nextSlice(states.ready);
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
    // The reserve only holds back the next session; a limit is what cuts one short.
    const cutShort = !progressed && agentAccount ? quotaHold(readQuota()) : null;
    if (cutShort?.limited && git(worktree, ["status", "--porcelain"]) === "") {
      // A usage limit is no failed attempt: the next session waits it out instead.
      settleSession(sessionId, "stopped", `Cut short by ${cutShort.what}.`);
      log(`iteration ${iteration} was cut short by ${cutShort.what}; not counted as a failure`);
      continue;
    }
    settleSession(
      sessionId,
      progressed ? "completed" : "failed",
      progressed ? undefined : `No commit marked ${expected} done or pending.`,
    );
    lastSession = sessionId;
    if (!progressed) {
      // implement-slice leaves its diff only when it stopped for the user to
      // decide, and refuses a dirty tree on the next attempt, so a retry
      // could only fail again.
      if (git(worktree, ["status", "--porcelain"]) !== "") {
        reportSteps(planSteps(slices, after, { failed: expected }));
        halt(
          "slice stopped",
          `slice ${expected} stopped for you with uncommitted changes in the worktree; read its session's report, commit or discard them, then re-kick`,
          worktree,
          { outcome: "waiting" },
        );
      }
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

// Anything unforeseen still ends as a readable bad-environment exit.
main().catch((error) => fail(`unexpected error: ${error.message}`));
