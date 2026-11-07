// Seam tests for github-app-token: run the minter against a fake GitHub API
// that checks the App's signed JWT, as api.github.com would.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const MINTER = fileURLToPath(new URL("./github-app-token.mjs", import.meta.url));

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function verifiedClaims(authorization) {
  const [header, claims, signature] = (authorization ?? "").replace(/^Bearer /, "").split(".");
  const valid = createVerify("RSA-SHA256")
    .update(`${header}.${claims}`)
    .verify(publicKey, Buffer.from(signature ?? "", "base64url"));
  return valid ? JSON.parse(Buffer.from(claims, "base64url").toString()) : null;
}

// Answers the two calls a minter makes, for an App installed on Dan86de/demo only.
async function startFakeApi() {
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const claims = verifiedClaims(request.headers.authorization);
      requests.push({ method: request.method, url: request.url, claims, body: body ? JSON.parse(body) : null });
      const reply = (status, json) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(json));
      };
      if (claims === null) return reply(401, { message: "A JSON web token could not be decoded" });
      if (request.method === "GET" && request.url === "/repos/Dan86de/demo/installation") return reply(200, { id: 42 });
      if (request.method === "GET" && request.url.startsWith("/repos/")) return reply(404, { message: "Not Found" });
      if (request.method === "POST" && request.url === "/app/installations/42/access_tokens") {
        return reply(201, { token: "ghs_minted", expires_at: "2026-11-07T13:00:00Z" });
      }
      reply(404, { message: "Not Found" });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, stop: () => server.close() };
}

function mint(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [MINTER, ...args], { env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

// An XDG_CONFIG_HOME of its own, and the agents-hq folder the minter reads in it.
function configDir() {
  const config = mkdtempSync(path.join(os.tmpdir(), "github-app-token-"));
  return { config, dir: path.join(config, "agents-hq") };
}

describe("github-app-token mints a 1-hour token for one repository", () => {
  it("signs a JWT as the App, finds the repository's installation and narrows the token to that repository", async () => {
    const api = await startFakeApi();
    const { config, dir } = configDir();
    mkdirSync(dir);
    writeFileSync(path.join(dir, "github-app-id"), "123456\n");
    writeFileSync(path.join(dir, "github-app.pem"), privateKey.export({ type: "pkcs1", format: "pem" }));
    try {
      const result = await mint(["Dan86de/demo"], { XDG_CONFIG_HOME: config, GITHUB_API_URL: api.url });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "ghs_minted\n");
      assert.deepEqual(
        api.requests.map(({ method, url }) => `${method} ${url}`),
        ["GET /repos/Dan86de/demo/installation", "POST /app/installations/42/access_tokens"],
      );
      for (const { claims } of api.requests) {
        assert.equal(claims.iss, "123456");
        assert.ok(claims.exp - claims.iat <= 600, JSON.stringify(claims));
      }
      assert.deepEqual(api.requests[1].body, { repositories: ["demo"] });
    } finally {
      api.stop();
    }
  });

  it("a repository the App is not installed on exits non-zero with GitHub's answer and prints no token", async () => {
    const api = await startFakeApi();
    const { config } = configDir();
    const keyPath = path.join(config, "key.pem");
    writeFileSync(keyPath, privateKey.export({ type: "pkcs1", format: "pem" }));
    try {
      const result = await mint(["Dan86de/other"], {
        XDG_CONFIG_HOME: config,
        GITHUB_API_URL: api.url,
        GITHUB_APP_ID: "123456",
        GITHUB_APP_PRIVATE_KEY_PATH: keyPath,
      });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /GET \/repos\/Dan86de\/other\/installation answered 404/);
    } finally {
      api.stop();
    }
  });

  it("without the App's key, exits non-zero naming where it looked", async () => {
    const { config, dir } = configDir();
    const result = await mint(["Dan86de/demo"], { XDG_CONFIG_HOME: config, GITHUB_APP_ID: "123456" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.includes(`cannot read the App's private key at ${path.join(dir, "github-app.pem")}`), result.stderr);
  });

  it("refuses anything but one <owner>/<repo>", async () => {
    const result = await mint(["not-a-repo"], {});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /usage: github-app-token <owner>\/<repo>/);
  });
});
