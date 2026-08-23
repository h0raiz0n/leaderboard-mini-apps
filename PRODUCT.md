# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static single-file frontend (`index.html`, inline CSS/JS) served by Google Apps Script `HtmlService`; data comes from the project's JSON API (`doGet`). No framework, no build step. Changing this is a user decision.

## Users

Poker club players opening the Mini App from the Telegram bot, primarily on mobile phones. Their job: quickly find their own position, points, and rank in the current-month leaderboard and compare with the top.

## Product Purpose

The club's live stats hub: leaderboard for the current month, all-time statistics, per-player cards (ITM, knockouts, places histogram, percentiles, MTT podiums, game history), a hall of fame of MTT prize places, and a dealers heatmap. All data is real results of club games (SnG / MTT / Mystery Bounty) maintained by the admin in Google Sheets.

## Positioning

The single trusted place where club players see the real, up-to-date standings of their own games — not a demo, not a category site.

## Operating Context

- Opened inside Telegram Messenger on mobile as a Mini App (web view).
- Russian-language UI.
- Data refreshed from the admin spreadsheet; games run on Wed/Fri/Sat, so the current-month board changes on game days.
- API endpoints: `?type=current` (month leaderboard), `?type=leaderboard` (all-time), `?type=player&name=` (player card), `?type=halloffame` (MTT prize places), `?type=dealers` (heatmap).

## Capabilities and Constraints

- Current leaderboard row shape: `[position, trend, name, points, rank, itmStack, fullSet, bonuses, breakdown]`.
- Player card returns month + all-time + percentiles + MTT podium + game history.
- Hall of Fame is filtered to MTT prize places, newest first.
- Dealers heatmap groups games by (dealer, date) per month.
- Served through Apps Script `HtmlService`: system font stacks only (no external font/CDN links), single-file constraint, no external network calls beyond the same-origin JSON API.
- Undecided: exact tab set, copy, and visual direction — user approved free restructuring of tabs and texts.

## Brand Commitments

- Club/product name and language are Russian.
- Content must stay factual: only real game results; no invented testimonials, players, or achievements.

## Evidence on Hand

- Live API returns real data (leaderboard, player cards, hall of fame, dealers).
- Existing `index.html` is the incumbent visual implementation; it is anti-reference for the redesign, not a source of direction.

## Product Principles

- Position first: a player must see their own place and points with zero friction on opening.
- Mobile-native: thumb-reachable targets, no hover dependence, comfortable in one hand.
- Authenticity: real club data only, never invented content.
- Telegram fit: behave like a native Mini App surface, not a web page.
- Readability over decoration: dense stats must stay scannable.

## Accessibility & Inclusion

- Mobile web inside Telegram; minimum touch-target sizes and sufficient contrast for use in varied lighting.
