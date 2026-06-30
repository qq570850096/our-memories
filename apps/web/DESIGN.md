# Design

## System

Our Memories is a mobile-first product UI with a gentle private tone. The interface uses a restrained app structure with soft romantic accents, while avoiding stacked decorative panels on small screens.

## Color

The existing Tailwind theme in `app/globals.css` is the source of truth. Core roles:

- Background: `cream`, `paper`, `warm-cream`
- Text: `ink`, `slate`, `slate-soft`, `ink-soft`
- Primary emotional accent: `sakura`, `bloom`, `rose`
- Secondary functional accent: `mist`, `sky`, `mint`
- Borders and quiet surfaces: `dim`, `dim-soft`, `warm-border`

Use accents for selection, primary action, and emotional state. Do not add decorative gradient text or extra warm paper surfaces unless a ritual moment needs them.

## Typography

Use the app's current sans stack from `--font-sans`. Product screens should use fixed rem-based sizes, semibold headings, readable 14-16px body text, and compact metadata. Avoid display fonts in labels, buttons, filters, or navigation.

## Layout

Mobile screens prioritize one primary task at a time:

- Map: full-screen map with a compact identity header, one bottom information drawer, and persistent bottom navigation.
- Memories: list and filters in the content flow, with recording available as the bottom navigation primary action.
- Ritual features: available through secondary navigation unless the user enters that feature directly.

Bottom navigation has four thumb-friendly targets: map, memories, record, more. Secondary destinations live behind more to keep the main loop clear.

## Components

- Cards use 8px radius or less unless inherited component behavior requires otherwise.
- Floating controls are reserved for desktop or a single mobile context control.
- Mobile overlays should be bottom-reachable and not cover the primary content by default.
- Forms use visible labels, 44px minimum touch targets, and sticky save actions inside long modal content.

## Motion

Motion should indicate state or transition only. Keep app UI transitions short, around 150-250ms, and avoid page-load choreography. Respect reduced motion through existing component behavior and avoid gating content visibility on animation.
