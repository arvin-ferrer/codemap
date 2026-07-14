# Security Policy

## Supported versions

Security fixes are made on the default development branch and included in the
next release. Use the latest commit from `develop` when reporting an issue.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Send a private
report to the repository maintainers through GitHub's private vulnerability
reporting feature, or use the contact method configured by the repository owner.

Include:

- a clear description and affected component;
- reproduction steps or a minimal proof of concept;
- potential impact; and
- any suggested mitigation, if known.

We will acknowledge a report within seven days, investigate it privately, and
coordinate disclosure after a fix or mitigation is available.

## Scope and safeguards

CodeMap reads source trees and may send selected code context to AI providers in
future integrations. Security-sensitive changes must preserve sandboxed path
validation, symlink protections, input limits, and explicit user control over
external data sharing. Never include credentials, proprietary source, or a live
target repository in a public report.
