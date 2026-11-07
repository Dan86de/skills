#!/usr/bin/env node
// github-app-token <owner>/<repo>: prints a 1-hour GitHub App installation
// token that reaches only that repository, for run.mjs to push and open PRs with.
// The App's ID and private key are read from ~/.config/agents-hq, or from
// GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH when set.

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const CONFIG_DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "agents-hq");
const API = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");

function fail(message) {
  process.stderr.write(`github-app-token: ${message}\n`);
  process.exit(1);
}

function readConfig(variable, file) {
  if (process.env[variable]) return process.env[variable];
  try {
    return readFileSync(path.join(CONFIG_DIR, file), "utf8").trim();
  } catch (error) {
    fail(`no ${variable} and no ${path.join(CONFIG_DIR, file)}: ${error.message}`);
  }
}

const base64url = (data) => Buffer.from(data).toString("base64url");

// GitHub takes a JWT of at most 10 minutes, and its clock may run behind ours.
function appJwt(appId, key) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
  )}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key);
  return `${unsigned}.${base64url(signature)}`;
}

async function call(method, route, jwt, body) {
  const response = await fetch(`${API}${route}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) fail(`${method} ${route} answered ${response.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function main() {
  const repository = process.argv[2] ?? "";
  const match = repository.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!match || process.argv.length !== 3) fail("usage: github-app-token <owner>/<repo>");
  const appId = readConfig("GITHUB_APP_ID", "github-app-id");
  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH || path.join(CONFIG_DIR, "github-app.pem");
  let key;
  try {
    key = readFileSync(keyPath, "utf8");
  } catch (error) {
    fail(`cannot read the App's private key at ${keyPath}: ${error.message}`);
  }
  const jwt = appJwt(appId, key);
  const installation = await call("GET", `/repos/${match[1]}/${match[2]}/installation`, jwt);
  const { token } = await call("POST", `/app/installations/${installation.id}/access_tokens`, jwt, {
    repositories: [match[2]],
  });
  if (typeof token !== "string" || token === "") fail("GitHub returned no token");
  process.stdout.write(`${token}\n`);
}

main().catch((error) => fail(error.message));
