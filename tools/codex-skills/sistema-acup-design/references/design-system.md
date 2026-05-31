# Sistema Acup Design System

## Product Feel

Sistema Acup should feel like a careful clinical workstation:

- calm, organized, and reliable;
- dense enough for professional workflows;
- warm enough for a health context;
- never flashy, salesy, or decorative for decoration's sake.

## Current Palette

Primary variables in `frontend/src/App.css`:

```css
--navy: #061a31;
--navy-2: #082946;
--navy-3: #0c365c;
--gold: #d5a33b;
--gold-2: #f0bd53;
--cream: #f6f1e8;
--line: rgba(213, 163, 59, .24);
--soft: #fffaf0;
--glass: rgba(9, 38, 66, .72);
--glass-2: rgba(255, 255, 255, .055);
--ink-soft: rgba(255,255,255,.72);
```

Use this as the brand base. Add neutral grays and semantic states only when needed. Avoid turning the UI into a one-note beige/gold page; navy and white panels should balance the cream base.

## Typography

- Use system sans for UI.
- Existing logo uses Georgia-like serif; keep that as branding, not general panel typography.
- Do not scale font sizes with viewport width.
- Avoid negative letter spacing.
- Use compact panel headings and readable form text.

## Layout

- Sidebar width is about 268px and fixed on desktop.
- Main work surfaces should be scan-friendly, with predictable grids and restrained spacing.
- Cards should have radius around 8px unless matching an existing local class.
- Avoid nested cards; use sections, grids, and dividers instead.
- Keep mobile layouts single-column with stable controls and no text overlap.

## Components

Use existing classes before inventing new ones:

- `.box`
- `.tech-card`
- `.tag`
- `.tag.active`
- `.security-card`
- `.quiet-button`
- `.start-panel-head`
- admin grids and status classes in `SuperAdminPanel.jsx`

When a new component is needed:

- create stable dimensions for icon buttons, markers, cards, and fixed-format controls;
- include hover/focus states;
- keep labels concise;
- avoid visible explanation text about how the UI works unless it is clinically necessary.

## Clinical Screens

For anamnesis, pulse, tongue, diagnosis, protocol, evolution, and report:

- prioritize speed of entry and review;
- keep selected states obvious;
- keep warnings/safety alerts visually distinct;
- preserve professional review language;
- avoid hiding important clinical context behind decorative UI.

## SuperAdm Screens

SuperAdm is an operational admin tool:

- use dense tables/lists and filters;
- make risky actions explicit;
- keep audit, password, active/suspended states legible;
- avoid playful or marketing visuals.

## Biblioteca Viva

Biblioteca Viva is a curation workspace:

- show status: draft, review, approved, retired;
- surface sources and review notes;
- keep imported data visually separate from approved clinical knowledge;
- make export/review workflows obvious without clutter.

## Maps

Coordinate with `$sistema-acup-map` for marker logic.

Design rules:

- Markers should not hide anatomical landmarks.
- Selected marker: stronger contrast, slightly larger, clear label/title.
- Dense maps need filtering/search, not huge always-visible labels.
- Use colors consistently for draft/approved/confidence states.
- Verify map panels at desktop and narrow widths.
