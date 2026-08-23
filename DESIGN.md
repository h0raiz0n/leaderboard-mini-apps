# Design — Chip Stack (Лидерборд покер-клуба)

<!-- impeccable:design-schema 1 -->

Visual world: **chip-stack / dark blue**. The leaderboard is a live club board on a deep blue surface (between голубой and синий, echoing the club interior), where points are chips and ranks are chip denominations. See the direction contract comment in `index.html` (seed `127fdba0`).

## Mode

Operate — players open the Mini App to check their position, points and rank quickly. Scannable, one-hand friendly, mobile-first inside Telegram.

## Palette

Dark blue theme (navy ground, royal-blue glow), light text, chip-denomination accents. Gold is reserved for the leader and primary actions.

| Token | Value | Role |
|---|---|---|
| `--bg-0` | `#0b1830` | ground |
| `--bg-1` | `#0f2036` | ground glow (top) |
| `--bg-2` | `#08111e` | deepest |
| `--card` | `#122842` | cards / rows |
| `--card-2` | `#18344f` | hover / pressed |
| `--line` / `--line-2` | `#1b3a5c` / `#28507c` | hairlines (blue, never green) |
| `--ink` | `#e9f1f9` | primary text |
| `--ink-2` | `#c2d4e8` | secondary text |
| `--muted` | `#9db6d0` | meta text |
| `--muted-2` | `#6b87a6` | placeholders, inactive |
| `--chip-gold` | `#e8b84b` | accent, leader, active states |
| `--gold-deep` | `#c6952e` | gold on dark |
| `--chip-red` | `#e0594f` | red chip (bounty / KO) |
| `--chip-blue` | `#4b82d8` | blue chip (SHARK) |
| `--chip-purple` | `#8a5cc4` | purple chip (LEGEND) |
| `--chip-black` | `#262b34` | black chip (BOSS, gold edge) |
| `--chip-white` | `#ece7da` | white chip (FISH) |
| `--up` | `#3fce8c` | upward trend |
| `--down` | `#e26058` | downward trend |

Contrast: `--muted` and `--ink` on felt ground pass ≥4.5:1; `--muted-2` is non-essential and kept at ≥3:1.

## Type

- **Display / numerals:** Bebas Neue (embedded as base64 `@font-face`, since Apps Script `HtmlService` CSP blocks external CDNs). Used for the wordmark, giant position numerals (top-3 up to 40px), point chips, and headers. Letter-spacing ~`0.02–0.09em`.
- **UI / body:** system stack (`system-ui`, `-apple-system`, `Segoe UI`, …). Operate surface — familiar workhorse face is a deliberate choice; personality comes from numerals, palette and chip language.
- Scale: UI labels ≥11px, body ≥13px, display sizes via Bebas. `font-variant-numeric: tabular-nums` on all numeric data.

## Materials & Components

- **Chips** are the core motif: radial-gradient circles with inset rings (denomination edge), gold for the leader. Rank tiers map to chip colors (BOSS=black/gold edge, LEGEND=purple, SHARK=blue, FISH=white).
- **Rows:** felt panels with hairline borders, radius 14px; press feedback via `transform: scale(.988)` and surface lift. Position numerals: top-1 gold 40px, top-2 silver 33px, top-3 bronze 30px, others 26px ink.
- **Segmented control** (Месяц / Всё время): pill with gold active state.
- **Podium tab:** per-date podium bars (1–3) with gold/silver/bronze fills, medal chips for places 4–5.
- **Heatmap:** gold intensity scale on felt; legend supplied.
- **Icons:** inline SVG set (suit logo, tabs, trend arrows, KO crosshair, breakdown glyphs) drawn in one 1.8px stroke. No emoji as UI icons; server-provided emoji in rank/breakdown strings are parsed and re-rendered with SVG + labels.
- **Depth:** soft elevation shadows with offset + blur only; no zero-offset chromatic glows.

## Layout

Mobile-first, single column, `max-width: 720px` centered. Sticky felt wordmark top bar (`backdrop-filter` blur). Bottom tab bar (Рейтинг / Подиум / Ведущие) with safe-area inset — thumb-friendly. Content panels crossfade (`panelIn`, 220ms, respects `prefers-reduced-motion`).

## States

Skeleton rows (shimmer) while loading; error state with "Повторить" retry; empty states with explanatory copy; `:focus-visible` gold outline; `caret-color` on search input; themed selection and scrollbars.

## Tokens & Files

All tokens live in `:root` CSS custom properties in `index.html`. The design has no external assets: the display font is base64-embedded; all icons are inline SVG.
