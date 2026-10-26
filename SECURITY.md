# Security Policy

The Ghosttunes team takes security, privacy, and user data safety seriously. We appreciate your efforts to responsibly disclose vulnerabilities to us.

---

## Supported Versions

Only the latest release running on the `main` branch receives active security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## Reporting a Vulnerability

**DO NOT report suspected security vulnerabilities through public GitHub issues, discussions, or pull requests.**

To report a vulnerability:

1. **GitHub Security Advisory (Recommended):**
   Navigate to the repository's **Security** tab on GitHub and click **"Report a vulnerability"** to submit a private draft advisory.
2. **Direct Maintainer Contact:**
   If private advisories are unavailable, contact the repository maintainer directly through your private communication channel or maintainer profile.

### What to Include in Your Report:

To help us triage and resolve the issue quickly, please provide:
- A clear description of the vulnerability and its potential impact.
- Step-by-step reproduction instructions, Proof-of-Concept (PoC) code, or an isolated scenario.
- Information on the operating environment (Windows version, Node.js version, Electron version).
- Any proposed mitigations or patch suggestions if you have them.

---

## Response Process & SLAs

1. **Acknowledgment:** We aim to acknowledge receipt of security vulnerability reports within **48 hours**.
2. **Assessment & Confirmation:** We will investigate and assess the severity, communicating our assessment back to the reporter.
3. **Patch Development & Testing:** A fix will be developed in a private security branch and validated against our automated test suites.
4. **Coordinated Disclosure:** Once the fix is prepared and a new release is published, we will publicly credit the reporter (unless anonymity is requested).

---

## Guidelines for Responsible Research

- Do not attempt to access, modify, or delete data belonging to other users.
- Do not execute Denial of Service (DoS) attacks or degrade performance for community members.
- Give maintainers reasonable time to address the issue before publicly discussing any technical details.
