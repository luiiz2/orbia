# Commit and Pull Request Prompt Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add centralized, task-specific instructions to the existing AI chat path so commit messages and Pull Request titles/descriptions are based on the real change and follow the requested concise formats.

**Architecture:** Reuse the existing `AiCoreService.chat()` route and provider adapters. A small prompt module will insert a specialized system message for `commit` or `pull_request` requests, while ordinary chat messages remain unchanged. The IPC contract will validate the optional prompt kind before the request reaches Main, proving that the rules are part of the final provider payload.

**Tech Stack:** Electron Main/preload IPC, TypeScript, native arrays/strings, Vitest.

**Spec:** User-provided commit and Pull Request prompt requirements in the current task context, plus `C:\Users\Dell\.codex\attachments\b113981c-7c25-4bf0-beb3-650d236a3bf9\pasted-text.txt` for the permanent test-creation policy.

## Global Constraints

- Preserve the existing generic chat behavior when no specialized prompt kind is requested.
- Centralize shared change-description/output rules; do not create a second AI/provider architecture.
- Do not change provider payloads, privacy checks, credentials, settings storage, or unrelated product behavior.
- Never ask the model to invent files, tests, behavior, risks, or changes not present in the supplied context.
- Keep the test suite small: add only tests that prove prompt construction and delivery to the provider.
- Preserve all pre-existing working-tree changes, including the current AI foundation and `vazados/`.

---

### Task 1: Add failing tests for specialized prompt delivery

**Files:**

- Create: `test/ai-prompts.test.ts`
- Modify: `test/ai-core.test.ts`
- Modify: `test/ai-ipc.test.ts`

**Interfaces:**

- The tests will define the required observable contract for `AiPromptKind`, prompt-message construction, final provider messages, and IPC validation.

- [x] **Step 1: Add a pure prompt test** that sends an existing system message plus a user message through the prompt builder and expects one additional system message containing the commit rules, including Conventional Commits, no final period, real-change grounding, and generic-message avoidance.
- [x] **Step 2: Add a PR prompt test** that expects the final system message to require a concise title, objective description, tests, relevant risks/limitations, the preferred Markdown headings, and no invented facts.
- [x] **Step 3: Add an AI-core delivery test** that configures a local fake provider, calls `AiCoreService.chat()` with `promptKind: 'commit'`, and asserts the fake provider receives the specialized system message. Also assert that a normal chat request receives its original messages unchanged.
- [x] **Step 4: Add an IPC boundary assertion** that a valid `promptKind: 'pull_request'` reaches the core and an unknown prompt kind is rejected before invocation.
- [x] **Step 5: Run `npx vitest run test/ai-prompts.test.ts test/ai-core.test.ts test/ai-ipc.test.ts` and confirm the new tests fail because the prompt kind and builder do not exist yet.

### Task 2: Implement the minimal shared prompt path

**Files:**

- Create: `src/main/services/ai/ai-prompts.ts`
- Modify: `src/types/ai.ts`
- Modify: `src/main/services/ai/ai-core.service.ts`
- Modify: `src/main/services/ai/index.ts`
- Modify: `src/main/ipc/ai.ipc.ts`

**Interfaces:**

- `AI_PROMPT_KINDS` and `AiPromptKind` expose `commit` and `pull_request`.
- `buildAiPromptMessages(messages: AiChatMessage[], promptKind?: AiPromptKind): AiChatMessage[]` returns the original messages for ordinary chat and inserts one system instruction message for specialized generation.
- `AiChatRequest.promptKind` is optional and remains inside the Main-process AI contract.

- [x] **Step 1: Add `AI_PROMPT_KINDS`, `AiPromptKind`, and optional `promptKind` to `AiChatRequest` in `src/types/ai.ts` without changing existing route tasks.
- [x] **Step 2: Implement `ai-prompts.ts` with one shared change-grounding rule block and two task-specific blocks. The commit block must require short objective one-line output, the real change/intention, no generic wording, no final period, no unnecessary file list, and Conventional Commits with the allowed types and examples. The PR block must require a short non-generic title without a final period and a concise description with `## O que mudou`, `## Testes`, and conditional `## Observações`, reporting only facts supplied by the caller.
- [x] **Step 3: Insert the specialized system message after any existing system messages in `AiCoreService.chat()` and pass the resulting messages to the existing provider adapter. Leave messages untouched when `promptKind` is absent.
- [x] **Step 4: Validate `promptKind` in `parseChatInput()` and preserve it in the typed request; export the prompt helper through the existing AI barrel.
- [x] **Step 5: Run the three focused test files and confirm they pass.

### Task 3: Persist the permanent test-creation rule for project agents

**Files:**

- Modify: `AGENTS.md`

**Interfaces:**

- The project instruction file will contain the durable policy from the attached context; no production API or runtime behavior changes.

- [x] **Step 1: Add a concise permanent test policy near the existing testing standards: audit existing coverage first, classify keep/merge/remove/improve, create tests only for meaningful regression protection, prefer extending/merging existing tests, avoid test-per-function and coverage-count goals, and delete redundant/obsolete tests.
- [x] **Step 2: Re-read the section and confirm it does not require automatic test creation for trivial changes or duplicate existing coverage.

### Task 4: Review and verify the integrated result

**Files:**

- Review only the files changed by Tasks 1–3; do not clean up unrelated working-tree files.

- [x] **Step 1: Run `git diff --check`, `git diff --stat`, and inspect the complete diff for the owned files. Confirm pre-existing AI foundation changes and `vazados/` remain intact.
- [x] **Step 2: Verify the final flow: typed IPC payload → `parseChatInput()` → `AiCoreService.chat()` → `buildAiPromptMessages()` → provider adapter `chat()` payload.
- [x] **Step 3: Run `npx vitest run test/ai-prompts.test.ts test/ai-core.test.ts test/ai-ipc.test.ts`.
- [x] **Step 4: Run `npm run typecheck` and `npm run lint`; run `npm run build` if the targeted changes pass and the existing dirty AI foundation allows it.
- [x] **Step 5: Record any failures that predate this change separately from failures caused by the prompt work; do not mask unrelated working-tree issues.
