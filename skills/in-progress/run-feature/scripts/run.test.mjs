// Seam tests for run.mjs: drive the runner's process boundary against a
// throwaway target repo with a stub harness and gh on PATH.
// Covers slices S1 through S6 of spec/features/run-feature/spec.md, the
// refusal to start sessions on the host without --on-host, the agent
// account's quota brake, the push from a host-owned clone with an App token,
// and the PR the runner opens and readies as the App from the sessions' PR file.

import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { before, describe, it } from "node:test";

const RUNNER = fileURLToPath(new URL("./run.mjs", import.meta.url));

// The gh stub logs whichever token reaches it, so a token the shell exports
// would read as the App's or hide a call made without one. Every child here
// inherits process.env, so the tests start from a shell with no GitHub token.
for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"]) {
  delete process.env[name];
}

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
// slice's trailer (Slice-Pending for a hitl slice), pushes, and opens the PR
// or adds the slice to its body through the PR file, or marks the PR ready
// once every slice is done.
// Extensionless file, so Node parses it as CommonJS.
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require("node:fs");
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
const pr = (change) => {
  if (!existsSync(".run-feature/pr.json")) return;
  writeFileSync(".run-feature/pr.json", JSON.stringify(change(JSON.parse(readFileSync(".run-feature/pr.json", "utf8")))));
};
const markReady = () => pr((file) => ({ ...file, labels: ["attention: skim"], draft: false }));
const slices = JSON.parse(readFileSync("spec/features/demo/slices.json", "utf8")).slices;
const read = (key) =>
  new Set(
    git("log", "--format=%(trailers:key=" + key + ",valueonly)", "origin/main..HEAD")
      .split("\\n")
      .filter(Boolean),
  );
const done = read("Slice");
const pending = read("Slice-Pending");
const ready = slices.filter(
  (s) => !done.has(s.id) && !pending.has(s.id) && s.blocked_by.every((b) => done.has(b)),
);
const next = ready.find((s) => s.autonomy !== "hitl") ?? ready[0];
if (!next) {
  if (slices.some((s) => s.autonomy !== "hitl" && s.done?.manual?.length > 0)) {
    git("commit", "--allow-empty", "-m", "Manual checks\\n\\n- S1: Looks right\\n\\nManual-Checks: 1");
    git("push", "--quiet", "origin", "HEAD");
  }
  markReady();
} else {
  const trailer = (next.autonomy === "hitl" ? "Slice-Pending: " : "Slice: ") + next.id;
  git("commit", "--allow-empty", "-m", next.title + "\\n\\nProof.\\n\\n" + trailer);
  git("push", "--quiet", "origin", "HEAD");
  pr((file) =>
    file.number === null
      ? { ...file, title: "demo", body: "## Slices\\n\\n" + next.id, draft: true }
      : { ...file, body: file.body + "\\n" + next.id },
  );
}
`;

const GH_STUB = `#!/usr/bin/env node
// Stands in for GitHub's PRs and labels, kept in a state file beside the log,
// and logs each call with the token it carried.
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require("node:fs");
const argv = process.argv.slice(2);
appendFileSync(process.env.STUB_GH_LOG, argv.join(" ") + " [token " + (process.env.GH_TOKEN || "none") + "]\\n");
const stateFile = process.env.STUB_GH_LOG + ".state";
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { pr: null, labels: [] };
const save = () => writeFileSync(stateFile, JSON.stringify(state));
const flag = (name) => argv[argv.indexOf(name) + 1];
const flags = (name) => argv.flatMap((arg, i) => (arg === name ? [argv[i + 1]] : []));
const command = argv.slice(0, 2).join(" ");
if (command === "pr list") {
  console.log(JSON.stringify(state.pr ? [{ ...state.pr, labels: state.pr.labels.map((name) => ({ name })) }] : []));
} else if (command === "pr create") {
  const url = "https://github.com/" + flag("--repo") + "/pull/1";
  const body = readFileSync(0, "utf8");
  state.pr = { number: 1, url, title: flag("--title"), body, labels: [], isDraft: true, base: flag("--base"), head: flag("--head") };
  save();
  console.log(url);
} else if (command === "pr edit") {
  if (argv.includes("--body-file")) state.pr.body = readFileSync(0, "utf8");
  for (const label of flags("--add-label")) {
    if (!state.labels.includes(label)) {
      console.error("could not add label: '" + label + "' not found");
      process.exit(1);
    }
    state.pr.labels.push(label);
  }
  state.pr.labels = state.pr.labels.filter((label) => !flags("--remove-label").includes(label));
  save();
} else if (command === "pr ready") {
  state.pr.isDraft = false;
  save();
} else if (command === "label list") {
  console.log(JSON.stringify(state.labels.map((name) => ({ name }))));
} else if (command === "label create") {
  state.labels.push(argv[2]);
  save();
}
`;

// Close sessions that end early, each leaving a different part undone.
const CLOSE_SKIPS_CHECKS_STUB = CLAUDE_STUB.replace(
  'git("commit", "--allow-empty", "-m", "Manual checks',
  'if (false) git("commit", "--allow-empty", "-m", "Manual checks',
);
const CLOSE_STAYS_DRAFT_STUB = CLAUDE_STUB.replace(
  '  markReady();',
  '  console.log("close session stopped before marking the PR ready");',
);
// A close that commits a proven bug it could not fix and leaves the PR a
// draft, and the later close that fixes it.
const closeCommitting = (message, ready) =>
  CLAUDE_STUB.replace(
    '  markReady();',
    `  git("commit", "--allow-empty", "-m", ${JSON.stringify(message)});
  git("push", "--quiet", "origin", "HEAD");
${ready ? '  markReady();' : ""}`,
  );
const KNOWN_FAILURE_STUB = closeCommitting(
  "Address review\n\nProved: Q2 => stands: known failure\n\nKnown-Failure: Q2",
  false,
);
const KNOWN_FAILURE_FIXED_STUB = closeCommitting("Address review\n\nProved: Q2 => fixed: the bug", true);

// An origin-less session: nothing to push to and no PR to mark ready.
const LOCAL_ONLY_STUB = CLOSE_STAYS_DRAFT_STUB.replaceAll("origin/main..HEAD", "main..HEAD").replaceAll(
  'git("push", "--quiet", "origin", "HEAD");',
  "",
);

// The GitHub App's token minter: logs the repository it was asked for and
// prints a token, unless told to fail.
const MINTER_STUB = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
appendFileSync(process.env.STUB_MINTER_LOG, process.argv.slice(2).join(" ") + "\\n");
if (process.env.STUB_MINTER_FAIL) {
  console.error("the App is not installed on this repository");
  process.exit(1);
}
console.log("stub-app-token");
`;

const OSASCRIPT_STUB = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
appendFileSync(process.env.STUB_OSA_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
`;

// A pnpm that records each call and installs by creating node_modules,
// unless told to fail.
const PNPM_STUB = `#!/usr/bin/env node
const { appendFileSync, mkdirSync } = require("node:fs");
appendFileSync(process.env.STUB_PNPM_LOG, JSON.stringify(process.argv.slice(2)) + "\\n");
if (process.env.STUB_PNPM_FAIL) process.exit(1);
mkdirSync("node_modules", { recursive: true });
`;

// The agents-hq pre-commit hook's guard: no commit from a checkout without
// node_modules.
const PRE_COMMIT_HOOK = `#!/bin/sh
if [ ! -d node_modules ]; then
  echo "pre-commit: no node_modules in this checkout. Run pnpm install, then commit again." >&2
  exit 1
fi
`;

// A session whose write-spec pre-step produces nothing, for the
// "pre-step failed" halt and its banner.
const PRESTEP_FAIL_STUB = CLAUDE_STUB.replace(
  'require("node:fs").writeFileSync("spec/features/demo/spec.md", "# demo\\n");',
  "",
);

// A write-slices session that commits and pushes its file itself, as the real
// writing skills do on a branch; the runner must not re-commit a clean tree.
const SELF_COMMIT_STUB = CLAUDE_STUB.replace(
  `  process.exit(0);
}
const git =`,
  `  execFileSync("git", ["add", "spec/features/demo/slices.json"]);
  execFileSync("git", ["commit", "--quiet", "-m", "write-slices committed this itself"]);
  execFileSync("git", ["push", "--quiet", "origin", "HEAD"]);
  process.exit(0);
}
const git =`,
);

const HITL_SLICES = {
  spec: SLICES.spec,
  slices: [
    { id: "S1", title: "Needs sign-off", blocked_by: [], autonomy: "hitl" },
    { id: "S2", title: "Second slice", blocked_by: ["S1"], autonomy: "afk" },
  ],
};

// S1 has a check for a person; it blocks nothing, so S2 still gets built.
const DEFERRED_SLICES = {
  spec: SLICES.spec,
  slices: [
    {
      id: "S1",
      title: "Has a manual check",
      blocked_by: [],
      autonomy: "afk",
      done: { automated: [], manual: ["Looks right"] },
    },
    { id: "S2", title: "Second slice", blocked_by: ["S1"], autonomy: "afk" },
  ],
};

// A hitl slice whose manual item gets confirmed through sign-off.
const HITL_WITH_MANUAL_SLICES = {
  spec: SLICES.spec,
  slices: [
    {
      id: "S1",
      title: "Needs a secret",
      blocked_by: [],
      autonomy: "hitl",
      done: { automated: [], manual: ["Secret works"] },
    },
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

// Stands in for the agents-hq daemon on its real wire: JSON lines over a
// WebSocket that offers the state dir's token as a subprotocol. It logs every
// request with its time, runs a launched session as one stub harness process,
// and then lists the session as exited. A separate process, because the runner
// blocks in spawnSync while the test holds this end.
// FAKE_QUOTA scripts the quota reading on ping: { reading, resetInMs, afterSessions,
// cutsSession }. The reading appears once afterSessions sessions launched, resetting
// resetInMs later, and with cutsSession that session ends before its harness runs.
// FAKE_RUN is the run runStart answers with, such as one holding a member a dead
// kick left unsettled; FAKE_LIVE lists sessions already running. With FAKE_HOLD a
// launched session runs no harness and stays working until sessionKill ends it.
const FAKE_DAEMON = `
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { appendFileSync } = require("node:fs");
const { createServer } = require("node:http");
const [logFile, token, contractVersion, failingTag, exitCode] = process.argv.slice(1);
const quota = process.env.FAKE_QUOTA ? JSON.parse(process.env.FAKE_QUOTA) : undefined;
let reading;
const report = () => {
  reading = { ...quota.reading };
  if (quota.resetInMs !== null) reading.resetsAt = new Date(Date.now() + quota.resetInMs).toISOString();
};
if (quota && !quota.afterSessions) report();
const run = process.env.FAKE_RUN ? JSON.parse(process.env.FAKE_RUN) : { runId: "run-1" };
const hold = process.env.FAKE_HOLD === "1";
// Each session's state: live, exited or killed.
const sessions = new Map((process.env.FAKE_LIVE || "").split(",").filter(Boolean).map((id) => [id, "live"]));
let launched = 0;
const answer = (tag, payload) => {
  if (tag === "ping") return { contractVersion: Number(contractVersion), ...(reading ? { quota: reading } : {}) };
  if (tag === "runStart") return run;
  if (tag === "sessionList") {
    return [...sessions].map(([sessionId, state]) => ({
      sessionId,
      state:
        state === "live"
          ? { _tag: "Running", activity: "working" }
          : { _tag: "Exited", exitCode: state === "killed" ? 143 : Number(exitCode) },
    }));
  }
  if (tag === "sessionKill") {
    sessions.set(payload.sessionId, "killed");
    return null;
  }
  if (tag === "sessionLaunch") {
    const sessionId = "session-" + ++launched;
    sessions.set(sessionId, hold ? "live" : "exited");
    if (hold) return { sessionId };
    const reachesQuota = quota !== undefined && launched === quota.afterSessions;
    if (!(reachesQuota && quota.cutsSession)) {
      try {
        execFileSync("claude", ["-p", payload.prompt], { cwd: payload.location.path, stdio: "ignore" });
      } catch {}
    }
    if (reachesQuota) report();
    return { sessionId };
  }
  return null;
};
const frame = (text) => {
  const body = Buffer.from(text);
  const head = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.alloc(4);
  if (body.length >= 126) {
    head[0] = 0x81;
    head[1] = 126;
    head.writeUInt16BE(body.length, 2);
  }
  return Buffer.concat([head, body]);
};
const server = createServer();
server.on("upgrade", (request, socket) => {
  if (request.headers["sec-websocket-protocol"] !== token) return socket.destroy();
  const accept = createHash("sha1")
    .update(request.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\n" +
      "Sec-WebSocket-Accept: " + accept + "\\r\\nSec-WebSocket-Protocol: " + token + "\\r\\n\\r\\n",
  );
  socket.on("error", () => {});
  let pending = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      if (pending.length < 2) return;
      let length = pending[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (pending.length < 4) return;
        length = pending.readUInt16BE(2);
        offset = 4;
      }
      if (pending.length < offset + 4 + length) return;
      const mask = pending.subarray(offset, offset + 4);
      const body = Buffer.from(pending.subarray(offset + 4, offset + 4 + length));
      const opcode = pending[0] & 0x0f;
      pending = pending.subarray(offset + 4 + length);
      if (opcode === 8) return socket.destroy();
      if (opcode !== 1) continue;
      for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
      const { id, tag, payload } = JSON.parse(body.toString().trim());
      appendFileSync(logFile, JSON.stringify({ tag, payload, at: Date.now() }) + "\\n");
      if (failingTag === "drop:" + tag) return socket.destroy();
      const exit =
        tag === failingTag
          ? { _tag: "Failure", cause: { message: "refused" } }
          : { _tag: "Success", value: answer(tag, payload) };
      socket.write(frame(JSON.stringify({ _tag: "Exit", requestId: String(id), exit }) + "\\n"));
    }
  });
});
server.listen(0, "127.0.0.1", () => console.log(server.address().port));
`;

async function startFakeDaemon(fixture, { contractVersion = 5, failingTag = "", exitCode = 0, quota, env = {} } = {}) {
  const stateDir = path.join(fixture.tmp, "state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(path.join(stateDir, "token"), "test-token\n");
  const daemonLog = path.join(fixture.tmp, "daemon.log");
  writeFileSync(daemonLog, "", { flag: "a" });
  const claudeLog = path.join(fixture.tmp, "claude.log");
  const daemon = spawn(
    process.execPath,
    ["-e", FAKE_DAEMON, daemonLog, "test-token", String(contractVersion), failingTag, String(exitCode)],
    {
      stdio: ["ignore", "pipe", "inherit"],
      env: {
        ...process.env,
        PATH: `${fixture.bin}:${process.env.PATH}`,
        STUB_CLAUDE_LOG: claudeLog,
        STUB_GH_LOG: path.join(fixture.tmp, "gh.log"),
        FAKE_QUOTA: quota === undefined ? "" : JSON.stringify(quota),
        ...env,
      },
    },
  );
  const port = await new Promise((resolve) => daemon.stdout.once("data", (data) => resolve(String(data).trim())));
  return {
    daemonEnv: { AGENTS_HQ_STATE_DIR: stateDir, AGENTS_HQ_PORT: port },
    daemonLog,
    stop: () => daemon.kill(),
  };
}

// One kick against a fake daemon on the given contract, returning what the
// runner sent it in order.
async function runRunnerWithDaemon(fixture, { contractVersion, failingTag, exitCode, env, args, quota } = {}) {
  const { daemonEnv, daemonLog, stop } = await startFakeDaemon(fixture, { contractVersion, failingTag, exitCode, quota, env });
  try {
    const run = runRunner(fixture, { ...daemonEnv, ...env }, args);
    const calls = readFileSync(daemonLog, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return { ...run, calls };
  } finally {
    stop();
  }
}

const callsTo = (calls, tag) => calls.filter((call) => call.tag === tag).map((call) => call.payload);

function makeFixture(claudeStub = CLAUDE_STUB, slices = SLICES, opts = {}) {
  const {
    specFiles = true,
    verifySkill = true,
    decisionsFile = true,
    settingsFile = true,
    origin = true,
    pnpmProject = false,
  } = opts;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "run-feature-"));
  const repo = path.join(tmp, "repo");
  if (origin) {
    const originDir = path.join(tmp, "origin.git");
    execFileSync("git", ["init", "--bare", "--quiet", "-b", "main", originDir]);
    // Cloning an empty origin warns even with --quiet; a failure still throws with its stderr.
    execFileSync("git", ["clone", "--quiet", originDir, repo], { stdio: "pipe" });
  } else {
    execFileSync("git", ["init", "--quiet", "-b", "main", repo]);
  }
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
  if (settingsFile) {
    mkdirSync(path.join(repo, ".claude"), { recursive: true });
    writeFileSync(
      path.join(repo, ".claude", "settings.json"),
      JSON.stringify({ permissions: { allow: ["Bash(pnpm test:*)", "Bash(git push:*)"] } }),
    );
  }
  if (pnpmProject) {
    writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "demo", private: true }));
    writeFileSync(path.join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    writeFileSync(path.join(repo, ".gitignore"), "node_modules\n");
  }
  git(repo, "add", "-A");
  git(repo, "commit", "--quiet", "-m", "spec and slices");
  if (pnpmProject) {
    // Installed after the fixture's own commit, like a project whose hooks
    // only a pnpm install wires up; worktrees share it through the common dir.
    writeFileSync(path.join(repo, ".git", "hooks", "pre-commit"), PRE_COMMIT_HOOK);
    chmodSync(path.join(repo, ".git", "hooks", "pre-commit"), 0o755);
  }
  if (origin) {
    git(repo, "push", "--quiet", "-u", "origin", "main");
    git(repo, "remote", "set-head", "origin", "main");
  }

  const bin = path.join(tmp, "bin");
  mkdirSync(bin);
  writeFileSync(path.join(bin, "claude"), claudeStub);
  writeFileSync(path.join(bin, "gh"), GH_STUB);
  writeFileSync(path.join(bin, "osascript"), OSASCRIPT_STUB);
  writeFileSync(path.join(bin, "pnpm"), PNPM_STUB);
  writeFileSync(path.join(bin, "github-app-token"), MINTER_STUB);
  chmodSync(path.join(bin, "github-app-token"), 0o755);
  chmodSync(path.join(bin, "pnpm"), 0o755);
  chmodSync(path.join(bin, "claude"), 0o755);
  chmodSync(path.join(bin, "gh"), 0o755);
  chmodSync(path.join(bin, "osascript"), 0o755);

  const worktree = path.join(tmp, "repo-slices-demo");
  return { tmp, repo, bin, worktree };
}

// A kick on the host, as every test but the refusal ones takes it.
const ON_HOST = ["demo", "--on-host"];

function runRunner(fixture, env = {}, args = ON_HOST) {
  const claudeLog = path.join(fixture.tmp, "claude.log");
  const ghLog = path.join(fixture.tmp, "gh.log");
  const osaLog = path.join(fixture.tmp, "osascript.log");
  const pnpmLog = path.join(fixture.tmp, "pnpm.log");
  const minterLog = path.join(fixture.tmp, "minter.log");
  writeFileSync(minterLog, "");
  writeFileSync(pnpmLog, "");
  writeFileSync(claudeLog, "");
  writeFileSync(ghLog, "");
  writeFileSync(osaLog, "");
  const runEnv = {
    ...process.env,
    PATH: `${fixture.bin}:${process.env.PATH}`,
    // No token here means no daemon, so a stub session never reaches a real one.
    AGENTS_HQ_STATE_DIR: path.join(fixture.tmp, "no-daemon"),
    // The tests may themselves run inside a daemon session.
    AGENTS_HQ_SESSION_ID: undefined,
    STUB_CLAUDE_LOG: claudeLog,
    STUB_GH_LOG: ghLog,
    STUB_OSA_LOG: osaLog,
    STUB_PNPM_LOG: pnpmLog,
    STUB_MINTER_LOG: minterLog,
    ...env,
  };
  const result = spawnSync("node", [RUNNER, ...args], { cwd: fixture.repo, encoding: "utf8", env: runEnv });
  // The runner never fetches into the repo, so the tests read what landed on origin themselves.
  if (spawnSync("git", ["-C", fixture.repo, "remote", "get-url", "origin"]).status === 0) {
    execFileSync("git", ["-C", fixture.repo, "fetch", "--quiet", "origin"], { env: runEnv });
  }
  return { result, claudeLog, ghLog, osaLog, pnpmLog, minterLog };
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

  it("logs one fresh harness invocation per iteration with the permission system skipped", () => {
    const lines = result.stdout
      .split("\n")
      .filter((line) => /^\[run-feature\] iteration \d+: claude /.test(line));
    assert.equal(lines.length, 3, result.stdout);
    for (const line of lines) {
      assert.match(line, /--dangerously-skip-permissions/);
      assert.match(line, /\/implement-slice spec\/features\/demo\//);
    }
    const invocations = readFileSync(claudeLog, "utf8").split("\n").filter(Boolean);
    assert.equal(invocations.length, 3);
    for (const invocation of invocations) {
      const args = JSON.parse(invocation);
      assert.equal(args[0], "-p");
      assert.equal(args[2], "--dangerously-skip-permissions");
      // Every session carries the headless note, so a skill settles open
      // choices itself instead of ending the turn with a question.
      assert.equal(args[3], "--append-system-prompt");
      assert.ok(
        args[4].includes("Never end the turn asking a question or waiting for input"),
        args[4],
      );
      assert.ok(args[4].includes("stop every Monitor and background command you started"), args[4]);
    }
  });

  it("a project with its own committed Claude settings keeps them untouched", () => {
    const subjects = git(fixture.repo, "log", "--format=%s", "origin/main..origin/slices/demo");
    assert.ok(!subjects.includes("seed the default Claude settings"));
    const settings = JSON.parse(
      git(fixture.repo, "show", "origin/slices/demo:.claude/settings.json"),
    );
    assert.deepEqual(settings.permissions.allow, ["Bash(pnpm test:*)", "Bash(git push:*)"]);
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

  it("a session that stops with uncommitted changes halts for the user without a retry", () => {
    const dirty = IDLE_STUB + `require("node:fs").writeFileSync("draft.md", "half done\\n");\n`;
    const fixture = makeFixture(dirty);
    const { result, claudeLog } = runRunner(fixture);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /slice S1 stopped for you with uncommitted changes/);
    assert.ok(existsSync(path.join(fixture.worktree, "draft.md")), "the draft should be kept");
    assert.equal(readFileSync(claudeLog, "utf8").split("\n").filter(Boolean).length, 1);
  });

  it("a ready hitl slice waits until every ready afk slice has run", () => {
    const fixture = makeFixture(CLAUDE_STUB, {
      spec: SLICES.spec,
      slices: [
        { id: "S1", title: "Needs a person", blocked_by: [], autonomy: "hitl" },
        { id: "S2", title: "Unattended", blocked_by: [], autonomy: "afk" },
      ],
    });
    const { result } = runRunner(fixture);
    assert.equal(result.status, 2, result.stderr);
    const subjects = git(fixture.repo, "log", "--format=%s", "origin/main..origin/slices/demo");
    assert.deepEqual(subjects.split("\n").slice(0, 2), ["Needs a person", "Unattended"]);
    assert.match(result.stderr, /waiting for human sign-off on S1/);
  });

  it("a pending hitl slice with nothing else ready halts naming the waiting slice", () => {
    const fixture = makeFixture(CLAUDE_STUB, HITL_SLICES);
    const { result } = runRunner(fixture);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /waiting for human sign-off on S1/);
    assert.ok(existsSync(fixture.worktree), "worktree should be kept");
  });
});

describe("run.mjs defers manual checks to the ready PR", () => {
  it("an afk slice with manual checks does not halt: dependents run and the PR goes ready", () => {
    const fixture = makeFixture(CLAUDE_STUB, DEFERRED_SLICES);
    const { result, ghLog } = runRunner(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(landedTrailers(fixture.repo), ["S1", "S2"]);
    assert.equal(
      git(fixture.repo, "log", "-1", "--format=%(trailers:key=Manual-Checks,valueonly)", "origin/slices/demo"),
      "1",
    );
    assert.match(readFileSync(ghLog, "utf8"), /pr ready/);
    assert.ok(!existsSync(fixture.worktree), "worktree should be removed");
  });

  it("a close that writes no checklist halts as close incomplete and keeps the worktree", () => {
    const fixture = makeFixture(CLOSE_SKIPS_CHECKS_STUB, DEFERRED_SLICES);
    const { result } = runRunner(fixture);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /no commit with a Manual-Checks trailer/);
    assert.ok(existsSync(fixture.worktree), "worktree should be kept");
  });

  it("a close that leaves the PR in draft halts for any feature, with or without checks", () => {
    const fixture = makeFixture(CLOSE_STAYS_DRAFT_STUB);
    const { result } = runRunner(fixture);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /the PR is still a draft/);
    assert.ok(existsSync(fixture.worktree), "worktree should be kept");
  });

  it("a PR gh cannot read halts as pr refused rather than claiming success", () => {
    const fixture = makeFixture();
    writeFileSync(path.join(fixture.bin, "gh"), "#!/usr/bin/env node\nconsole.error('HTTP 502');\nprocess.exit(1);\n");
    const { result, osaLog } = runRunner(fixture);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /halt: gh refused reading the PR for slices\/demo: HTTP 502/);
    assert.deepEqual(bannerPayloads(osaLog), ["pr refused"]);
    assert.ok(existsSync(fixture.worktree), "worktree should be kept");
  });

  it("with no origin, the trailer check runs alone and gh is never asked", () => {
    const fixture = makeFixture(LOCAL_ONLY_STUB, DEFERRED_SLICES, { origin: false });
    const { result, ghLog } = runRunner(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(ghLog, "utf8"), "");
  });

  it("a signed-off hitl slice's manual items need no checklist", () => {
    const fixture = makeFixture(CLAUDE_STUB, HITL_WITH_MANUAL_SLICES);
    const first = runRunner(fixture);
    assert.equal(first.result.status, 2, first.result.stderr);
    assert.match(first.result.stderr, /waiting for human sign-off on S1/);
    git(fixture.worktree, "commit", "--allow-empty", "-m", "Sign off S1\n\nConfirmed.\n\nSlice: S1");
    git(fixture.worktree, "push", "--quiet", "origin", "HEAD");
    const second = runRunner(fixture);
    assert.equal(second.result.status, 0, second.result.stderr);
  });
});

describe("run.mjs parks a known failure for a person", () => {
  it("a close that commits a known failure ends the run waiting, naming it, though the PR is a draft", async () => {
    const fixture = makeFixture(KNOWN_FAILURE_STUB);
    const { result, calls } = await runRunnerWithDaemon(fixture);
    assert.equal(result.status, 2, result.stderr);
    const [end] = callsTo(calls, "runEnd");
    assert.equal(end.outcome, "waiting");
    assert.match(end.detail, /Q2 as a known failure/);
    assert.equal(callsTo(calls, "runSettle").at(-1).outcome, "completed");
    assert.ok(existsSync(fixture.worktree), "worktree should be kept");
  });

  it("a known failure still halts as close incomplete when the close wrote no checklist", () => {
    const stub = KNOWN_FAILURE_STUB.replace(
      'git("commit", "--allow-empty", "-m", "Manual checks',
      'if (false) git("commit", "--allow-empty", "-m", "Manual checks',
    );
    const { result } = runRunner(makeFixture(stub, DEFERRED_SLICES));
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /no commit with a Manual-Checks trailer/);
  });

  it("a body line reading Address review does not count as the close", () => {
    const stub = closeCommitting("Note\n\nAddress review\n\nKnown-Failure: Q2", true);
    const { result } = runRunner(makeFixture(stub));
    assert.equal(result.status, 0, result.stderr);
  });

  it("a re-kick whose close fixes it completes, as only the newest Address review counts", () => {
    const fixture = makeFixture(KNOWN_FAILURE_STUB);
    assert.equal(runRunner(fixture).result.status, 2);
    writeFileSync(path.join(fixture.bin, "claude"), KNOWN_FAILURE_FIXED_STUB);
    const { result } = runRunner(fixture);
    assert.equal(result.status, 0, result.stderr);
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

  it("a pre-step session that commits its file itself is not re-committed by the runner", () => {
    const self = makeFixture(SELF_COMMIT_STUB, SLICES, { specFiles: false });
    const run = runRunner(self);
    assert.equal(run.result.status, 0, run.result.stderr);
    const subjects = git(self.repo, "log", "--format=%s", "origin/main..origin/slices/demo");
    assert.match(subjects, /write-slices committed this itself/);
    assert.ok(!subjects.includes("spec: write demo slices.json headlessly"), subjects);
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

  it("a project without committed Claude settings gets the default allowlist seeded and committed", () => {
    const bare = makeFixture(CLAUDE_STUB, SLICES, { settingsFile: false });
    const run = runRunner(bare);
    assert.equal(run.result.status, 0, run.result.stderr);
    // The seed commit is the oldest commit on the branch, so every session
    // already saw the settings.
    const subjects = git(bare.repo, "log", "--format=%s", "origin/main..origin/slices/demo").split(
      "\n",
    );
    assert.equal(subjects.at(-1), "chore: seed the default Claude settings allowlist");
    const settings = JSON.parse(git(bare.repo, "show", "origin/slices/demo:.claude/settings.json"));
    assert.ok(settings.permissions.allow.includes("Bash(git:*)"));
    assert.ok(settings.permissions.allow.includes("Bash(pnpm:*)"));
    assert.ok(settings.permissions.allow.every((entry) => entry.startsWith("Bash(")));
  });

  it("an origin-less repo still gets the seed committed, without a push", () => {
    const local = makeFixture(IDLE_STUB, SLICES, { settingsFile: false, origin: false });
    const run = runRunner(local);
    // The idle sessions halt the run, but the seed commit already landed on
    // the local slices branch.
    assert.equal(run.result.status, 2, run.result.stderr);
    const subjects = git(local.worktree, "log", "--format=%s", "main..HEAD").split("\n");
    assert.equal(subjects.at(-1), "chore: seed the default Claude settings allowlist");
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

  it("the slices branch checked out in the main checkout refuses the kick readably", () => {
    const fixture = makeFixture();
    git(fixture.repo, "switch", "--quiet", "-c", "slices/demo");
    const { result } = runRunner(fixture);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /slices\/demo is already checked out at .*; switch that checkout/);
    assert.ok(!existsSync(fixture.worktree), "no worktree may be created");
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
      '  markReady();',
      `  require("node:fs").writeFileSync("leftover.txt", "dirt");
  markReady();`,
    );
    const cases = [
      ["complete", makeFixture()],
      ["no progress", makeFixture(IDLE_STUB)],
      ["awaiting sign-off", makeFixture(CLAUDE_STUB, HITL_SLICES)],
      ["close incomplete", makeFixture(CLOSE_STAYS_DRAFT_STUB)],
      ["known failure", makeFixture(KNOWN_FAILURE_STUB)],
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

describe("run.mjs puts the kick on the agents-hq Runs page", () => {
  it("runs each session through the daemon as a named member of one run", async () => {
    const fixture = makeFixture();
    const { result, calls, claudeLog } = await runRunnerWithDaemon(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(callsTo(calls, "runStart").length, 1);
    assert.deepEqual(
      callsTo(calls, "runAttach").map(({ name, task }) => [name, task]),
      [
        ["S1", "First slice"],
        ["S2", "Second slice"],
        ["Close the branch", "Close the branch and mark the PR ready"],
      ],
    );
    assert.deepEqual(
      callsTo(calls, "runSettle").map(({ outcome }) => outcome),
      ["completed", "completed", "completed"],
    );
    assert.deepEqual(landedTrailers(fixture.repo), ["S1", "S2"]);
    assert.equal(readFileSync(claudeLog, "utf8").split("\n").filter(Boolean).length, 3);
  });

  it("launches with full access and the headless note, and ends the run completed", async () => {
    const { calls } = await runRunnerWithDaemon(makeFixture());
    const [launch] = callsTo(calls, "sessionLaunch");
    assert.equal(launch.permissionMode, "full-access");
    assert.match(launch.appendSystemPrompt, /no human can answer/);
    assert.deepEqual(callsTo(calls, "runEnd"), [{ runId: "run-1", outcome: "completed" }]);
  });

  it("nests a retry under the attempt it follows, with the failed attempt settled", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(IDLE_STUB));
    assert.equal(result.status, 2);
    const [first, retry] = callsTo(calls, "runAttach");
    assert.equal(first.name, "S1");
    assert.equal(retry.name, "S1 retry");
    assert.equal(retry.parentSessionId, first.sessionId);
    assert.deepEqual(
      callsTo(calls, "runSettle").map(({ outcome }) => outcome),
      ["failed", "failed"],
    );
  });

  it("keeps watching a launched session when the run refuses to attach it", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(), { failingTag: "runAttach" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /runAttach failed/);
    assert.equal(callsTo(calls, "sessionLaunch").length, 3);
    assert.equal(callsTo(calls, "sessionList").length, 3);
  });

  it("settles the close failed, with the reason, when it did not finish", async () => {
    const { calls } = await runRunnerWithDaemon(makeFixture(CLOSE_STAYS_DRAFT_STUB));
    const close = callsTo(calls, "runSettle").at(-1);
    assert.equal(close.outcome, "failed");
    assert.match(close.detail, /still a draft/);
  });

  it("falls back outside agents-hq, and says so, when no daemon can take the session", () => {
    const fixture = makeFixture();
    const { result } = runRunner(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /running outside agents-hq/);
  });
});

describe("run.mjs reports the plan and the halts to the run progress card", () => {
  const stateOf = (steps) => steps.map((step) => `${step.id} ${step.state}`).join(", ");
  const planOf = (calls) => callsTo(calls, "runSteps").map(({ steps }) => stateOf(steps));

  it("starts the run under a key of repo and slug, named with the slug", async () => {
    const fixture = makeFixture();
    const { calls } = await runRunnerWithDaemon(fixture);
    const [start] = callsTo(calls, "runStart");
    assert.equal(start.name, "demo");
    assert.equal(start.key, `${realpathSync(fixture.repo)}:demo`);
  });

  it("names the session it was kicked from as the run's launcher", async () => {
    const { calls } = await runRunnerWithDaemon(makeFixture(), {
      env: { AGENTS_HQ_SESSION_ID: "launcher-1" },
    });
    const [start] = callsTo(calls, "runStart");
    assert.equal(start.launcherSessionId, "launcher-1");
  });

  it("names no launcher when kicked from outside any session", async () => {
    const { calls } = await runRunnerWithDaemon(makeFixture());
    const [start] = callsTo(calls, "runStart");
    assert.equal("launcherSessionId" in start, false);
  });

  it("sends the same key on a re-kick, so it reopens the run", async () => {
    const fixture = makeFixture(CLAUDE_STUB, HITL_SLICES);
    await runRunnerWithDaemon(fixture);
    const { calls } = await runRunnerWithDaemon(fixture);
    const keys = callsTo(calls, "runStart").map(({ key }) => key);
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
  });

  it("sends the whole plan with titles on every state change, before any session", async () => {
    const { calls } = await runRunnerWithDaemon(makeFixture());
    assert.deepEqual(planOf(calls), [
      "S1 pending, S2 pending",
      "S1 running, S2 pending",
      "S1 done, S2 pending",
      "S1 done, S2 running",
      "S1 done, S2 done",
    ]);
    const [first] = callsTo(calls, "runSteps");
    assert.deepEqual(first.steps.map(({ title }) => title), ["First slice", "Second slice"]);
    assert.equal(first.runId, "run-1");
    assert.ok(
      calls.findIndex(({ tag }) => tag === "runSteps") < calls.findIndex(({ tag }) => tag === "sessionLaunch"),
    );
  });

  it("sends the plan a pre-step wrote, once it exists", async () => {
    const { calls } = await runRunnerWithDaemon(makeFixture(CLAUDE_STUB, SLICES, { specFiles: false }));
    const firstSteps = calls.findIndex(({ tag }) => tag === "runSteps");
    assert.deepEqual(
      calls.slice(0, firstSteps).filter(({ tag }) => tag === "runAttach").map(({ payload }) => payload.name),
      ["write-spec", "write-slices"],
    );
  });

  it("links each slice session to its slice, and no other session to any", async () => {
    const { calls } = await runRunnerWithDaemon(makeFixture(CLAUDE_STUB, SLICES, { specFiles: false }));
    assert.deepEqual(
      callsTo(calls, "runAttach").map(({ name, stepId }) => [name, stepId]),
      [
        ["write-spec", undefined],
        ["write-slices", undefined],
        ["S1", "S1"],
        ["S2", "S2"],
        ["Close the branch", undefined],
      ],
    );
  });

  it("keeps a retry on its slice, running until it fails for good", async () => {
    const { calls } = await runRunnerWithDaemon(makeFixture(IDLE_STUB));
    assert.deepEqual(
      callsTo(calls, "runAttach").map(({ name, stepId }) => [name, stepId]),
      [
        ["S1", "S1"],
        ["S1 retry", "S1"],
      ],
    );
    assert.deepEqual(planOf(calls), [
      "S1 pending, S2 pending",
      "S1 running, S2 pending",
      "S1 failed, S2 pending",
    ]);
  });

  it("a sign-off halt ends the run waiting, with the slice's step waiting too", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(CLAUDE_STUB, HITL_SLICES));
    assert.equal(result.status, 2);
    const [end] = callsTo(calls, "runEnd");
    assert.equal(end.outcome, "waiting");
    assert.match(end.detail, /sign-off on S1/);
    assert.equal(planOf(calls).at(-1), "S1 waiting, S2 pending");
  });

  it("the session ceiling ends the run stopped with re-kick to continue", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(CLAUDE_STUB, MANY_SLICES));
    assert.equal(result.status, 2);
    assert.deepEqual(callsTo(calls, "runEnd"), [
      { runId: "run-1", outcome: "stopped", detail: "re-kick to continue" },
    ]);
  });

  it("a slice failing twice ends the run failed with the reason", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(IDLE_STUB));
    assert.equal(result.status, 2);
    assert.deepEqual(callsTo(calls, "runEnd"), [
      { runId: "run-1", outcome: "failed", detail: "no progress: slice S1 failed twice in a row" },
    ]);
  });

  it("a session ended in agents-hq halts the kick instead of retrying it", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(IDLE_STUB), { exitCode: 143 });
    assert.equal(result.status, 2);
    assert.equal(callsTo(calls, "sessionLaunch").length, 1);
    assert.deepEqual(callsTo(calls, "runSettle").map(({ outcome }) => outcome), ["stopped"]);
    const [end] = callsTo(calls, "runEnd");
    assert.equal(end.outcome, "stopped");
    assert.match(end.detail, /session-1 was ended in agents-hq/);
    assert.equal(planOf(calls).at(-1), "S1 pending, S2 pending");
  });

  it("a session that ends on its own without progress still gets its retry", async () => {
    const { calls } = await runRunnerWithDaemon(makeFixture(IDLE_STUB), { exitCode: 1 });
    assert.equal(callsTo(calls, "sessionLaunch").length, 2);
  });

  it("a watcher that loses a session halts rather than start a second one beside it", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(IDLE_STUB), { failingTag: "sessionList" });
    assert.equal(result.status, 2);
    assert.equal(callsTo(calls, "sessionLaunch").length, 1);
    const [end] = callsTo(calls, "runEnd");
    assert.equal(end.outcome, "stopped");
    assert.match(end.detail, /lost session-1/);
    assert.equal(planOf(calls).at(-1), "S1 pending, S2 pending");
  });

  it("a connection that drops mid-watch counts as losing the session, not finishing it", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(IDLE_STUB), { failingTag: "drop:sessionRename" });
    assert.equal(result.status, 2);
    assert.equal(callsTo(calls, "sessionLaunch").length, 1);
    assert.match(callsTo(calls, "runEnd")[0].detail, /lost session-1/);
  });

  it("nothing ready ends the run stopped with the reason", async () => {
    const stuck = {
      spec: SLICES.spec,
      slices: [{ id: "S1", title: "Blocked for good", blocked_by: ["S9"], autonomy: "afk" }],
    };
    const { result, calls } = await runRunnerWithDaemon(makeFixture(CLAUDE_STUB, stuck));
    assert.equal(result.status, 2);
    const [end] = callsTo(calls, "runEnd");
    assert.equal(end.outcome, "stopped");
    assert.match(end.detail, /nothing is ready/);
  });

  it("a close that did not finish ends the run stopped with the reason", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(CLOSE_STAYS_DRAFT_STUB));
    assert.equal(result.status, 2);
    const [end] = callsTo(calls, "runEnd");
    assert.equal(end.outcome, "stopped");
    assert.match(end.detail, /still a draft/);
  });

  it("a bad-input exit ends the run failed with the reason", async () => {
    const fixture = makeFixture(CLAUDE_STUB, SLICES, { specFiles: false, decisionsFile: false });
    const { result, calls } = await runRunnerWithDaemon(fixture);
    assert.equal(result.status, 1);
    const [end] = callsTo(calls, "runEnd");
    assert.equal(end.outcome, "failed");
    assert.match(end.detail, /decisions\.md is missing/);
  });

  it("an environment exit ends the run failed", async () => {
    const fixture = makeFixture();
    writeFileSync(path.join(fixture.bin, "claude"), "#!/bin/sh\nrm -f .git\n");
    const { result, calls } = await runRunnerWithDaemon(fixture);
    assert.notEqual(result.status, 0);
    assert.equal(callsTo(calls, "runEnd")[0].outcome, "failed");
  });

  it("a halt before the first session still ends the run with its reason", async () => {
    const fixture = makeFixture(CLAUDE_STUB, SLICES, { verifySkill: false });
    const { result, calls } = await runRunnerWithDaemon(fixture);
    assert.equal(result.status, 2);
    const [end] = callsTo(calls, "runEnd");
    assert.equal(end.outcome, "stopped");
    assert.match(end.detail, /no verify skill/);
  });

  it("a signal mid-session stops the kick and ends the run stopped", async () => {
    const fixture = makeFixture();
    writeFileSync(path.join(fixture.bin, "claude"), "#!/bin/sh\nsleep 1\n");
    const { daemonEnv, daemonLog, stop } = await startFakeDaemon(fixture);
    try {
      const runner = spawn("node", [RUNNER, ...ON_HOST], {
        cwd: fixture.repo,
        stdio: "ignore",
        env: {
          ...process.env,
          ...daemonEnv,
          AGENTS_HQ_SESSION_ID: undefined,
          PATH: `${fixture.bin}:${process.env.PATH}`,
          STUB_GH_LOG: path.join(fixture.tmp, "gh.log"),
          STUB_MINTER_LOG: path.join(fixture.tmp, "minter.log"),
        },
      });
      let ended = false;
      const exited = new Promise((resolve) => runner.once("exit", resolve)).finally(() => (ended = true));
      while (!readFileSync(daemonLog, "utf8").includes("sessionLaunch")) {
        assert.ok(!ended, "the runner exited before launching a session");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      runner.kill("SIGTERM");
      assert.equal(await exited, 2);
      const end = readFileSync(daemonLog, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .find(({ tag }) => tag === "runEnd");
      assert.deepEqual(end.payload, { runId: "run-1", outcome: "stopped", detail: "The run received SIGTERM." });
    } finally {
      stop();
    }
  });

  it("a signal mid-session ends that session and settles its slice stopped", async () => {
    const fixture = makeFixture();
    const { daemonEnv, daemonLog, stop } = await startFakeDaemon(fixture, { env: { FAKE_HOLD: "1" } });
    const calls = () =>
      readFileSync(daemonLog, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    try {
      const runner = spawn("node", [RUNNER, ...ON_HOST], {
        cwd: fixture.repo,
        stdio: "ignore",
        env: {
          ...process.env,
          ...daemonEnv,
          AGENTS_HQ_SESSION_ID: undefined,
          PATH: `${fixture.bin}:${process.env.PATH}`,
          STUB_GH_LOG: path.join(fixture.tmp, "gh.log"),
          STUB_MINTER_LOG: path.join(fixture.tmp, "minter.log"),
        },
      });
      let ended = false;
      const exited = new Promise((resolve) => runner.once("exit", resolve)).finally(() => (ended = true));
      // The member is attached once the session id is written, so the kick knows it.
      while (!calls().some(({ tag }) => tag === "runAttach")) {
        assert.ok(!ended, "the runner exited before attaching a session");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      runner.kill("SIGTERM");
      assert.equal(await exited, 2);
      const log = calls();
      assert.deepEqual(callsTo(log, "sessionKill"), [{ sessionId: "session-1" }]);
      assert.deepEqual(callsTo(log, "runSettle"), [
        { runId: "run-1", sessionId: "session-1", outcome: "stopped", detail: "The run received SIGTERM." },
      ]);
      const tags = log.map(({ tag }) => tag);
      assert.ok(tags.lastIndexOf("runSettle") < tags.lastIndexOf("runEnd"), "the member settles before the run ends");
      const steps = callsTo(log, "runSteps").at(-1).steps;
      assert.ok(steps.every(({ state }) => state !== "running"), "no step reads as running after the kick");
    } finally {
      stop();
    }
  });

  it("a re-kick ends and settles stopped a member a dead kick left unsettled", async () => {
    const run = {
      runId: "run-1",
      members: [
        { sessionId: "old-done", name: "S4", task: "Slice 4", stepId: "S4", outcome: "completed" },
        { sessionId: "old-live", name: "S5", task: "Slice 5", stepId: "S5" },
        { sessionId: "old-gone", name: "S6", task: "Slice 6", stepId: "S6" },
      ],
    };
    const { result, calls } = await runRunnerWithDaemon(makeFixture(), {
      env: { FAKE_RUN: JSON.stringify(run), FAKE_LIVE: "old-done,old-live" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(callsTo(calls, "sessionKill"), [{ sessionId: "old-live" }]);
    const detail = "The kick running it died before it settled; the next kick stopped it.";
    const orphans = callsTo(calls, "runSettle").filter(({ sessionId }) => sessionId.startsWith("old-"));
    assert.deepEqual(orphans, [
      { runId: "run-1", sessionId: "old-live", outcome: "stopped", detail },
      { runId: "run-1", sessionId: "old-gone", outcome: "stopped", detail },
    ]);
    const lastOrphan = calls.findLastIndex(({ tag, payload }) => tag === "runSettle" && payload.sessionId.startsWith("old-"));
    assert.ok(
      lastOrphan < calls.findIndex(({ tag }) => tag === "sessionLaunch"),
      "orphans settle before the first new session",
    );
  });

  it("a clean finish ends the run completed with no leftover reason", async () => {
    const { calls } = await runRunnerWithDaemon(makeFixture());
    assert.deepEqual(callsTo(calls, "runEnd"), [{ runId: "run-1", outcome: "completed" }]);
  });

  it("a daemon on an older contract leaves the kick outside agents-hq, and says why", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(), { contractVersion: 4 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /contract 4/);
    assert.deepEqual(callsTo(calls, "runStart"), []);
    assert.match(result.stdout, /running outside agents-hq/);
  });
});

describe("run.mjs refuses to start sessions outside a container without --on-host", () => {
  const sessionsIn = (claudeLog) => readFileSync(claudeLog, "utf8").split("\n").filter(Boolean).length;

  it("through the daemon, a kick without --on-host refuses before any session or run", async () => {
    const fixture = makeFixture();
    const { result, calls, claudeLog, osaLog } = await runRunnerWithDaemon(fixture, { args: ["demo"] });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refusing to start sessions outside a container.*pass --on-host/);
    assert.deepEqual(calls, []);
    assert.equal(sessionsIn(claudeLog), 0);
    assert.equal(existsSync(fixture.worktree), false);
    assert.deepEqual(bannerPayloads(osaLog), []);
  });

  it("through the daemon, a kick with --on-host runs and its report carries the flag", async () => {
    const fixture = makeFixture();
    const { result, calls } = await runRunnerWithDaemon(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.split("\n")[0], /^\[run-feature\] on host: --on-host given/);
    assert.equal(callsTo(calls, "sessionLaunch").length, 3);
  });

  it("with no daemon, the claude -p fallback is refused the same way without --on-host", () => {
    const fixture = makeFixture();
    const { result, claudeLog } = runRunner(fixture, {}, ["demo"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refusing to start sessions outside a container.*pass --on-host/);
    assert.equal(sessionsIn(claudeLog), 0);
    assert.equal(existsSync(fixture.worktree), false);
  });

  it("with no daemon and --on-host, the fallback runs and its report carries the flag", () => {
    const fixture = makeFixture();
    const { result, claudeLog } = runRunner(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.split("\n")[0], /^\[run-feature\] on host: --on-host given/);
    assert.match(result.stdout, /running outside agents-hq/);
    assert.equal(sessionsIn(claudeLog), 3);
  });
});

describe("run.mjs brakes the agent account at 95% of the week and waits out limits", () => {
  const AGENT = [...ON_HOST, "--agent-account"];
  const weekAt = (utilization) => ({ window: "seven_day", status: "allowed_warning", utilization });
  const RESET_MS = 1500;
  const waits = (calls) => callsTo(calls, "runEnd").filter(({ outcome }) => outcome === "waiting");
  const launchTimes = (calls) => calls.filter(({ tag }) => tag === "sessionLaunch").map(({ at }) => at);
  const resetOf = (wait) => Date.parse(wait.detail.match(/reset at (\S+)\.$/)[1]);

  it("at 95% of the week starts no session until the week resets, then finishes", async () => {
    const fixture = makeFixture();
    const { result, calls, osaLog } = await runRunnerWithDaemon(fixture, {
      args: AGENT,
      quota: { reading: weekAt(0.95), resetInMs: RESET_MS },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.split("\n")[1], /^\[run-feature\] agent account: --agent-account given/);
    const [wait] = waits(calls);
    assert.match(wait.detail, /^Waiting for the agent account's 95% weekly reserve to reset at /);
    assert.ok(launchTimes(calls).every((at) => at >= resetOf(wait)));
    assert.equal(launchTimes(calls).length, 3);
    const keys = callsTo(calls, "runStart").map(({ key }) => key);
    assert.deepEqual(keys, [keys[0], keys[0]]);
    assert.equal(callsTo(calls, "runEnd").at(-1).outcome, "completed");
    assert.deepEqual(bannerPayloads(osaLog), ["waiting for quota", "complete"]);
  });

  it("a session that crosses 95% finishes, and the next one waits for the reset", async () => {
    const fixture = makeFixture();
    const { result, calls } = await runRunnerWithDaemon(fixture, {
      args: AGENT,
      quota: { reading: weekAt(0.96), resetInMs: RESET_MS, afterSessions: 1 },
    });
    assert.equal(result.status, 0, result.stderr);
    const [first, ...rest] = launchTimes(calls);
    const [wait] = waits(calls);
    assert.ok(first < resetOf(wait));
    assert.ok(rest.length === 2 && rest.every((at) => at >= resetOf(wait)));
    assert.deepEqual(landedTrailers(fixture.repo), ["S1", "S2"]);
  });

  it("shows no step running while it waits, and the plan again once it resumes", async () => {
    const fixture = makeFixture();
    const { calls } = await runRunnerWithDaemon(fixture, {
      args: AGENT,
      quota: { reading: weekAt(0.96), resetInMs: RESET_MS, afterSessions: 1 },
    });
    const plans = callsTo(calls, "runSteps").map(({ steps }) => steps.map(({ id, state }) => `${id} ${state}`).join(", "));
    assert.deepEqual(plans.slice(0, 5), [
      "S1 pending, S2 pending",
      "S1 running, S2 pending",
      "S1 done, S2 pending",
      "S1 done, S2 running",
      "S1 done, S2 pending",
    ]);
    assert.equal(plans[5], "S1 done, S2 running");
  });

  it("below 95% the agent account runs straight through", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(), {
      args: AGENT,
      quota: { reading: weekAt(0.94), resetInMs: 60_000 },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(waits(calls), []);
  });

  it("a reading whose reset has passed is stale and holds nothing back", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(), {
      args: AGENT,
      quota: { reading: weekAt(0.99), resetInMs: -1000 },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(waits(calls), []);
  });

  it("without --agent-account a reading at 95% brakes nothing", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(), {
      quota: { reading: weekAt(0.97), resetInMs: 60_000 },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(waits(calls), []);
    assert.doesNotMatch(result.stdout, /agent account/);
  });

  it("a usage limit that cuts a session short is waited out without counting a failed attempt", async () => {
    const fixture = makeFixture();
    const { result, calls } = await runRunnerWithDaemon(fixture, {
      args: AGENT,
      quota: { reading: { window: "five_hour", status: "rejected" }, resetInMs: RESET_MS, afterSessions: 1, cutsSession: true },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(callsTo(calls, "runAttach").map(({ name }) => name), ["S1", "S1", "S2", "Close the branch"]);
    const [cut] = callsTo(calls, "runSettle");
    assert.deepEqual(cut, { runId: "run-1", sessionId: "session-1", outcome: "stopped", detail: "Cut short by the five_hour limit." });
    const [wait] = waits(calls);
    assert.match(wait.detail, /^Waiting for the five_hour limit to reset at /);
    assert.ok(launchTimes(calls).slice(1).every((at) => at >= resetOf(wait)));
  });

  it("a session that fails at the reserve still counts as a failed attempt", async () => {
    const { result, calls } = await runRunnerWithDaemon(makeFixture(), {
      args: AGENT,
      quota: { reading: weekAt(0.96), resetInMs: RESET_MS, afterSessions: 1, cutsSession: true },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(callsTo(calls, "runAttach").map(({ name }) => name), ["S1", "S1 retry", "S2", "Close the branch"]);
    assert.equal(callsTo(calls, "runSettle")[0].outcome, "failed");
  });

  it("a limit with no reset time halts waiting rather than guess, before any session", async () => {
    const fixture = makeFixture();
    const { result, calls } = await runRunnerWithDaemon(fixture, {
      args: AGENT,
      quota: { reading: { window: "seven_day", status: "rejected" }, resetInMs: null },
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /the seven_day limit was reached with no reset time; re-kick once it resets/);
    assert.deepEqual(callsTo(calls, "sessionLaunch"), []);
    assert.equal(callsTo(calls, "runEnd").at(-1).outcome, "waiting");
  });
});

describe("run.mjs installs the worktree's dependencies before any session", () => {
  it("a pnpm project gets one frozen install, so a hook needing node_modules lets the pre-steps commit", () => {
    const fixture = makeFixture(CLAUDE_STUB, SLICES, { specFiles: false, pnpmProject: true });
    const { result, pnpmLog } = runRunner(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(pnpmLog, "utf8").split("\n").filter(Boolean), [
      JSON.stringify(["install", "--frozen-lockfile"]),
    ]);
    assert.deepEqual(landedTrailers(fixture.repo), ["S1", "S2"]);
  });

  it("a project without a lockfile is never installed", () => {
    const fixture = makeFixture();
    const { result, pnpmLog } = runRunner(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(pnpmLog, "utf8"), "");
  });

  it("a failed install halts as install failed, keeps the worktree, and starts no session", () => {
    const fixture = makeFixture(CLAUDE_STUB, SLICES, { specFiles: false, pnpmProject: true });
    const { result, claudeLog, osaLog } = runRunner(fixture, { STUB_PNPM_FAIL: "1" });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /halt: pnpm install --frozen-lockfile failed for pnpm-lock\.yaml/);
    assert.deepEqual(bannerPayloads(osaLog), ["install failed"]);
    assert.equal(readFileSync(claudeLog, "utf8"), "");
    assert.ok(existsSync(fixture.worktree), "worktree should be kept");
  });

  it("a hook refusing a pre-step commit halts readably with the hook's reason, not a stack trace", () => {
    const fixture = makeFixture(CLAUDE_STUB, SLICES, { specFiles: false, pnpmProject: true });
    // node_modules exists but install is skipped: the hook still refuses.
    writeFileSync(
      path.join(fixture.repo, ".git", "hooks", "pre-commit"),
      '#!/bin/sh\necho "pre-commit: lint failed" >&2\nexit 1\n',
    );
    const { result, osaLog } = runRunner(fixture);
    assert.equal(result.status, 2, result.stderr);
    assert.match(
      result.stderr,
      /halt: git refused committing spec\/features\/demo\/spec\.md: pre-commit: lint failed; fix it in the worktree, then re-kick/,
    );
    assert.doesNotMatch(result.stderr, /at .*run\.mjs:\d+/);
    assert.deepEqual(bannerPayloads(osaLog), ["commit refused"]);
    assert.ok(existsSync(fixture.worktree), "worktree should be kept");
  });

  it("a kept worktree missing node_modules is installed on resume", () => {
    const fixture = makeFixture(CLAUDE_STUB, SLICES, { specFiles: false, pnpmProject: true });
    const first = runRunner(fixture, { STUB_PNPM_FAIL: "1" });
    assert.equal(first.result.status, 2, first.result.stderr);
    const second = runRunner(fixture);
    assert.equal(second.result.status, 0, second.result.stderr);
    assert.match(second.result.stdout, /resuming in existing worktree/);
    assert.equal(readFileSync(second.pnpmLog, "utf8").split("\n").filter(Boolean).length, 1);
  });
});

// Stands in for github.com over git's smart HTTP: git http-backend serves the
// repositories under its root, and a push gets through only with the App
// token, as a GitHub App installation's would. A separate process, because
// the runner blocks in spawnSync while the test holds this end.
const FAKE_GITHUB = `
const { spawn } = require("node:child_process");
const { appendFileSync } = require("node:fs");
const { createServer } = require("node:http");
const [root, logFile, token] = process.argv.slice(1);
const expected = "Basic " + Buffer.from("x-access-token:" + token).toString("base64");
const server = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  const pushing =
    url.pathname.endsWith("/git-receive-pack") || url.searchParams.get("service") === "git-receive-pack";
  const authorized = request.headers.authorization === expected;
  appendFileSync(logFile, JSON.stringify({ path: url.pathname, pushing, authorized }) + "\\n");
  if (pushing && !authorized) {
    response.writeHead(401, { "WWW-Authenticate": 'Basic realm="fake-github"' });
    return response.end();
  }
  const env = {
    ...process.env,
    GIT_PROJECT_ROOT: root,
    GIT_HTTP_EXPORT_ALL: "1",
    REQUEST_METHOD: request.method,
    PATH_INFO: url.pathname,
    QUERY_STRING: url.search.slice(1),
    CONTENT_TYPE: request.headers["content-type"] ?? "",
    HTTP_CONTENT_ENCODING: request.headers["content-encoding"] ?? "",
    GIT_PROTOCOL: request.headers["git-protocol"] ?? "",
    REMOTE_ADDR: "127.0.0.1",
  };
  if (authorized) env.REMOTE_USER = "x-access-token";
  const backend = spawn("git", ["http-backend"], { env });
  request.pipe(backend.stdin);
  const chunks = [];
  backend.stdout.on("data", (chunk) => chunks.push(chunk));
  backend.on("close", () => {
    const out = Buffer.concat(chunks);
    const end = out.indexOf("\\r\\n\\r\\n");
    let status = 200;
    const headers = {};
    for (const line of out.subarray(0, end).toString().split("\\r\\n")) {
      const colon = line.indexOf(":");
      const [key, value] = [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
      if (key.toLowerCase() === "status") status = parseInt(value, 10);
      else headers[key] = value;
    }
    response.writeHead(status, headers);
    response.end(out.subarray(end + 4));
  });
});
server.listen(0, "127.0.0.1", () => console.log(server.address().port));
`;

// Serves the fixture's origin as https://github.com/Dan86de/demo.git would be,
// returning its URL and the log of every request with whether it carried the token.
async function startFakeGithub(fixture) {
  const root = path.join(fixture.tmp, "github");
  mkdirSync(path.join(root, "Dan86de"), { recursive: true });
  symlinkSync(path.join(fixture.tmp, "origin.git"), path.join(root, "Dan86de", "demo.git"));
  const log = path.join(fixture.tmp, "github.log");
  writeFileSync(log, "");
  const server = spawn(process.execPath, ["-e", FAKE_GITHUB, root, log, "stub-app-token"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const port = await new Promise((resolve) => server.stdout.once("data", (data) => resolve(String(data).trim())));
  const requests = () =>
    readFileSync(log, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  return { base: `http://127.0.0.1:${port}/`, requests, stop: () => server.kill() };
}

// A session inside a run's container: it commits, and has no credential to push with.
const CONTAINER_STUB = CLAUDE_STUB.replaceAll('git("push", "--quiet", "origin", "HEAD");', "");

// The last slice's session also plants what would run on the host if host git
// ever ran in its tree: hooks, an fsmonitor and a filter, each leaving a marker.
// Scoped to its worktree, as a container's own clone would hold them.
const PLANTING_STUB = CONTAINER_STUB.replace(
  '  git("commit", "--allow-empty", "-m", next.title + "\\n\\nProof.\\n\\n" + trailer);',
  `  git("commit", "--allow-empty", "-m", next.title + "\\n\\nProof.\\n\\n" + trailer);
  if (next.id === "S2") {
    const { chmodSync, mkdirSync, writeFileSync } = require("node:fs");
    const marks = process.env.STUB_MARKERS;
    const hooks = marks + "-hooks";
    mkdirSync(hooks, { recursive: true });
    for (const hook of ["pre-push", "reference-transaction", "post-checkout", "post-merge", "pre-commit"]) {
      writeFileSync(hooks + "/" + hook, "#!/bin/sh\\ntouch " + marks + "/hook-" + hook + "\\n");
      chmodSync(hooks + "/" + hook, 0o755);
    }
    writeFileSync(hooks + "/fsmonitor", "#!/bin/sh\\ntouch " + marks + "/fsmonitor\\nexit 1\\n");
    chmodSync(hooks + "/fsmonitor", 0o755);
    git("config", "extensions.worktreeConfig", "true");
    git("config", "--worktree", "core.hooksPath", hooks);
    git("config", "--worktree", "core.fsmonitor", hooks + "/fsmonitor");
    git("config", "--worktree", "filter.plant.clean", "touch " + marks + "/filter-clean; cat");
    git("config", "--worktree", "filter.plant.smudge", "touch " + marks + "/filter-smudge; cat");
    writeFileSync(git("rev-parse", "--git-path", "info/attributes"), "* filter=plant\\n");
  }`,
);

describe("run.mjs pushes from a clone only the host writes, with the App's token", () => {
  // What the bare origin itself holds on the slices branch, with no fetch in between.
  const originTrailers = (fixture) =>
    git(path.join(fixture.tmp, "origin.git"), "log", "--format=%(trailers:key=Slice,valueonly)", "main..slices/demo")
      .split("\n")
      .filter(Boolean)
      .sort();
  const hostClone = (fixture) => path.join(fixture.repo, ".git", "run-feature", "demo.git");

  it("fetches each session's commits into its own clone and pushes them with the App token, hooks off", async () => {
    const fixture = makeFixture(CONTAINER_STUB);
    const github = await startFakeGithub(fixture);
    git(fixture.repo, "remote", "set-url", "origin", `${github.base}Dan86de/demo.git`);
    // A hook the shell's own git config points at runs on any push not given core.hooksPath=/dev/null.
    const globalHooks = path.join(fixture.tmp, "global-hooks");
    mkdirSync(globalHooks);
    writeFileSync(path.join(globalHooks, "pre-push"), `#!/bin/sh\ntouch ${fixture.tmp}/global-pre-push\n`);
    chmodSync(path.join(globalHooks, "pre-push"), 0o755);
    const globalConfig = path.join(fixture.tmp, "gitconfig");
    writeFileSync(globalConfig, `[core]\n\thooksPath = ${globalHooks}\n`);
    try {
      const { result, minterLog } = await runRunnerWithDaemon(fixture, { env: { GIT_CONFIG_GLOBAL: globalConfig } });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(originTrailers(fixture), ["S1", "S2"]);
      assert.equal(existsSync(hostClone(fixture)), false, "a clean finish deletes the host clone");
      const minted = readFileSync(minterLog, "utf8").split("\n").filter(Boolean);
      assert.ok(minted.length >= 3, minted.join("\n"));
      assert.ok(minted.every((repository) => repository === "Dan86de/demo"), minted.join("\n"));
      const pushes = github.requests().filter((request) => request.pushing);
      assert.ok(pushes.length > 0);
      assert.ok(pushes.every((request) => request.authorized), JSON.stringify(pushes));
      assert.equal(existsSync(path.join(fixture.tmp, "global-pre-push")), false);
      assert.doesNotMatch(readFileSync(path.join(fixture.repo, ".git", "config"), "utf8"), /stub-app-token|extraheader/i);
    } finally {
      github.stop();
    }
  });

  it("pushes a GitHub SSH origin at its HTTPS address, past the user's own URL rewrites", async () => {
    const fixture = makeFixture(CONTAINER_STUB);
    const github = await startFakeGithub(fixture);
    git(fixture.repo, "remote", "set-url", "origin", "git@github.com:Dan86de/demo.git");
    // A push address of its own wins over the fetch address, in either SSH form.
    git(fixture.repo, "config", "remote.origin.pushurl", "ssh://git@github.com/Dan86de/demo.git");
    // Stands in for github.com: the SSH origin and its HTTPS address both reach
    // the fake, and a push left at the SSH address lands nowhere.
    const routes =
      `'url.${github.base}.insteadof'='git@github.com:' ` +
      `'url.${github.base}.insteadof'='https://github.com/' ` +
      `'url.${github.base}nowhere/.pushinsteadof'='git@github.com:' ` +
      `'url.${github.base}nowhere/.pushinsteadof'='ssh://git@github.com/'`;
    // A user rule sending HTTPS pushes back to SSH, as many a git setup has.
    const globalConfig = path.join(fixture.tmp, "gitconfig");
    writeFileSync(globalConfig, `[url "${github.base}nowhere/"]\n\tpushInsteadOf = https://github.com/\n`);
    try {
      const { result, minterLog } = await runRunnerWithDaemon(fixture, {
        env: { GIT_CONFIG_PARAMETERS: routes, GIT_CONFIG_GLOBAL: globalConfig },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(originTrailers(fixture), ["S1", "S2"]);
      assert.match(readFileSync(minterLog, "utf8"), /^Dan86de\/demo$/m);
      assert.ok(github.requests().every((request) => !request.path.startsWith("/nowhere/")));
    } finally {
      github.stop();
    }
  });

  it("a hook, an fsmonitor and a filter planted in the session's tree run nowhere during the fetch and push", async () => {
    // The close leaves the PR a draft, so the run halts before removing the
    // worktree, whose clean check runs the tree's fsmonitor and filter as any status does.
    const fixture = makeFixture(
      PLANTING_STUB.replace('  markReady();', ""),
    );
    const marks = path.join(fixture.tmp, "markers");
    mkdirSync(marks);
    const { result } = await runRunnerWithDaemon(fixture, { env: { STUB_MARKERS: marks } });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /halt: the close session did not finish: the PR is still a draft/);
    assert.deepEqual(originTrailers(fixture), ["S1", "S2"]);
    assert.deepEqual(readdirSync(marks), []);
    // The planted items were live: git run in that tree trips every one.
    writeFileSync(path.join(fixture.worktree, "spec", "features", "demo", "spec.md"), "# demo, edited\n");
    git(fixture.worktree, "add", "spec/features/demo/spec.md");
    git(fixture.worktree, "commit", "--quiet", "-m", "planted hooks fire");
    assert.deepEqual(readdirSync(marks).sort(), ["filter-clean", "fsmonitor", "hook-pre-commit", "hook-reference-transaction"]);
  });

  it("without a minter on PATH, pushes from the host clone with the shell's own credential, and says so", () => {
    const fixture = makeFixture(CONTAINER_STUB);
    rmSync(path.join(fixture.bin, "github-app-token"));
    const { result } = runRunner(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(originTrailers(fixture), ["S1", "S2"]);
    const said = result.stdout.split("\n").filter((line) => line.includes("no github-app-token on PATH"));
    assert.equal(said.length, 1, result.stdout);
  });

  it("a minter that fails halts as push refused with its reason, and pushes nothing", () => {
    // Seeding the settings pushes before any session, so the push is the minter's first use.
    const fixture = makeFixture(CONTAINER_STUB, SLICES, { settingsFile: false });
    const { result, osaLog } = runRunner(fixture, { STUB_MINTER_FAIL: "1" });
    assert.equal(result.status, 2, result.stderr);
    assert.match(
      result.stderr,
      /halt: github-app-token gave no token for [^:]+: the App is not installed on this repository; fix the minter, then re-kick/,
    );
    assert.deepEqual(bannerPayloads(osaLog), ["push refused"]);
    assert.equal(spawnSync("git", ["-C", path.join(fixture.tmp, "origin.git"), "rev-parse", "--verify", "--quiet", "slices/demo"]).status, 1);
  });
});

describe("run.mjs opens and readies the PR as the App, and no session calls gh", () => {
  // Every gh call with the token it carried, and GitHub's final state of the PR.
  const ghCalls = (ghLog) => readFileSync(ghLog, "utf8").split("\n").filter(Boolean);
  const ghState = (ghLog) => JSON.parse(readFileSync(`${ghLog}.state`, "utf8"));

  it("opens the PR as a draft from the first session's file, writes each body, sets the attention label and marks it ready, all with the App token", async () => {
    const fixture = makeFixture(CONTAINER_STUB);
    // Each session records the PR file it was handed.
    const seen = path.join(fixture.tmp, "seen.log");
    writeFileSync(
      path.join(fixture.bin, "claude"),
      CONTAINER_STUB.replace(
        "const slices = JSON.parse(",
        `if (existsSync(".run-feature/pr.json")) appendFileSync(${JSON.stringify(seen)}, readFileSync(".run-feature/pr.json", "utf8").replace(/\\n/g, " ") + "\\n");
const slices = JSON.parse(`,
      ),
    );
    const { result, ghLog, calls } = await runRunnerWithDaemon(fixture);
    assert.equal(result.status, 0, result.stderr);

    const pr = ghState(ghLog).pr;
    assert.equal(pr.title, "demo");
    assert.equal(pr.body, "## Slices\n\nS1\nS2");
    assert.deepEqual(pr.labels, ["attention: skim"]);
    assert.equal(pr.isDraft, false);
    assert.equal(pr.base, "main");
    assert.equal(pr.head, "slices/demo");

    const gh = ghCalls(ghLog);
    assert.ok(gh.length > 0);
    assert.ok(gh.every((call) => call.endsWith("[token stub-app-token]")), gh.join("\n"));
    const create = gh.findIndex((call) => call.startsWith("pr create --draft --base main --head slices/demo --title demo"));
    assert.ok(create >= 0, gh.join("\n"));
    assert.equal(gh.filter((call) => call.startsWith("pr create")).length, 1, gh.join("\n"));
    assert.ok(gh.some((call) => call.startsWith("label create attention: skim")), gh.join("\n"));
    assert.ok(gh.some((call) => call.startsWith("pr edit 1 --add-label attention: skim")), gh.join("\n"));
    assert.ok(gh.findIndex((call) => call.startsWith("pr ready 1")) > create, gh.join("\n"));

    // The first session saw no PR yet, and every later one saw the PR the runner opened.
    const handed = readFileSync(seen, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(handed.length, 3);
    assert.equal(handed[0].number, null);
    assert.equal(handed[0].base, "main");
    assert.equal(handed[0].head, "slices/demo");
    assert.equal(handed[1].number, 1);
    assert.equal(handed[2].body, "## Slices\n\nS1\nS2");

    // Each session is told the runner owns the PR, and to keep off gh and git push.
    for (const launch of callsTo(calls, "sessionLaunch")) {
      assert.match(launch.appendSystemPrompt, /never run `git push` or `gh`/);
      assert.match(launch.appendSystemPrompt, /\.run-feature\/pr\.json/);
    }
  });

  it("a session's own gh call is the only one without the App token, so a test can tell it apart", async () => {
    const fixture = makeFixture(
      CONTAINER_STUB.replace('  markReady();', '  markReady();\n  execFileSync("gh", ["pr", "view"]);'),
    );
    const { result, ghLog } = await runRunnerWithDaemon(fixture);
    assert.equal(result.status, 0, result.stderr);
    const sessionCalls = ghCalls(ghLog).filter((call) => call.endsWith("[token none]"));
    assert.deepEqual(sessionCalls, ["pr view [token none]"]);
  });

  it("applies only attention labels, and keeps the PR file out of git", async () => {
    const fixture = makeFixture(
      CONTAINER_STUB.replace(
        'labels: ["attention: skim"]',
        'labels: ["attention: read", "release"]',
      ),
    );
    const { result, ghLog } = await runRunnerWithDaemon(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(ghState(ghLog).pr.labels, ["attention: read"]);
    assert.deepEqual(ghState(ghLog).labels, ["attention: read"]);
    const tracked = git(fixture.repo, "ls-tree", "-r", "--name-only", "origin/slices/demo");
    assert.doesNotMatch(tracked, /\.run-feature/);
  });

  it("a PR file a session swapped for a link to a host file halts, and posts nothing from it", async () => {
    const secret = path.join(os.tmpdir(), `run-feature-secret-${process.pid}`);
    writeFileSync(secret, JSON.stringify({ title: "leak", body: "host secret", draft: true }));
    const fixture = makeFixture(
      CONTAINER_STUB.replace(
        "const slices = JSON.parse(",
        `require("node:fs").rmSync(".run-feature", { recursive: true, force: true });
require("node:fs").mkdirSync(".run-feature");
require("node:fs").symlinkSync(${JSON.stringify(secret)}, ".run-feature/pr.json");
process.exit(0);
const slices = JSON.parse(`,
      ),
    );
    try {
      const { result, ghLog, osaLog } = await runRunnerWithDaemon(fixture);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /halt: \.run-feature\/pr\.json in the worktree is not a plain file/);
      assert.deepEqual(bannerPayloads(osaLog), ["pr refused"]);
      assert.ok(ghCalls(ghLog).every((call) => !call.startsWith("pr create")));
      assert.match(readFileSync(secret, "utf8"), /host secret/);
    } finally {
      rmSync(secret, { force: true });
    }
  });

  it("a PR file a session left as a dangling link halts, rather than reading as no file", async () => {
    const fixture = makeFixture(
      CONTAINER_STUB.replace(
        "const slices = JSON.parse(",
        `require("node:fs").rmSync(".run-feature", { recursive: true, force: true });
require("node:fs").mkdirSync(".run-feature");
require("node:fs").symlinkSync("/nonexistent/pr.json", ".run-feature/pr.json");
process.exit(0);
const slices = JSON.parse(`,
      ),
    );
    const { result, ghLog, osaLog } = await runRunnerWithDaemon(fixture);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /halt: \.run-feature\/pr\.json in the worktree is not a plain file/);
    assert.deepEqual(bannerPayloads(osaLog), ["pr refused"]);
    assert.ok(ghCalls(ghLog).every((call) => !call.startsWith("pr create")));
  });

  it("without a minter, the runner still owns the PR, through the shell's own gh login", () => {
    const fixture = makeFixture(CONTAINER_STUB);
    rmSync(path.join(fixture.bin, "github-app-token"));
    const { result, ghLog } = runRunner(fixture);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(ghState(ghLog).pr.isDraft, false);
    assert.ok(ghCalls(ghLog).every((call) => call.endsWith("[token none]")));
  });
});
