// Funi Code for VS Code.
//
// The extension is a thin client: it finds the Funi Code server that the desktop
// app (or `fcode serve`) already runs, asks the CLI for a bearer session once,
// and shows the server's own web UI in a webview. A tiny loopback proxy adds the
// bearer header, so the web UI needs no pairing and nothing is duplicated:
// providers, threads and projects are the same ones the desktop app shows.
//
// Deliberately dependency-free plain JS so there is nothing to build or update.

"use strict";

const vscode = require("vscode");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const SECRET_KEY = "funiCode.session";
const SESSION_TTL = "30d";
const APP_NAME = "Funi Code (Alpha)";

/** @type {vscode.OutputChannel} */
let log;

// ---------------------------------------------------------------------------
// Server discovery and CLI

function config() {
  return vscode.workspace.getConfiguration("funiCode");
}

function baseDir() {
  const configured = config().get("baseDir", "").trim();
  if (configured) return configured.replace(/^~(?=$|[/\\])/, os.homedir());
  return process.env.T3CODE_HOME || path.join(os.homedir(), ".t3");
}

function readRuntime() {
  const file = path.join(baseDir(), "userdata", "server-runtime.json");
  try {
    const runtime = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof runtime.port !== "number") return null;
    return { host: runtime.host || "127.0.0.1", port: runtime.port, pid: runtime.pid };
  } catch {
    return null;
  }
}

function httpGetJson(target, urlPath, token) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: target.host,
        port: target.port,
        path: urlPath,
        timeout: 3000,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, json: null });
          }
        });
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

async function findServer() {
  const runtime = readRuntime();
  if (!runtime) return null;
  const probe = await httpGetJson(runtime, "/api/auth/session");
  return probe && probe.status === 200 ? runtime : null;
}

/** How to run the `fcode` CLI: explicit setting, PATH, or the installed desktop app. */
function resolveCli() {
  const configured = config().get("cliPath", "").trim();
  if (configured) return { command: configured, args: [], env: {} };

  const appCandidates = [];
  if (process.platform === "darwin") {
    for (const root of ["/Applications", path.join(os.homedir(), "Applications")]) {
      const app = path.join(root, `${APP_NAME}.app`);
      appCandidates.push({
        exe: path.join(app, "Contents", "MacOS", APP_NAME),
        entry: path.join(
          app,
          "Contents",
          "Resources",
          "app.asar",
          "apps",
          "server",
          "dist",
          "bin.mjs",
        ),
      });
    }
  } else if (process.platform === "win32") {
    // NSIS installs per-user under %LOCALAPPDATA%\Programs\<product>, or per-machine
    // under Program Files. Windows builds ship the server in resources\server.asar.
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const roots = [
      path.join(local, "Programs"),
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
    ].filter(Boolean);
    for (const root of roots) {
      let names = [];
      try {
        names = fs.readdirSync(root).filter((name) => /^funi[ -]?code/i.test(name));
      } catch {
        continue;
      }
      for (const name of names) {
        const app = path.join(root, name);
        let exe;
        try {
          exe = fs
            .readdirSync(app)
            .find((file) => /^funi.*\.exe$/i.test(file) && !/uninstall/i.test(file));
        } catch {
          continue;
        }
        if (!exe) continue;
        for (const archive of ["server.asar", "app.asar"]) {
          const entry = path.join(app, "resources", archive, "apps", "server", "dist", "bin.mjs");
          appCandidates.push({
            exe: path.join(app, exe),
            entry,
            archive: path.join(app, "resources", archive),
          });
        }
      }
    }
  }

  const onPath = whichSync(process.platform === "win32" ? "fcode.cmd" : "fcode");
  if (onPath) return { command: onPath, args: [], env: {}, shell: process.platform === "win32" };

  for (const candidate of appCandidates) {
    if (fs.existsSync(candidate.exe) && (!candidate.archive || fs.existsSync(candidate.archive))) {
      return {
        command: candidate.exe,
        args: [candidate.entry],
        env: { ELECTRON_RUN_AS_NODE: "1" },
      };
    }
  }
  return null;
}

function whichSync(name) {
  const dirs = (process.env.PATH || "").split(path.delimiter);
  dirs.push(path.join(os.homedir(), ".local", "bin"));
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

function runCli(cliArgs, { cwd } = {}) {
  const cli = resolveCli();
  if (!cli) {
    return Promise.reject(
      new Error("Could not find Funi Code. Install the app or set funiCode.cliPath."),
    );
  }
  const extra = [];
  const configuredBase = config().get("baseDir", "").trim();
  if (configuredBase) extra.push("--base-dir", baseDir());
  return new Promise((resolve, reject) => {
    childProcess.execFile(
      cli.command,
      [...cli.args, ...cliArgs, ...extra],
      {
        cwd: cwd || os.homedir(),
        env: { ...process.env, ...cli.env },
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024,
        shell: Boolean(cli.shell),
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || error.message)
            .split("\n")
            .filter((line) => !/ExperimentalWarning|trace-warnings/.test(line))
            .join("\n")
            .trim();
          reject(new Error(detail || error.message));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Session (bearer token stored in VS Code SecretStorage, never in settings)

async function ensureSession(context, target) {
  const stored = await context.secrets.get(SECRET_KEY);
  if (stored) {
    try {
      const session = JSON.parse(stored);
      const check = await httpGetJson(target, "/api/auth/session", session.token);
      if (check && check.json && check.json.authenticated === true) return session;
    } catch {
      // fall through and issue a fresh one
    }
  }
  const label = `VS Code (${os.hostname()})`;
  const output = await runCli([
    "auth",
    "session",
    "issue",
    "--json",
    "--ttl",
    SESSION_TTL,
    "--label",
    label,
  ]);
  const issued = JSON.parse(output.slice(output.indexOf("{")));
  const session = { token: issued.token, sessionId: issued.sessionId };
  await context.secrets.store(SECRET_KEY, JSON.stringify(session));
  log.appendLine(`Issued VS Code session ${issued.sessionId}`);
  return session;
}

async function forgetSession(context) {
  const stored = await context.secrets.get(SECRET_KEY);
  await context.secrets.delete(SECRET_KEY);
  if (!stored) return;
  try {
    const { sessionId } = JSON.parse(stored);
    if (sessionId) await runCli(["auth", "session", "revoke", sessionId]);
  } catch (error) {
    log.appendLine(`Could not revoke session: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Loopback proxy: adds the bearer header, refuses foreign browser origins.

class AuthProxy {
  constructor() {
    this.server = null;
    this.port = 0;
    this.target = null;
    this.token = null;
  }

  update(target, token) {
    this.target = target;
    this.token = token;
  }

  allowed(req) {
    // Host check stops DNS rebinding; Origin check stops random web pages on this
    // machine from driving the proxy (webviews and the proxy itself are fine).
    const host = String(req.headers.host || "");
    if (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) return false;
    const origin = req.headers.origin;
    if (origin === undefined || origin === "null") return true;
    if (origin.startsWith("vscode-webview://") || origin.startsWith("vscode-file://")) return true;
    return origin === `http://127.0.0.1:${this.port}` || origin === `http://localhost:${this.port}`;
  }

  upstreamHeaders(headers) {
    const next = { ...headers };
    delete next.cookie;
    delete next.origin;
    delete next.authorization;
    next.host = `${this.target.host}:${this.target.port}`;
    next.authorization = `Bearer ${this.token}`;
    return next;
  }

  start() {
    if (this.server) return Promise.resolve(this.port);
    this.server = http.createServer((req, res) => {
      if (!this.target || !this.allowed(req)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const upstream = http.request(
        {
          host: this.target.host,
          port: this.target.port,
          method: req.method,
          path: req.url,
          headers: this.upstreamHeaders(req.headers),
        },
        (upstreamRes) => {
          const headers = { ...upstreamRes.headers };
          delete headers["set-cookie"];
          res.writeHead(upstreamRes.statusCode || 502, headers);
          upstreamRes.pipe(res);
        },
      );
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end("Funi Code server is not reachable");
      });
      req.pipe(upstream);
    });
    this.server.on("upgrade", (req, socket, head) => {
      if (!this.target || !this.allowed(req)) {
        socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
        return;
      }
      const upstream = net.connect(this.target.port, this.target.host, () => {
        const lines = [`${req.method} ${req.url} HTTP/1.1`];
        for (const [key, value] of Object.entries(this.upstreamHeaders(req.headers))) {
          for (const item of Array.isArray(value) ? value : [value]) lines.push(`${key}: ${item}`);
        }
        upstream.write(lines.join("\r\n") + "\r\n\r\n");
        if (head && head.length) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      upstream.on("error", () => socket.destroy());
      socket.on("error", () => upstream.destroy());
    });
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.port = this.server.address().port;
        log.appendLine(`Proxy listening on 127.0.0.1:${this.port}`);
        resolve(this.port);
      });
    });
  }

  dispose() {
    if (this.server) this.server.close();
    this.server = null;
  }
}

// ---------------------------------------------------------------------------
// Webviews

function nonce() {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join("");
}

function frameHtml(frameUrl) {
  const n = nonce();
  const origin = new URL(frameUrl).origin;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${origin}; style-src 'nonce-${n}';">
<style nonce="${n}">html,body{margin:0;padding:0;height:100%;overflow:hidden;background:transparent}
iframe{border:0;width:100%;height:100vh;display:block}</style></head>
<body><iframe src="${frameUrl}" allow="clipboard-read; clipboard-write; microphone"></iframe></body></html>`;
}

function messageHtml(title, body, actions) {
  const n = nonce();
  const buttons = actions
    .map((action) => `<button data-cmd="${action.command}">${action.label}</button>`)
    .join(" ");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${n}'; script-src 'nonce-${n}';">
<style nonce="${n}">body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:16px;line-height:1.5}
h3{margin:0 0 8px}button{margin:8px 6px 0 0;padding:6px 12px;border:0;border-radius:4px;cursor:pointer;
background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
p{color:var(--vscode-descriptionForeground)}</style></head>
<body><h3>${title}</h3><p>${body}</p>${buttons}
<script nonce="${n}">const vscode=acquireVsCodeApi();
document.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>vscode.postMessage({command:b.dataset.cmd})));</script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Controller

class FuniCode {
  constructor(context) {
    this.context = context;
    this.proxy = new AuthProxy();
    this.views = new Set();
    this.frameUrl = null;
  }

  async connect({ quiet = false } = {}) {
    const target = await findServer();
    if (!target) {
      this.frameUrl = null;
      this.render();
      return false;
    }
    try {
      const session = await ensureSession(this.context, target);
      this.proxy.update(target, session.token);
      const port = await this.proxy.start();
      const external = await vscode.env.asExternalUri(
        vscode.Uri.parse(`http://127.0.0.1:${port}/`),
      );
      this.frameUrl = external.toString(true);
      this.render();
      if (config().get("autoAddWorkspace", true)) void this.addWorkspace({ quiet: true });
      return true;
    } catch (error) {
      log.appendLine(`Connect failed: ${error.message}`);
      this.frameUrl = null;
      this.render(error.message);
      if (!quiet) void vscode.window.showErrorMessage(`Funi Code: ${error.message}`);
      return false;
    }
  }

  async startServer() {
    if (process.platform === "darwin" && fs.existsSync(`/Applications/${APP_NAME}.app`)) {
      childProcess.spawn("open", ["-a", APP_NAME], { detached: true, stdio: "ignore" }).unref();
    } else {
      const cli = resolveCli();
      if (!cli) {
        void vscode.window.showErrorMessage(
          "Funi Code: install the app or set funiCode.cliPath to the fcode command.",
        );
        return;
      }
      childProcess
        .spawn(cli.command, [...cli.args, "serve", "--no-browser"], {
          detached: true,
          stdio: "ignore",
          env: { ...process.env, ...cli.env },
          shell: Boolean(cli.shell),
          windowsHide: true,
        })
        .unref();
    }
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Starting Funi Code…" },
      async () => {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if (await findServer()) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      },
    );
    await this.connect();
  }

  async addWorkspace({ quiet = false } = {}) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder || folder.uri.scheme !== "file") {
      if (!quiet) void vscode.window.showInformationMessage("Funi Code: open a folder first.");
      return;
    }
    try {
      await runCli(["project", "add", folder.uri.fsPath, "--title", folder.name]);
      if (!quiet) void vscode.window.showInformationMessage(`Funi Code: added ${folder.name}.`);
    } catch (error) {
      // Already registered is fine; only surface real failures when asked.
      log.appendLine(`project add: ${error.message}`);
      if (!quiet && !/already|exists/i.test(error.message)) {
        void vscode.window.showErrorMessage(`Funi Code: ${error.message}`);
      }
    }
  }

  html(errorMessage) {
    if (this.frameUrl) return frameHtml(this.frameUrl);
    if (errorMessage) {
      return messageHtml("Could not connect", errorMessage, [
        { command: "reconnect", label: "Try again" },
        { command: "signOut", label: "Reset VS Code session" },
      ]);
    }
    return messageHtml(
      "Funi Code is not running",
      "Open the Funi Code app (or run <code>fcode serve</code>). Your threads, providers and Rebe are shared with it.",
      [
        { command: "start", label: "Start Funi Code" },
        { command: "reconnect", label: "Retry" },
      ],
    );
  }

  attach(webview) {
    webview.options = { enableScripts: true };
    webview.onDidReceiveMessage((message) => {
      if (message.command === "start") void this.startServer();
      if (message.command === "reconnect") void this.connect();
      if (message.command === "signOut") void this.signOut();
    });
    this.views.add(webview);
    webview.html = this.html();
  }

  detach(webview) {
    this.views.delete(webview);
  }

  render(errorMessage) {
    for (const webview of this.views) webview.html = this.html(errorMessage);
  }

  openPanel() {
    const panel = vscode.window.createWebviewPanel(
      "funiCode.panel",
      "Funi Code",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "icon.png");
    this.attach(panel.webview);
    panel.onDidDispose(() => this.detach(panel.webview));
    if (!this.frameUrl) void this.connect({ quiet: true });
  }

  async signOut() {
    await forgetSession(this.context);
    this.frameUrl = null;
    this.render();
    void vscode.window.showInformationMessage("Funi Code: VS Code session removed.");
  }

  dispose() {
    this.proxy.dispose();
  }
}

function activate(context) {
  log = vscode.window.createOutputChannel("Funi Code");
  const funi = new FuniCode(context);

  context.subscriptions.push(
    log,
    { dispose: () => funi.dispose() },
    vscode.window.registerWebviewViewProvider(
      "funiCode.chat",
      {
        resolveWebviewView(view) {
          funi.attach(view.webview);
          view.onDidDispose(() => funi.detach(view.webview));
          if (!funi.frameUrl) void funi.connect({ quiet: true });
        },
      },
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.commands.registerCommand("funiCode.openPanel", () => funi.openPanel()),
    vscode.commands.registerCommand("funiCode.reconnect", () => funi.connect()),
    vscode.commands.registerCommand("funiCode.addWorkspace", () => funi.addWorkspace()),
    vscode.commands.registerCommand("funiCode.signOut", () => funi.signOut()),
  );

  if (config().get("openOnStartup", false)) funi.openPanel();
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
  _internals: { AuthProxy, baseDir, readRuntime, resolveCli },
};
