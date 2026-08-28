---
target: src/renderer/src
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-28T18-20-39Z
slug: src-renderer-src
---
Method: dual-agent (A: 038acd78-438f-4fcc-b1b3-ab0acc6bdc4d · B: a69f23f0-3b66-4789-8d55-08d1a7518252)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|:---:|---|
| 1 | Visibility of System Status | 3/4 | Async operations show loaders, but background AI/compression queues lack a unified status center. |
| 2 | Match System / Real World | 2/4 | English and Portuguese mixed across screens; technical storage jargon ("Local Ref", "Vault Staging"). |
| 3 | User Control and Freedom | 3/4 | Good modal escapes, but `ProfileOnboardingModal` hides dismiss buttons; no multi-step undo for library edits. |
| 4 | Consistency and Standards | 1/4 | `Sidebar.tsx` is completely bypassed by `AppShell.tsx`; raw emojis mixed with Lucide icons in TopBar. |
| 5 | Error Prevention | 3/4 | Course health auto-diagnostic prevents broken playback; inline title editing lacks confirmation/undo. |
| 6 | Recognition Rather Than Recall | 3/4 | Great visual covers & continue rail, but 8 player side-tabs crammed into 380px without clear grouping. |
| 7 | Flexibility and Efficiency | 3/4 | Excellent video player shortcuts (`J`/`K`/`L`, `B`), but bulk actions locked inside Studio view. |
| 8 | Aesthetic and Minimalist Design | 2/4 | 12 competing action buttons on CourseView; cliche orange-purple-blue gradients in headers. |
| 9 | Error Recovery | 3/4 | One-click course repairs & error boundaries; player errors still expose raw technical strings. |
| 10 | Help and Documentation | 3/4 | Interactive keyboard shortcuts cheatsheet (`?`); lacks contextual onboarding for Vault vs References. |
| **Total** | | **26/40** | **Acceptable (65%) — Substantial UX & Visual Polish Required** |

#### Design Specificity Verdict

**LLM Assessment**: Orbia possesses high domain utility (local streaming, SQLite catalog, offline AI), but suffers from **stylistic schizophrenia** between an entertainment streaming app (Netflix-style hero banners and rails) and an active pedagogical workstation. Navigation is fragmented (a full Sidebar component is unmounted while TopBar contains raw emojis `🎨` and `🗜️`), and high-density screens like `CourseView` suffer from severe feature creep (12 competing buttons).

**Deterministic Scan**: 38 anti-pattern findings across the renderer codebase:
- 7 instances of cliche AI linear gradients (`from-orange-500/20 via-purple-600/15 to-blue-600/10`)
- 9 non-interactive `<div onClick>` elements (curriculum lesson rows in `CourseView` and `PlayerView`, history rows) breaking keyboard navigation
- 18 icon buttons missing accessible `aria-label` tags
- 5 custom un-trapped overlay modals instead of standard Radix `<Dialog>` primitives
- 1 critical infinite skeleton state in `CourseView.tsx` when a course fails to load

#### Overall Impression
Orbia has a powerhouse offline engine and rich study capabilities, but its interface looks like a hybrid prototype that collected features quickly. Cleaning up AI gradients, streamlining navigation, reducing action clutter on the Course page, and making all rows keyboard-accessible will instantly elevate Orbia into a world-class desktop study station.

#### What's Working
1. **Ergonomic Video Player Engine**: Native keyboard shortcuts (`J`/`K`/`L`, `←`/`→`, `F`, `C`, `P`, `B`), subtitle auto-conversion, and multi-marker timeline.
2. **Proactive Diagnostics & Course Health**: Automated problem detection for 0-byte or missing files with one-click repair.
3. **Resilient Error Boundaries & Keyboard Cheatsheet**: Multi-layered recovery boundaries and interactive `?` modal.

#### Priority Issues
- **[P0] Navigation System Schism (Sidebar vs TopBar)**: `Sidebar.tsx` is completely unused while `TopBar.tsx` contains raw emojis (`🎨`, `🗜️`) and divergent routes.
  - *Fix*: Unify onto a single canonical navigation shell (sleek collapsible sidebar or clean topbar) with Lucide icons.
  - *Suggested Command*: `/impeccable layout`
- **[P1] Action Clutter on Course Detail View**: 12 competing buttons on `CourseView.tsx` cause severe decision fatigue.
  - *Fix*: Keep 1 Primary CTA (`Continuar Estudando`) and 1 Secondary; move secondary management actions into a single `...` dropdown.
  - *Suggested Command*: `/impeccable distill`
- **[P1] Non-Interactive Clickable Rows (`<div onClick>`)**: Curriculum lesson rows in `CourseView` and `PlayerView` cannot be navigated or activated via keyboard.
  - *Fix*: Refactor lesson items to semantic `<button>` or add `role="button"`, `tabIndex={0}`, and `onKeyDown`.
  - *Suggested Command*: `/impeccable harden`
- **[P2] AI Slop Gradient & Color Clutter Elimination**: Orange-to-purple-to-blue linear gradients and raw emojis erode perceived craft.
  - *Fix*: Adopt a calm, tactile palette (Sunset Orange + neutral slate/zinc dark surfaces) and replace emojis.
  - *Suggested Command*: `/impeccable quieter`
- **[P2] Player Side Panel Tab Overcrowding (8 Tabs -> 3 Modes)**: 8 horizontal tabs crammed in 380px cause overflow.
  - *Fix*: Group into 3 unified modes: `Conteúdo` (Aulas + Capítulos + Materiais), `Estudo` (Anotações + Cards + Marcadores), and `Transcrição & IA`.
  - *Suggested Command*: `/impeccable layout`

#### Persona Red Flags
- **Alex (Power User)**: Cannot multi-select or batch edit courses directly from the Home grid (must open Studio view); no single-key shortcut to switch player side tabs.
- **Jordan (First-Timer)**: Trapped in onboarding modal on first launch without a skip button; overwhelmed by 12 buttons upon opening their first course.
- **Sam (Accessibility)**: Unlabeled emoji buttons in TopBar; lesson rows in CourseView and PlayerView unreachable via Tab key; low-contrast micro-text (`text-[9px]`).

#### Minor Observations
- `CourseView.tsx:334` renders an infinite skeleton if a course fails to load or is deleted.
- 5 Discovery modals use raw `fixed inset-0` overlays without focus-trapping.

#### Questions to Consider
- What if Orbia embraced the calm, focused aesthetic of a personal knowledge workshop (like Obsidian or Craft) instead of a streaming platform?
- What if all background jobs (Transcription, Compression, AI Indexing) lived in a single quiet Status Bar popover?
