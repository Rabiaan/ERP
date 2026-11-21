# Lilac Office ERP — Target Design (Pillio-based)

Version 2.0 · Desktop-first, responsive · Lavender canvas, white floating panels, one lilac gradient hero, one black CTA

This is the visual source of truth for Lilac Office. It restyles the ERP dashboard to follow the Pillio design language — soft lavender canvas, floating rounded panels, a single purple gradient hero card, hatched "not-yet" patterns, pill shapes, and one black CTA — while keeping Lilac's ERP content (KPIs, approvals, leave, headcount, activity).

---

## Contents

1. Gap analysis — current Lilac vs target
2. Design principles
3. Foundations — color, type, spacing, icons
4. Layout
5. Components
6. States and motion
7. Accessibility
8. Content
9. Tokens — CSS, Tailwind 3, Tailwind 4
10. Dashboard restyle prompt
11. Do / Don't
12. Multi-tenant ERP notes

---

## 1. Gap Analysis — Current Lilac vs Target

### 1.1 Side-by-side

| Area | Current Lilac | Target (Pillio-style) | Fix |
| --- | --- | --- | --- |
| Canvas | Flat near-white `#FAF9FD` | Soft lavender gradient `#F4F3FB → #ECEBF8` | Apply gradient to app background |
| Shell | Sidebar and top bar are full-bleed, separated by 1px borders | Floating white sidebar panel (radius 24) inset 16px from the viewport; top bar has no border and sits directly on the canvas | Remove header bottom border and sidebar right border; add outer padding + radius |
| Sidebar active state | Tinted bg + 3px violet bar on the left edge | Full-width pill (`#F4F3FB`), bold text, no accent bar | Drop the accent bar; use pill |
| Sidebar sections | Uppercase, tracked labels (OVERVIEW, PEOPLE…) | Quieter: sentence case or small-caps 11px, ink-300, more spacing; or hide labels and group with spacing | Lighten label style |
| Brand color | Saturated violet `#6D28D9` everywhere (buttons, links, charts, nav) | Softer periwinkle `#8D86EA` / `#7A72DD`, used mainly for the hero card, progress, and selected states | Re-map brand tokens (§9) |
| Primary CTA | Violet rectangle (radius 12), two violet buttons in header (Create + Add Employee) + Approve ×3 | One black pill CTA per screen (Add Employee); other actions secondary/ghost | Make Add Employee black pill; demote Create; Approve → small black pill |
| Page header | "Executive Overview" 30/700 bold + subtitle | Friendly greeting "Good morning, Tariq" 32/500, optional subtitle beneath in ink-500 | Lighter weight, personalized |
| KPI cards | 8 equal white cards: UPPERCASE label, 44px colored icon tile top-right, 36/700 value, bordered delta pills, sparkline | 1 hero gradient card + calm white cards: small gray title with inline icon, 40–44/500 value with lighter unit, text deltas, ⋯ menu, no colored icon tiles | Restructure per §5.4–5.5 |
| Delta pills | Bordered pills in 4 colors (green/red/amber/gray) → visually noisy | Soft tinted text chips, no border; color only when meaningful | Remove borders; reduce to 3 states |
| Cards | Radius 20, 1px border, tiny shadow | Radius 24, no border, soft shadow, optional frosted white (72%) | Update card base class |
| Card titles | 20/600 dark, large | 13–15/500; KPI titles gray, chart titles ink-900 15/500 | Downsize; weight 500 |
| Weekly attendance chart | Plain solid violet bars, y-axis 80–100 | Pill bars: past days solid light gray-lilac, today solid primary, future/partial hatched | Rebuild as pill bars with hatch |
| Headcount line chart | Dots on every point, heavy line, hard gridlines | Soft line + gradient area fill, dots only on hover/last point, very light dashed grid | Restyle |
| Leave donut | Thick donut, saturated colors | Thinner ring (~14px), rounded caps, softened palette, total in center | Restyle |
| Dept. progress bars | Thin 8px bars | 10px pill bars, track with faint hatch | Minor |
| Pending approvals | Dense list, bordered reason box, red-outline Reject + violet Approve | Alert-row style: tinted icon tile, title/sub, trailing action; muted reason box (no border); Approve = black pill, Reject = ghost | Re-skin; see §5.8 |
| Milestones | Bordered tiles with lilac date pills | surface-muted tiles, avatar + circular action button, optional week strip with selected-date ring | Optional upgrade |
| Links | 18px violet "All requests", "Audit Log →" | 13–14/500 white pill buttons ("View All") with 1px border | Downsize; pill style |
| Typography weights | Heavy (600–700 everywhere) | Light-medium (400–500), hierarchy via size and color | Reduce weights globally |
| Hatched pattern | Not used | Used for missed/future/unfilled states | Add `.hatch` utility |

### 1.2 Bugs to fix regardless of restyle

- **Clipped text in Recent Activity** — "Annual Lea", "Gross P", "Zero Downtime Archit" cut mid-word → `line-clamp-2` + ellipsis, or allow wrap.
- **Approval reason box clips** ("…bed rest.") → let it grow (max 3 lines).
- **Payroll KPI crowding** — "Rs 16,850,000" collides with its delta pill → 32px value or compact Rs 16.85M + tooltip.
- **Attrition delta** — a down arrow is shown green: add good/bad semantics separate from direction.
- **Attendance y-axis starts at 80** → exaggerates variance; annotate or start at 0.
- **Sidebar footer overlaps nav scroll** → add bottom padding to nav equal to footer height.
- **Sparklines on KPI cards** are decorative/no tooltip → make data-driven with tooltip or remove.

### 1.3 Suggested order of work

- **P0 (1–2 hrs, biggest visual win):** canvas gradient, card radius/border/shadow, color token swap, black CTA, font weights, remove header/sidebar borders.
- **P1 (half day):** floating sidebar + pill active state, hero gradient KPI card, KPI card restructure, attendance pill bars, approvals re-skin.
- **P2 (polish):** hatched patterns, line/donut restyle, week-strip milestones, motion, skeletons.

---

## 2. Design Principles

- **Calm over corporate** — soft gradients, whitespace, rounded shapes.
- **One hero** — exactly one gradient card per view, for the most important metric.
- **Glanceable** — one number or status per card.
- **Status by color + shape + pattern** — red/amber icon tiles; hatched = not-yet/missed.
- **One strong action** — one black pill CTA.
- **Soft layers** — white cards floating on lavender; separation by contrast, not borders.

---

## 3. Foundations

### 3.1 Color

| Token | Hex | Usage |
| --- | --- | --- |
| `--canvas-start` | `#F4F3FB` | Background gradient start |
| `--canvas-end` | `#ECEBF8` | Background gradient end |
| `--surface` | `#FFFFFF` | Cards, sidebar |
| `--surface-glass` | `rgba(255,255,255,.72)` | Frosted variant (top bar search, optional cards) |
| `--surface-muted` | `#F6F5FB` | Inner tiles, reason boxes, chips |
| `--primary-100` | `#E7E5FB` | Selected ring fill, count badges |
| `--primary-400` | `#A39DF2` | Gradient top |
| `--primary-500` | `#8D86EA` | Brand, today bar, progress fill |
| `--primary-600` | `#7A72DD` | Gradient bottom, links, pressed |
| `--primary-700` | `#5F57C4` | Text-on-light links (AA contrast) |
| `--ink-900` | `#0E0E12` | CTA, titles |
| `--ink-700` | `#2A2A33` | Body |
| `--ink-500` | `#7C7C8A` | Secondary |
| `--ink-300` | `#B9B9C6` | Axis labels, inactive nav, disabled |
| `--border` | `#ECEBF3` | Dividers, list-tile outlines (use sparingly) |
| `--danger` / `--danger-bg` | `#E5484D` / `#FDECEC` | Critical, rejected, missed |
| `--warning` / `--warning-bg` | `#F5B544` / `#FFF4DC` | Pending, medium urgency |
| `--success` / `--success-bg` | `#2FA36B` / `#E6F6EE` | Positive delta, approved |

**Data-viz palette (softened):** violet `#8D86EA` · sky `#6CC3F0` · emerald `#4CC9A0` · amber `#F5C25B` · pink `#F28BB8` · slate `#9AA3B5`. Keep each department/leave type on the same color everywhere.

**Gradients**

```css
--gradient-canvas: linear-gradient(135deg, #F7F6FC 0%, #ECEBF8 100%);
--gradient-hero:   linear-gradient(160deg, #A9A3F5 0%, #7F77E0 100%);
```

**Hatch pattern (future / missed / unfilled)**

```css
--hatch: repeating-linear-gradient(135deg, rgba(14,14,18,.14) 0 1.5px, transparent 1.5px 5px);
--hatch-on-primary: repeating-linear-gradient(135deg, rgba(255,255,255,.38) 0 1.5px, transparent 1.5px 5px);
```

### 3.2 Typography

**Family:** Inter (or Manrope / Plus Jakarta Sans). Tabular numerals on all figures.

| Role | Size / Line | Weight | Color |
| --- | --- | --- | --- |
| Page greeting | 32 / 40 | 500 | ink-900 |
| Page subtitle | 14 / 20 | 400 | ink-500 |
| Hero metric | 44 / 48 | 500 | white (unit part 70% opacity) |
| KPI value | 40 / 44 | 500 | ink-900 |
| KPI title | 13 / 18 | 500 | ink-500 |
| Chart card title | 15 / 20 | 500 | ink-900 |
| Card subtitle | 12 / 16 | 400 | ink-500 |
| List title | 14–15 / 20 | 500 | ink-900 |
| List meta | 12 / 18 | 400 | ink-500 |
| Caption / axis | 11 / 14 | 400 | ink-300 |
| Nav item | 14 / 20 | 400 (active 500) | ink-500 (active ink-900) |
| Button | 14 / 20 | 500 | white / ink-900 |

### 3.3 Spacing, radius, elevation

- **Spacing (4px base):** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40. Card padding 20, grid gap 16–20, inner list gap 12.
- **Radius:** 8 (chips) · 14 (tiles) · 24 (cards, sidebar) · 999 (buttons, pills, bars, search).
- **Shadow:** `0 1px 2px rgba(30,25,80,.04), 0 8px 24px rgba(30,25,80,.05)`. No card borders by default.

### 3.4 Iconography

Line icons, 1.5px stroke, rounded caps, 18–20px (Lucide / Phosphor Regular). Inherit text color. Tinted rounded-square icon tiles (40px, radius 12) only in alert/approval rows.

---

## 4. Layout

```text
┌────────────┬──────────────────────────────────────────────────────────┐
│ floating   │ [ search pill ⌘K ]              (chat) (bell²) [TM name ▾]│
│ sidebar    │ Good morning, Tariq                        [ + Add Employee ]│
│ (white,    │ ┌ HERO ┐ ┌ KPI ┐ ┌ KPI ┐ ┌ KPI ┐                           │
│  r=24)     │ │gradient│ ...                                              │
│            │ ┌── Headcount trend (2/3) ──┐ ┌── Approvals (1/3) ──┐       │
│            │ ┌ Attendance ┐┌ Leave ┐      ┌── Milestones ───────┐       │
│            │ ┌── Dept breakdown ───────┐  ┌── Recent activity ──┘       │
└────────────┴──────────────────────────────────────────────────────────┘
```

- **App shell:** canvas gradient; 16px outer padding. Sidebar 260–280px, white, radius 24, floating. Top bar transparent, 64px, no border.
- **KPI area:** 4-column grid. Card 1 = hero gradient card spanning 1 col × 2 rows (or 2 cols × 1 row) showing the key metric — recommended: Present Today (16 / 47) with hatched progress. Remaining 7 KPI cards fill the grid.
- **Main split:** `minmax(0,2fr) minmax(0,1fr)`, gap 20.
- **Responsive:** ≥1280 full; 1024–1279 sidebar → icon rail, right column stacks; 768–1023 two columns; <768 single column + bottom tab bar, FAB replaces Add Employee.

---

## 5. Components

### 5.1 Sidebar (floating)

White, radius 24, padding 16, inset 16px from viewport edges, full height minus inset.

- Logo tile 40px (primary-500 gradient, radius 12) + "Lilac Office" 18/500 + small ERP chip (surface-muted).
- Group labels: 11px, ink-300, no uppercase tracking (or hide); 20px top margin.
- Item: 40px high, radius pill, icon 18 + 12 gap + label. Active: bg `#F4F3FB`, text ink-900, weight 500. Hover `#F8F7FD`. No left accent bar.
- Count badge (Leave 4): 18px pill, primary-100 bg, primary-700 text.
- Footer user card: surface-muted, radius 16, avatar + name + role; "Demo role: Super Admin" as a small pill menu.

### 5.2 Top bar

- Search: frosted pill (44px), icon left, ⌘K kbd chips right.
- Icon buttons: 40px white circles (chat, bell); bell badge = 16px danger circle, white 10px/600.
- User chip: 36px avatar + name (14/500) + handle/role (12/ink-500) + chevron. The "Super Admin" shield chip moves into the user menu.

### 5.3 Buttons

| Variant | Style |
| --- | --- |
| Primary (CTA) | bg ink-900, white text, height 48, px 24, pill, leading + icon. Hover `#1C1C24`; pressed `scale(.98)`. One per screen (Add Employee). |
| Primary-small | Same, height 32, px 14, 13px — used for Approve |
| Secondary | white, 1px border, ink-900, pill, height 32–40 — Generate Report, View All |
| Ghost | transparent, ink-500, hover surface-muted — Reject, Order/Details-style actions |
| Create | Convert to a + circular icon button in the top bar (opens a menu) so it doesn't compete with the CTA |
| Focus | 2px primary-500 ring, 2px offset |

### 5.4 Hero KPI card (gradient)

- `--gradient-hero`, radius 24, padding 20, white text.
- Header: icon + "Present today" (white 80%), ⋯ right.
- Metric: 16 at 44px + /47 lighter (70%).
- Right meta: "94% rate" 14/500 and "vs 91% yesterday" 12/70%.
- Progress bar: 14px pill; filled = solid white (≈34%), remainder = `--hatch-on-primary`.
- `role="progressbar"`, `aria-valuenow=16`, `aria-valuemax=47`.

### 5.5 Standard KPI card

White, radius 24, padding 20, shadow.

- Header: 18px gray line icon + title (13/500 ink-500) · ⋯ right.
- Value 40/500 (unit/suffix lighter). Footnote 12px ink-500.
- Delta: inline chip, no border, 12/500, tinted bg (success-bg, danger-bg, or surface-muted), arrow icon. Separate direction from good/bad.
- Optional sparkline: 6 pill bars, 4px wide, primary-400, past solid, future hatched; must have tooltip.
- Cards: Total headcount · On leave · Open roles · Payroll cost MTD · Attendance rate · Pending approvals · 12-mo attrition.
- Payroll value: use `Rs 16.85M` (tooltip: `Rs 16,850,000`) to avoid collision.

### 5.6 Weekly attendance — pill bars (Pillio "Weekly adherence" pattern)

6–7 vertical pill bars, ~22–28px wide, heights proportional to rate.

- Past: solid `#E9E8F0`. Today: solid primary-500. Future / no data: `--hatch`. Below target: solid bottom + hatched top.
- Day labels 11px beneath; today's label ink-900. Show value on hover/tap. Annotate the axis range.

### 5.7 Headcount trend (line)

- Line primary-500 2px, smooth; area fill gradient `rgba(141,134,234,.25) → 0`.
- Dots hidden except last point (filled, white ring) and hover point.
- Gridlines dashed `#EEEDF5`, y labels 11px ink-300.
- Header chip: "Net +14 this year" → soft chip primary-100 / primary-700.

### 5.8 Pending approvals (alert-row pattern)

- Card header: icon + title + count badge · View all secondary pill.
- Row: white tile, 1px border, radius 16, padding 12.
- Leading 40px tinted icon tile by leave type (sick = danger tint, casual = warning tint, annual = primary tint).
- Title: employee name (14/500). Sub: "Design & UX · Sick leave" (12/ink-500).
- Trailing: age chip ("2 days": warning-bg, 12px) + Approve (small black pill) + Reject (ghost).
- Reason (optional line below): surface-muted box, no border, radius 12, clamp 2 lines, expandable.
- Severity: waiting ≥5 days → danger tint; 2–4 → warning; ≤1 → neutral.

### 5.9 Leave distribution (donut)

Ring 14px, rounded caps, 3px gaps, softened palette; total days in center (24/500) + caption. Legend right: dot · label · percent (13px).

### 5.10 Department breakdown

- Row: label (14/500) · "18 members (38%)" (12/ink-500).
- Bar: 10px pill, track `#EEEDF5` with faint hatch, fill in category color.

### 5.11 Milestones and events (appointments pattern)

- Optional week strip: 7 columns, weekday 11px ink-500, date 14px; selected date = oval ring 1.5px primary-500 with primary-100 fill.
- Tile: surface-muted, radius 16, padding 14; meta line (icon + date), avatar 44, name 15/500, type 12/ink-500, circular 36px white action button (message/congratulate).
- Future tiles at 50% opacity with bottom fade to imply scroll.

### 5.12 Recent activity

List with 8px primary-500 dots, actor (500), verb (400), object (500, primary-700), timestamp (11/ink-300). Clamp to 2 lines with ellipsis (fixes current clipping); "Audit log" → secondary pill in header.

### 5.13 Avatars and badges

Avatars 32/36/40/44, initials fallback primary-100 + primary-700, presence dot with white ring. Notification badge danger, 16px.

---

## 6. States and Motion

| State | Treatment |
| --- | --- |
| Hover rows/nav | bg `#F8F7FD`, 120ms |
| Focus-visible | 2px primary-500 ring |
| Pressed | `scale(.98)` |
| Disabled | 40% opacity |
| Loading | shimmer skeletons on `#F1F0F8` |
| Empty | centered icon + one line + CTA |
| Approve/Reject | optimistic collapse (200ms) + toast with Undo |

Durations 120 / 200–240 / 400ms; easing `cubic-bezier(.2,.8,.2,1)`; bars and progress animate on mount; honor `prefers-reduced-motion`.

---

## 7. Accessibility

- Don't use primary-500 for text on white (fails AA) — use primary-700 for links/chips.
- White on hero gradient: keep metric ≥40px / weight ≥500; verify the lower gradient stop meets 3:1 for large text.
- Status never by color alone: icon + text + hatch.
- Min target 40×40 (32 only for compact pills with ≥8px spacing).
- Charts: `aria-label` summaries + hidden data table.
- Buttons name the target: `aria-label="Approve sick leave for Hira Kamran"`.
- Focus-visible on every interactive element; focus trap in modals and drawers.
- Respect `prefers-reduced-motion`.

---

## 8. Content

- Greeting by time of day: "Good morning, Tariq".
- Currency `Rs 16.85M` / `Rs 16,850,000`; deltas always signed (`+4.2%`).
- Sentence case everywhere (no UPPERCASE labels).
- Relative time for near-term ("in 3h", "2 days"), absolute for scheduled.
- Buttons are verbs; labels are nouns.
- No exclamation marks or emojis.

---

## 9. Tokens

### 9.1 CSS variables

```css
:root {
  --canvas-start: #F4F3FB; --canvas-end: #ECEBF8;
  --surface: #FFFFFF; --surface-glass: rgba(255,255,255,.72); --surface-muted: #F6F5FB;
  --primary-100: #E7E5FB; --primary-400: #A39DF2; --primary-500: #8D86EA;
  --primary-600: #7A72DD; --primary-700: #5F57C4;
  --ink-900: #0E0E12; --ink-700: #2A2A33; --ink-500: #7C7C8A; --ink-300: #B9B9C6;
  --border: #ECEBF3;
  --danger: #E5484D; --danger-bg: #FDECEC;
  --warning: #F5B544; --warning-bg: #FFF4DC;
  --success: #2FA36B; --success-bg: #E6F6EE;
  --viz-violet: #8D86EA; --viz-sky: #6CC3F0; --viz-emerald: #4CC9A0;
  --viz-amber: #F5C25B; --viz-pink: #F28BB8; --viz-slate: #9AA3B5;
  --r-sm: 8px; --r-md: 14px; --r-lg: 24px; --r-pill: 999px;
  --shadow-card: 0 1px 2px rgba(30,25,80,.04), 0 8px 24px rgba(30,25,80,.05);
  --gradient-canvas: linear-gradient(135deg, #F7F6FC 0%, #ECEBF8 100%);
  --gradient-hero: linear-gradient(160deg, #A9A3F5 0%, #7F77E0 100%);
  --hatch: repeating-linear-gradient(135deg, rgba(14,14,18,.14) 0 1.5px, transparent 1.5px 5px);
  --hatch-on-primary: repeating-linear-gradient(135deg, rgba(255,255,255,.38) 0 1.5px, transparent 1.5px 5px);
  --font-sans: "Inter", "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif;
}

body {
  font-family: var(--font-sans);
  color: var(--ink-700);
  background: var(--gradient-canvas);
  font-variant-numeric: tabular-nums;
}

.card {
  background: var(--surface);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-card);
  padding: 20px;
}

.hatch { background-image: var(--hatch); }
```

### 9.2 Tailwind 3 config (if the project uses v3)

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: { 100: "#E7E5FB", 400: "#A39DF2", 500: "#8D86EA", 600: "#7A72DD", 700: "#5F57C4" },
        ink: { 900: "#0E0E12", 700: "#2A2A33", 500: "#7C7C8A", 300: "#B9B9C6" },
        surface: { DEFAULT: "#FFFFFF", muted: "#F6F5FB" },
        line: "#ECEBF3",
        danger: { DEFAULT: "#E5484D", bg: "#FDECEC" },
        warning: { DEFAULT: "#F5B544", bg: "#FFF4DC" },
        success: { DEFAULT: "#2FA36B", bg: "#E6F6EE" },
      },
      borderRadius: { card: "24px", tile: "14px" },
      boxShadow: { card: "0 1px 2px rgba(30,25,80,.04), 0 8px 24px rgba(30,25,80,.05)" },
      backgroundImage: {
        canvas: "linear-gradient(135deg,#F7F6FC 0%,#ECEBF8 100%)",
        hero: "linear-gradient(160deg,#A9A3F5 0%,#7F77E0 100%)",
        hatch: "repeating-linear-gradient(135deg,rgba(14,14,18,.14) 0 1.5px,transparent 1.5px 5px)",
      },
      fontFamily: { sans: ["Inter", "Manrope", "system-ui", "sans-serif"] },
    },
  },
};
```

### 9.3 Tailwind 4 theme (used by this project)

```css
@import "tailwindcss";

@theme {
  --font-sans: "Inter", "Manrope", system-ui, -apple-system, "Segoe UI", sans-serif;

  --color-primary-100: #e7e5fb;
  --color-primary-400: #a39df2;
  --color-primary-500: #8d86ea;
  --color-primary-600: #7a72dd;
  --color-primary-700: #5f57c4;

  --color-ink-900: #0e0e12;
  --color-ink-700: #2a2a33;
  --color-ink-500: #7c7c8a;
  --color-ink-300: #b9b9c6;

  --color-surface: #ffffff;
  --color-surface-muted: #f6f5fb;
  --color-line: #ecebf3;

  --color-danger: #e5484d;
  --color-danger-bg: #fdecec;
  --color-warning: #f5b544;
  --color-warning-bg: #fff4dc;
  --color-success: #2fa36b;
  --color-success-bg: #e6f6ee;

  --radius-tile: 14px;
  --radius-card: 24px;

  --shadow-card: 0 1px 2px rgb(30 25 80 / 0.04), 0 8px 24px rgb(30 25 80 / 0.05);
}

@utility bg-canvas {
  background-image: linear-gradient(135deg, #f7f6fc 0%, #ecebf8 100%);
}

@utility bg-hero {
  background-image: linear-gradient(160deg, #a9a3f5 0%, #7f77e0 100%);
}

@utility hatch {
  background-image: repeating-linear-gradient(135deg, rgb(14 14 18 / 0.14) 0 1.5px, transparent 1.5px 5px);
}

@utility hatch-on-primary {
  background-image: repeating-linear-gradient(135deg, rgb(255 255 255 / 0.38) 0 1.5px, transparent 1.5px 5px);
}

body {
  font-family: var(--font-sans);
  color: var(--color-ink-700);
  background-image: linear-gradient(135deg, #f7f6fc 0%, #ecebf8 100%);
  font-variant-numeric: tabular-nums;
}
```

---

## 10. Dashboard Restyle Prompt

Paste this with screenshots when restyling an existing dashboard:

> Restyle the Lilac Office dashboard to match `design.md`. Do not change data, routes, or logic — styling and component structure only. Do in this order:
>
> 1. Replace brand tokens (violet `#6D28D9` → primary `#8D86EA`/`#7A72DD`, links `#5F57C4`), set the app background to the lavender gradient, make all cards `rounded-[24px]`, borderless, with the soft shadow, padding 20.
> 2. Make the sidebar a floating white panel (inset 16px, radius 24); replace the left accent bar on the active item with a full-width pill (`#F4F3FB`); soften section labels (11px, ink-300, not uppercase).
> 3. Remove the header's bottom border and make the top bar transparent; search becomes a frosted pill; Create becomes a circular + icon button; Add Employee becomes the single black pill CTA (height 48).
> 4. Replace "Executive Overview" with "Good morning, {firstName}" (32px, weight 500).
> 5. Turn Present Today into a gradient hero KPI card with a hatched progress bar; restyle the other KPI cards (small gray title with inline icon, 40px/500 value, borderless soft delta chips, no colored icon tiles). Format payroll as Rs 16.85M with a tooltip.
> 6. Rebuild Weekly Attendance as pill bars (past solid gray-lilac, today primary, future hatched).
> 7. Restyle approvals as alert rows (tinted icon tile, name + sub, age chip, small black Approve, ghost Reject, muted 2-line reason box).
> 8. Fix Recent Activity text clipping with `line-clamp-2`; reduce all heading weights to 500; shrink "All requests / Audit Log →" links into small outlined pills. Keep one gradient card per screen, one black CTA per screen, and never signal status by color alone.

---

## 11. Do / Don't

**Do:** one hero card · one black CTA · hatch for "not yet/missed" · big radii · soft shadows · weights 400–500.

**Don't:** add a second accent hue · use heavy borders or shadows · put UPPERCASE tracked labels everywhere · use saturated violet for large surfaces · signal status with color alone · hard-clip text.

---

## 12. Multi-Tenant ERP Notes

Apply the same visual language everywhere in the platform:

- **Platform console and client workspace:** same floating white sidebar, lavender canvas, 16px inset, radius 24. The platform console sidebar uses a `Platform` chip; the client workspace shows the client name and module switcher.
- **Every module dashboard:** exactly one gradient hero card (the module's most important number), a calm KPI row, then charts and lists. One black pill CTA per screen.
- **Module switcher:** pill-shaped, white or frosted, with the active module in `#F4F3FB` and ink-900 text.
- **All Modules explorer / admin tables:** white card, radius 24, no borders; use `--border` only for row dividers; sticky header in `--surface-muted`; status as soft tinted chips with icon + text.
- **Platform access banner (Super Admin):** full-width sticky bar in `--primary-700` with white text (AA contrast), showing client, module, mode, and an outlined white Exit pill. Inspect is read-only; Support mode uses the same banner with a "Support (write)" chip.
- **Forms and drawers:** white, radius 24, 20px padding, 44px inputs with radius 14, labels 13/500 ink-700, helper 12/ink-500. Modals use radius 24 and the same soft shadow.
- **Module-specific dashboards:** use each module's key metric as the hero:
  - Retail: today's sales.
  - School: fee collection.
  - HR: present today.
  - Accounts: cash and bank position.
