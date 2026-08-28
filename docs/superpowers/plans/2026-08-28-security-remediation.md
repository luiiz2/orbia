# Security remediation implementation plan

## Goal

Remediate the five findings from the security audit without changing unrelated behavior:

1. Require explicit data classification and privacy authorization before cloud AI requests.
2. Restrict vault deletion to registered, validated vault directories.
3. Validate lesson deletion and reorganization paths in Main and bind reorganization application to a generated plan.
4. Restrict `system:open-path` to trusted, non-link content files.
5. Replace legacy raw-path import/read flows with Main-issued capabilities or registered paths, and bind organization-plan application to Main-generated plans.

## Approach

- Add focused regression tests for each boundary and run them red before production changes.
- Reuse existing Main-process registries, database ownership, and import/session architecture.
- Keep physical file mutations behind canonical path checks and reject renderer-supplied paths that lack provenance.
- Preserve existing local workflows and renderer contracts where possible, changing only the legacy multi-course flow needed to carry an opaque scan capability.
- Run affected tests, the full Vitest suite, typecheck, build, and a final diff/static review.

## Implementation sequence

1. Add failing tests for AI privacy, vault deletion, filesystem mutations, shell opening, legacy imports/SRT reads, and organization-plan provenance.
2. Implement shared path validation and the smallest Main-only guards in the affected services and IPC handlers.
3. Update the multi-course import caller to use the new opaque scan token and remove raw-path fallbacks.
4. Verify behavior and review only the files touched by this remediation.

## Validation

- Targeted Vitest suites must pass after each cohesive change.
- `npx vitest run`, `npm run typecheck`, and `npm run build` must pass before completion.
- Confirm no sensitive path or cloud request can bypass the new provenance/consent checks through the legacy IPC shapes.
