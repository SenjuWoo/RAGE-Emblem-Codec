# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

## Reporting a vulnerability

Use GitHub's [private vulnerability reporting](../../security/advisories/new) to report security issues privately.

Do not open a public issue for anything you suspect is a security problem.

You'll get a response once the report is triaged, and credit if you want it.

## What this project does and does not do

RAGE Emblem Codec processes images **locally** in the browser, Node tests, or a Tauri shell. It does not upload artwork to a third-party optimizer.

The generated Rockstar console snippet is meant to be pasted into the live Social Club emblem editor by the user. It reads the editor's verification token and hash from that page at send time. This repository never stores Rockstar credentials.

Please report:

- path traversal or unexpected file disclosure in `tools/serve.mjs`
- generated export code that sends a request after failing the byte-budget guard
- secret leakage in logs, reports, or release artifacts
- supply-chain issues in GitHub Actions or npm dependencies
