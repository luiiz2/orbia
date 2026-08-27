# Test Suite Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the existing Orbia test suite by removing tests with no distinct, realistic regression value while preserving meaningful protection for data integrity, user workflows, security, persistence, and destructive operations.

**Architecture:** Audit the current tests in place and compare each candidate with the production behavior and neighboring tests. Delete only redundant or low-value test cases; do not add tests, create test files, rewrite production code, or replace deleted cases with equivalent cases. Keep the existing file organization and test harness unchanged.

**Tech Stack:** TypeScript, Vitest, Electron/React, ESLint, TypeScript compiler.

**Spec:** User request for whole-suite test reduction supplied in the current task.

## Global Constraints

- The final test count must be lower than the baseline count.
- Do not create tests or test files.
- Do not replace deleted tests with an equal or larger number of tests.
- Preserve business logic, critical workflows, data integrity, persistence, migrations, filesystem operations, parsing/import/export, synchronization, security/IPC, destructive behavior, and real regressions.
- Remove a test only when another test already protects the behavior or an important regression would not realistically reach a user undetected.
- Preserve all unrelated pre-existing worktree changes.
- Do not modify production code to keep a low-value test passing.

---

### Task 1: Establish the baseline and audit map

**Files:**
- Read: `test/**/*.test.ts`, `test/**/*.test.tsx`
- Read: production modules covered by the tests
- Read: `package.json`, `vitest.config.*`, `tsconfig*.json`, `eslint.config.*`

- [ ] **Step 1: Capture the current test inventory and exact baseline count**

Run:

```powershell
rg --files test | Sort-Object
npx vitest run
```

Record the number of test files, collected tests, failures, and any pre-existing failure separately from cleanup decisions.

- [ ] **Step 2: Classify each existing test before deletion**

For every candidate, assign one decision: `KEEP`, `MERGE`, `REMOVE`, or `IMPROVE`. Use `REMOVE` only for a test that is redundant, trivial, obsolete, mock-centric, implementation-specific, framework/third-party coverage, or otherwise low-value under the user rule. Since this task forbids adding tests, `MERGE` means delete weaker equivalent cases and keep the strongest existing case; it does not authorize writing a replacement.

### Task 2: Remove low-value cases in place

**Files:**
- Modify: only existing `test/**/*.test.ts` and `test/**/*.test.tsx` files containing confirmed candidates
- Do not create: any test file

- [ ] **Step 1: Delete confirmed redundant or low-value test blocks**

Use the smallest patch possible. Keep meaningful adjacent cases and existing setup. Do not change source code, fixtures, mocks, snapshots, or package configuration unless a deleted test leaves an actually unused test-only artifact that can be removed without affecting another test.

- [ ] **Step 2: Recount tests and inspect the deletion diff**

Run:

```powershell
npx vitest run
git diff -- test
git diff --check
```

Confirm the count decreased, every deletion has a documented rationale, no new test file exists, and the diff contains no production changes from this cleanup.

### Task 3: Validate the reduced suite and hand off findings

**Files:**
- Read: final `test/**/*.test.ts`, `test/**/*.test.tsx`
- Read: final diff and worktree status

- [ ] **Step 1: Run required validation**

Run:

```powershell
npx vitest run
npm run typecheck
npm run lint
```

If lint reports an unrelated pre-existing error, report its exact file and line without expanding scope to fix it.

- [ ] **Step 2: Produce the final report**

Report the exact tests-before count, tests-after count, number removed, main removal categories, commands and results, and any unrelated pre-existing issue. Do not claim success without fresh command output.
