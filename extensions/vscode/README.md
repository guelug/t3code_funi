# Funi Code for VS Code

Funi Code inside VS Code and Cursor. Same threads, providers and Rebe (Hermes) as
the desktop app — the extension connects to the Funi Code server already running
on your machine.

## Use

1. Install and open the Funi Code app once (or run `fcode serve`).
2. Click the Funi Code globe in the activity bar.
3. The open folder is added as a Funi Code project automatically.

Commands: **Funi Code: Open in Editor**, **Add This Folder as a Project**,
**Reconnect**, **Forget VS Code Session**.

## How it works

The extension asks the local `fcode` CLI for a bearer session (stored in VS Code
SecretStorage, revocable with _Forget VS Code Session_ or in Settings →
Connections) and shows the server's web UI through a loopback-only proxy that adds
that credential. No data leaves your machine through the extension.

Based on T3 Code (MIT).
