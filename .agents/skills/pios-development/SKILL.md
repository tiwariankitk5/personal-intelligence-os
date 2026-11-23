---
name: pios-development
description: Implement and validate bounded features or fixes in the personal-intelligence-os repository, using its existing Python, Next.js and local Compose workflows.
---

# PIOS development

Work from the repository root containing frontend/, backend-python/ and AGENTS.md. Read AGENTS.md and the short docs/HANDOFF.md once; inspect only requirements relevant to the user's milestone.

- Locate affected code with targeted rg searches. Reuse existing components and scripts. Avoid repeatedly reading entire files, generated assets, screenshots or full logs.
- Separate an implementation issue from a missing local prerequisite before editing. Existing Docker containers may belong to another project; use this repository's Compose project and mapped ports.
- For verification run scripts/verify-pios.ps1 with frontend, backend or full scope. Use -Plan to inspect commands without executing. Add -Build when production compilation matters, -Audit for dependency changes and -Smoke for account/API/migration changes against a running local stack. Smoke creates two test accounts and never calls paid providers.
- The runner keeps full logs in ignored .validation/ and prints failure tails. Read a specific log only when the summary is insufficient. Resolve the cause before repeating expensive checks; do not rebuild unchanged containers merely for reassurance.
- For UI changes check the affected browser flow after automated checks. Physical stylus behavior and final exported artifacts require their own evidence; do not infer these from desktop tests.
- Preserve the invariants in AGENTS.md. For security/deployment work consult PRODUCTION_READINESS.md; for editor behavior and known limits consult docs/EDITOR_VALIDATION.md. Neither needs loading for unrelated tasks.
- At a milestone boundary replace stale status in docs/HANDOFF.md with branch, exact verification, remaining blockers and next step. Keep it short and free of credentials. Report actual completion rather than the whole roadmap.
