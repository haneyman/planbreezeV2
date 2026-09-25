# 03 — Design system

PlanBreeze has its own light, warm consumer identity. It is independent of any other brand or design system.

## Personality
Airy, warm and unhurried: a paper planner on a breezy day. Calm confidence, no urgency. Copy is plain, friendly and in sentence case, with no emoji.

## Color tokens

| Token | Hex | Use |
|---|---|---|
| `ground` | `#F6F3EC` | Page background (warm paper) |
| `ground-raised` | `#FBF9F4` | Sidebar, secondary panels |
| `surface` | `#FFFFFF` | Cards |
| `line` | `#E4DFD4` | Borders, dividers |
| `line-strong` | `#D6D0C3` | Input and outline-button borders |
| `ink` | `#1D2733` | Primary text |
| `ink-2` | `#3A4552` | Secondary text |
| `muted` | `#5B6572` | Captions (≥ 4.5:1 on white and ground) |
| `sea` (primary) | `#24506B` | Committed bars, primary buttons, links |
| `sea-deep` | `#163A50` | Text on sea tint, link hover |
| `sea-tint` | `#E3EEF4` | Selected nav, chips, info pills |
| `coral` | `#D9774A` | Radar borders (dashed), Today marker, Breeze sparkle |
| `coral-ink` | `#8A3A17` / `#9A4520` | Text on coral tint, radar labels |
| `coral-tint` | `#FBEDE4` | Radar fill, "new" badges |
| `sage` | `#2C6B49` / `#3F7A5A` | "Free" / fits / success |
| `sage-tint` | `#E6F0EA` | Success pill background |
| Toggle track off | `#C9C2B4` | |

**Committed vs radar** uses fill style (solid vs dashed outline), color and lightness (dark blue vs light coral). It never relies on hue alone.

**Person colors** (avatars): `#24506B`, `#6B4F99`, `#3F7A5A`, `#A35A16`, `#A0445B`, `#46698F`, `#7A6A3A`, all with white initials at ≥ 4.5:1.

Dark mode: not designed yet (open question Q-9).

## Typography

| Role | Font | Size / weight |
|---|---|---|
| Display / page titles | **Fraunces** (Google Fonts) | 32–34 px / 600, letter-spacing −0.015em |
| Section / card titles | Fraunces | 20–22 px / 600 |
| UI & body | **DM Sans** (Google Fonts) | 13–15 px / 400–700 |
| Lane labels | DM Sans | 11 px / 700, uppercase, +0.08em tracking |
| Captions | DM Sans | 12–13 px / 400–600, `muted` |

## Spacing, radius, elevation
- 4 px base grid. Common gaps are 8, 12, 16, 20 and 28.
- Radius: 8 px for bars, 10–12 px for buttons and inputs, 14–16 px for cards, 999 px for pills, chips and avatars.
- Elevation: cards are flat with a 1 px `line` border. Popovers use `0 16px 40px rgba(29,39,51,.24)`.
- Minimum touch target 44 px (36 px allowed for dense secondary buttons on desktop).

## Layout
- Desktop shell: 232 px sidebar, fluid main area, 360–380 px right panel (Ask Breeze / watching).
- Design widths: 1440 px desktop, 390 px mobile.

## Components (build list)

| Component | Variants / notes |
|---|---|
| Button | primary (sea), secondary (outline), tint (sea-tint), radar (coral dashed), ghost |
| Segmented control | timeframe zoom, lane choice (Radar / Committed) |
| Person chip | toggle (pressed / unpressed at 50% opacity), with avatar |
| Avatar | initials, color, stack with −6 px overlap |
| Timeline | tick header, Today marker, lanes, plan bar (committed / radar / selected ring), outside label, month cluster (Year+) |
| Plan detail panel | status badge, meta row, people, actions by status |
| Suggestion card | compact (side panel), result card (chat), discover card |
| Fit line | green = fits, amber = conflict, blue = interest |
| Switch | `role="switch"` button, 44×26 |
| Calendar connection row | connected / available / error states |
| Capture card | extension popover and mobile bottom sheet share the same fields |
| Chat bubble | user (sea, right), Breeze (sparkle avatar, left) |
| Breeze noticed card | up to 3 nudges |

## Iconography
24 px grid, 1.8 px stroke, round caps and joins, `currentColor`. The screens use hand-drawn inline SVG. For production, adopt **Lucide** or **Phosphor (regular)** and map each icon: calendar, radar/target, sparkle, plus, users, link, mail, map-pin, clock, check, arrow-right, camera, phone, browser.

Logo mark: three wind strokes (two sea, one short coral).

## Motion
Functional only: 150–200 ms ease-out for zoom transitions (bars animate position and width), panel open/close and toggles. Respect `prefers-reduced-motion`.

## Copy guidelines
- Sentence case everywhere ("Commit & add to calendar").
- Breeze speaks in first person, briefly: "I found three tastings…", "I'll remind you when tickets open."
- Name the fit explicitly: "You and Dana are free", "Overlaps Napa weekend with the Parks".
- Never create pressure ("Only 2 left!").
