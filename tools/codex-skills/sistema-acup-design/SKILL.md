---
name: sistema-acup-design
description: UI/UX and visual design guide for Sistema Acup. Use when improving layout, CSS, responsiveness, interaction design, clinical workflow ergonomics, panels, sidebar, cards, reports, Biblioteca Viva, SuperAdm screens, maps, markers, forms, or visual polish in the Sistema Acup React frontend.
---

# Sistema Acup Design

## Design Intent

Design the app as a clinical productivity tool for repeated professional use: calm, clear, fast to scan, and trustworthy. Avoid landing-page composition, decorative excess, and generic Vite/template styling.

## Workflow

1. Read `references/design-system.md`.
2. Inspect existing UI in `frontend/src/App.css`, `frontend/src/index.css`, and the target panel/component.
3. Preserve the project identity: navy, gold, cream, compact clinical panels, readable forms, and restrained status indicators.
4. Build real controls and states; do not add in-app instructional marketing text.
5. Verify desktop and mobile layouts, especially text overflow, panel density, marker overlap, and sidebar behavior.

## Rules

- Prefer existing CSS variables and classes from `App.css`.
- Keep cards for actual grouped tools/items; do not nest cards inside cards.
- Use compact headings inside panels; reserve large type for true page-level moments.
- Make forms efficient: clear labels, stable widths, visible focus, no fragile layout shifts.
- For clinical reports, prioritize hierarchy, print/readability, and professional tone.
- For maps, keep markers visible but not visually dominant; selected markers need clear contrast and accessible labels.
- Remove or override generic template styles from `index.css` when they conflict with the app.

## Validation

Use `$sistema-acup-cli` for build/server commands, then inspect the app with the Browser plugin after meaningful UI changes.
