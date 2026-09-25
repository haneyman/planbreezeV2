# Design

## How to view

- **Quickest:** open `index.html` in a browser for a gallery of every screen, with screenshots and links to the live, clickable versions.
- **Clickable screens:** open any `screens/*.dc.html` file directly in Chrome, Safari or Firefox. The sidebar links move between screens, and buttons, toggles and zoom controls work. An internet connection is needed only for the Google Fonts (Fraunces, DM Sans).
- **Static images:** `screenshots/*.png` (rendered at 2x).
- **Original canvas:** the private "PlanBreeze" design canvas in the work Claude account. This folder's copy is now the source of truth.

`screens/support.js` is a small local preview runtime that lets the `.dc.html` design files run outside the Claude canvas. It is a review tool, not production code.

## Screen inventory

| File | Screen | What to look at | Interactive bits |
|---|---|---|---|
| `Main.dc.html` | **Planner** | Zoomable timeline, committed vs radar lanes, circle filter, plan detail, Breeze noticed, Ask Breeze side panel with suggestions | Zoom presets (Month / 2 months / Quarter / Year+), **Me + circle chips** (Family, Weekend crew, Wine club), click any bar; the detail panel shows the plan's circle and which calendar a commit uses, **Commit & add to calendar** moves a radar item, **Add to radar** on suggestions adds it to the timeline |
| `Assistant.dc.html` | **Ask Breeze** | Chat answering "find a wine tasting event in October" with calendar-fit lines, free-Saturdays answer, standing searches, learned interests | Add to radar, "Yes, keep watching", standing-search switches |
| `Capture.dc.html` | **Add from anywhere** | Browser-extension popover reading an event page; the other capture channels | Radar / Committed toggle, **Circle picker** (shows which calendar a commit uses), Save, Undo |
| `Discover.dc.html` | **Discover** | Suggestions grouped by reason (this weekend / Europe trip / wine), conflict flags | Filters, Add to radar, Not for us |
| `Settings.dc.html` | **Calendars & circles** | Google connected with sub-calendars; Apple, Yahoo, Outlook connect; sync rules; **list of circles**, each with members (email + label + access) and an optional linked calendar | Expand a circle, change its linked calendar, add a person (email + label), **New circle** form (name, linked calendar, people rows) creates a circle; see `screenshots/Settings-new-circle.png` |
| `Mobile.dc.html` | **Mobile share sheet** | Sharing an email to PlanBreeze on a phone | Radar / Committed, Circle picker, Save |

All names, venues, prices ("[PRICE]") and events are sample data.

## Known design issues (to resolve before or during Phase 1)

| # | Issue | Proposed fix |
|---|---|---|
| D-1 | Very short plans (one day at 2-month zoom) draw as small blocks with the label beside them. Labels can crowd neighboring bars. | Draw single-day plans as a dot + label chip. Add collision checks for label boxes, not only bars. |
| D-2 | At **Year+** zoom every plan gets its own row, so the radar lane is pushed below the fold (see `screenshots/Main-year.png`). | Month clusters for single-day plans ("Oct · 6") that expand on click. Keep multi-day trips as bars. Spec 1.6. |
| D-3 | The Today line runs through the lane headings. | Start the line below the headings, or break it behind heading text. |
| D-4 | Sidebar "Calendars" status card wraps awkwardly at 232 px. | Shorten to "Google · 2m ago" or stack the time below. |
| D-5 | Empty, loading, error and first-run states aren't designed. | Add in Phase 0/1: empty timeline, no calendar connected, sync error, no suggestions yet. |
| D-6 | Mobile is covered only by the share sheet. | Design a mobile agenda view of the Planner (spec 1.14) before Phase 5. |
| D-7 | No onboarding screens. | Design connect → interests → invite → first capture (spec 7.2) in Phase 3. |
| D-8 | Plan editing (create/edit form, fuzzy dates) isn't drawn. | Design with Phase 1. |

## Visual language
See `../docs/03-design-system.md` for tokens, type, components and copy rules.
