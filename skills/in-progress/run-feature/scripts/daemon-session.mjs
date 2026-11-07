#!/usr/bin/env node
// Runs one headless session through the local agents-hq daemon, so it shows in
// agents-hq, and returns once its turn is over and the session is ended.
// Usage: daemon-session.mjs run-start <name> <task> <key>      prints the run id, or nothing
//        daemon-session.mjs run-steps <run-id> <steps-json>
//        daemon-session.mjs run-settle <run-id> <session-id> <outcome> [detail]
//        daemon-session.mjs run-end <run-id> <outcome> [detail]
//        daemon-session.mjs quota                                prints the latest rate-limit reading as JSON, or nothing
//        daemon-session.mjs session <cwd> <prompt> <system-prompt-note> <name> <task> <result-file> [run-id] [parent-session-id] [step-id]
// A session writes its id to <result-file>, then the run shows it live.
// run-start names the session it was kicked from, AGENTS_HQ_SESSION_ID, as the run's launcher.
// Exit codes: 0 done, 1 lost mid-run, 3 no daemon that can run it was found and
// nothing was launched, so the caller should run it another way, 4 ended by
// someone else through the daemon, usually a person in agents-hq.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { settleWatch } from "./settle-watch.mjs";

// The first contract version with a run's key and steps, a member's stepId and the waiting outcome.
const MIN_CONTRACT_VERSION = 5;
const DEFAULT_PORT = 4760;
const POLL_MS = 5000;
const UNAVAILABLE = 3;
const ENDED_BY_SOMEONE_ELSE = 4;
// The exit code the daemon gives a session ended through sessionKill. The watch
// returns as soon as it sends its own kill, so seeing this means it did not send it.
const KILLED = 143;

const log = (message) => process.stderr.write(`[daemon-session] ${message}\n`);

function tokenFile() {
  const stateDir = process.env.AGENTS_HQ_STATE_DIR ?? path.join(os.homedir(), ".agents-hq", "state");
  return path.join(stateDir, "token");
}

// One WebSocket with one-shot calls over it, framed as the daemon's RPC expects.
function connect(port, token) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/rpc`, token);
    const pending = new Map();
    let nextId = 1;
    const client = {
      call: (tag, payload) =>
        new Promise((resolveCall, rejectCall) => {
          // A closed socket drops a send without a word, and a call that never settles
          // lets this process run out of work and exit 0 as if the session were done.
          if (socket.readyState !== WebSocket.OPEN) return rejectCall(new Error("the daemon went away"));
          const id = nextId++;
          pending.set(String(id), { resolveCall, rejectCall });
          socket.send(`${JSON.stringify({ _tag: "Request", id, tag, payload, headers: [] })}\n`);
        }),
      close: () => socket.close(),
    };
    socket.onclose = () => {
      for (const { rejectCall } of pending.values()) rejectCall(new Error("the daemon went away"));
      reject(new Error("the daemon refused or dropped the connection"));
    };
    socket.onopen = () => resolve(client);
    socket.onerror = () => {};
    socket.onmessage = (event) => {
      for (const line of String(event.data).split("\n")) {
        if (line.trim() === "") continue;
        const message = JSON.parse(line);
        if (message._tag !== "Exit") continue;
        const call = pending.get(String(message.requestId));
        pending.delete(String(message.requestId));
        if (message.exit._tag === "Success") call?.resolveCall(message.exit.value);
        else call?.rejectCall(new Error(JSON.stringify(message.exit.cause ?? message.exit)));
      }
    };
  });
}

async function availableDaemon() {
  const port = process.env.AGENTS_HQ_PORT ?? DEFAULT_PORT;
  if (!existsSync(tokenFile())) return null;
  try {
    const client = await connect(port, readFileSync(tokenFile(), "utf8").trim());
    const info = await client.call("ping", {});
    if (info.contractVersion >= MIN_CONTRACT_VERSION) return client;
    log(`the daemon on port ${port} is on contract ${info.contractVersion}, which needs a restart onto ${MIN_CONTRACT_VERSION}`);
    client.close();
  } catch (error) {
    log(`no daemon on port ${port}: ${error.message}`);
  }
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runSession(args) {
  const [cwd, prompt, note, name, task, resultFile, runId, parentSessionId, stepId] = args;
  if (resultFile === undefined) {
    log("usage: daemon-session.mjs session <cwd> <prompt> <note> <name> <task> <result-file> [run-id] [parent-session-id] [step-id]");
    process.exit(2);
  }
  const client = await availableDaemon();
  if (client === null) process.exit(UNAVAILABLE);

  const { sessionId } = await client.call("sessionLaunch", {
    prompt,
    location: { _tag: "Directory", path: cwd },
    permissionMode: "full-access",
    appendSystemPrompt: note,
  });
  writeFileSync(resultFile, sessionId);
  // The session's label and run are decoration: losing one must not lose the watch, or the
  // run would start a second session in the same worktree beside this live one.
  const decorate = (tag, payload) =>
    client.call(tag, payload).catch((error) => log(`${tag} failed: ${error.message}`));
  await decorate("sessionRename", { sessionId, label: name });
  if (runId) {
    await decorate("runAttach", {
      runId,
      sessionId,
      name,
      task,
      ...(parentSessionId ? { parentSessionId } : {}),
      ...(stepId ? { stepId } : {}),
    });
  }
  log(`session ${sessionId} in agents-hq as "${name}"`);

  const settled = settleWatch();
  let waitingOnUser = false;
  for (;; await sleep(POLL_MS)) {
    const sessions = await client.call("sessionList", {});
    const state = sessions.find((session) => session.sessionId === sessionId)?.state;
    if (state === undefined) throw new Error(`session ${sessionId} was removed`);
    if (state._tag === "Exited") {
      log(`session ${sessionId} was ended with exit code ${state.exitCode}`);
      client.close();
      if (state.exitCode === KILLED) process.exit(ENDED_BY_SOMEONE_ELSE);
      return;
    }
    if (state.activity === "blocked" && !waitingOnUser) log(`session ${sessionId} is waiting on you in the UI`);
    waitingOnUser = state.activity === "blocked";
    if (settled(state.activity, Date.now())) {
      log(`session ${sessionId} settled as ${state.activity}`);
      await client.call("sessionKill", { sessionId });
      client.close();
      return;
    }
  }
}

// A run is decoration on the sessions, so a daemon that cannot show one costs nothing.
async function runCall(tag, payload, print) {
  const client = await availableDaemon();
  if (client === null) return;
  try {
    const value = await client.call(tag, payload);
    if (print) process.stdout.write(print(value));
  } catch (error) {
    log(`${tag} failed: ${error.message}`);
  }
  client.close();
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "session") return runSession(args);
  if (command === "run-start") {
    const [name, task, key] = args;
    const launcherSessionId = process.env.AGENTS_HQ_SESSION_ID;
    return runCall("runStart", { name, task, key, ...(launcherSessionId ? { launcherSessionId } : {}) }, (run) => run.runId);
  }
  if (command === "run-steps") {
    const [runId, steps] = args;
    return runCall("runSteps", { runId, steps: JSON.parse(steps) });
  }
  if (command === "run-settle") {
    const [runId, sessionId, outcome, detail] = args;
    return runCall("runSettle", { runId, sessionId, outcome, ...(detail ? { detail } : {}) });
  }
  if (command === "quota") {
    return runCall("ping", {}, (info) => (info.quota === undefined ? "" : JSON.stringify(info.quota)));
  }
  if (command === "run-end") {
    const [runId, outcome, detail] = args;
    return runCall("runEnd", { runId, outcome, ...(detail ? { detail } : {}) });
  }
  log(`unknown command "${command}"`);
  process.exit(2);
}

main().then(
  () => process.exit(0),
  (error) => {
    log(`lost the session: ${error.message}`);
    process.exit(1);
  },
);
