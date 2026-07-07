# TikLivePro — Redesign Implementation Checklist

> Last updated: 2026-07-07

Tracking document for implementing the **Stitch redesign** ("relooking") in `apps/web`.
Companion to [`stitch-redesign-prompts.md`](./stitch-redesign-prompts.md) (the prompts that produced the mockups).

## Source of truth

- **Stitch project:** `TikLivePro Streaming Platform` — `projects/12158904351619999069`
- **Design system asset:** `Pro-Stream Aesthetic` — `assets/51358148301f493c913d47afd621149e`
- **Access:** Stitch MCP server (`stitch`, configured in local Claude Code config). Use `get_screen` with a screen ID below to fetch the mockup's screenshot + generated HTML (styling reference only — do **not** copy Stitch HTML into the app; re-implement with Tailwind on our components).
- All 22 mockups exist: 11 desktop + 11 mobile (375 px) variants.

### Screen inventory

| Page | Desktop screen ID | Mobile screen ID |
|---|---|---|
| Landing | `cfa594420d4540d4beae1eaee119a2d8` | `a5ee15cbf3414db29fdeba364a2c2810` |
| Login | `290891151e1b46728e17114127cca067` | `62078877f7a14da3a9ef1d94f726e88e` |
| OAuth Loading | `fc1178e5814246a6b173aafa5e30c8cc` | `e98d3e07fe534aaf80976dc572e805b3` |
| Dashboard | `a41383712338452ca040504f610d74f4` | `e18fa9dcb4e349fda0b0079def7da0ce` |
| Live Control Room | `bfe48c28551942c0b7fde79772aa960f` | `a91f2f2aedcd41dd9fe2f673486ea7d5` |
| Watch Page | `0f47306c2df54e3c9d4f4c66db24d562` | `02e36803a6af4f8ab48946fcc26af54e` |
| Settings | `c648179144be424bad210f610c695e6a` | `5d9b3f9f8df9422cb24363b5d84c5738` |
| Privacy Policy | `d419ba4c576b44638bf7942843be2db2` | `4d2b6184510d48b19ed8d18a58100b79` |
| Terms of Service | `dd91bc8bacf54e41a06c8f6bd67a3095` | `00e8d311774b40fdb762b879057c4e8d` |
| Data Deletion | `02a9d6346e0641f0b7f0543e402a0801` | `a9228c9008a64a05ac98063b0aa8a424` |
| Shared UI States | `22b70e42b72b402e95a4d9839cffa71d` | `c01a18605bc643b9ad5b1eb351e3fc75` |

---

## Phase 0 — Design token foundation (`globals.css` + Tailwind)

The Pro-Stream Aesthetic tokens. Everything downstream consumes these — do this first.

- [x] Surface scale as CSS variables in `apps/web/src/app/globals.css`:
  - `--surface-0: #0B0B0F` (canvas) · `--surface-1: #141419` (nav/panels) · `--surface-2: #1C1C24` (cards/inputs)
  - Card border: `1px solid rgba(255,255,255,0.06)` (`--card-border-color`); input border `rgba(255,255,255,0.10)` (`--input-border-color`)
  - Exposed as Tailwind utilities via `@theme`: `bg-surface-0/1/2`
- [x] Brand gradient token `--brand-gradient: linear-gradient(90deg, #FF2D55, #FF7A00)` + glow shadow `--brand-glow` (gradient colors @ 30% opacity); `--brand` HSL updated to `#FF2D55`, new `--brand-end` = `#FF7A00`
- [x] Platform identity colors as consts (not CTAs): TikTok `#25F4EE`, Facebook `#1877F2` — `src/lib/platform.consts.ts` (`PLATFORM_IDENTITY_COLORS`); `comments.consts.ts` PLATFORM_COLORS updated to match
- [x] Light theme variant of the surface scale (`:root` = light `#F4F4F6`/`#FFF`/`#FFF`; `.dark` mechanism and `useTheme` toggle untouched)
- [x] Radii: cards 16 px (`--radius-card: 1rem` → `rounded-card` utility, `card-surface`/`stat-tile` use it), buttons/badges/chips pill (`rounded-full` in primitives); 4 px spacing increments (Tailwind default scale)
- [x] Motion primitives in `globals.css` (extend existing ones): `pulse-live` (LIVE badge, opacity 0.8→1.0), `shimmer` (gradient CTA hover sweep on `.btn-gradient`), `.skeleton` shimmer — all gated behind `prefers-reduced-motion`
- [x] Focus rings: `#FF2D55` 2 px outline on interactive elements; inputs get brand border + 2 px outer glow (`box-shadow` @ 35%)
- [x] Typography: Inter wired to Tailwind `font-sans` via `--font-sans` in `@theme` (was loaded but unwired); `.text-display` helper for tight letter-spacing on display sizes; 14–15 px body applied per component
- [x] Shared UI primitives updated once, reused everywhere: `.btn-gradient`, `.btn-ghost`, `.badge-live`, `.chip-platform`, `.stat-tile`, `.glass-overlay` (new) + `.card-surface`, `.bg-gradient-brand`, `.shadow-brand-glow`, `.glass-header`, `.text-gradient-brand` (retargeted to new tokens — existing consumers pick them up automatically)
- [x] No magic values in components — new colors/durations go in `consts/` per feature (CLAUDE.md rule; `platform.consts.ts` established as the shared source)

## Phase 1 — Landing (`/`)

**Files:** `features/landing/` — `LandingNav`, `HeroSection`, `HeroPreview`, `FeaturesSection`, `PricingSection`, `LandingFooter`, `LandingView`

- [x] `LandingNav`: sticky glass nav (`.glass-header`), gradient wordmark, "Go Live Free" gradient pill (`.btn-gradient`), center anchor links; mobile hamburger sheet (`MobileNavSheet`, `.glass-overlay`)
- [x] `HeroSection`: "Go live everywhere. At once." headline with gradient word (`headlineStart`/`headlineHighlight`/`headlineEnd` i18n keys), two CTAs, social-proof avatar strip (+9k chip)
- [x] `HeroPreview`: dashboard mock with pulsing LIVE badge, viewer count, comment feed with platform chips (`.chip-platform` per row), 3D tilt (perspective rotateX, flattens on hover, `motion-reduce` disabled) + gradient glow
- [x] `FeaturesSection`: 6 cards, 3×2 grid (1 col mobile / 2 col sm / 3 col lg), gradient-tinted icon squares, hover lift + glow — added OBS & RTMP Ingest + Secure Account Linking cards
- [x] "How it works" 3-step row with gradient connector line — new `HowItWorksSection` (horizontal connector md+, vertical on mobile)
- [x] `PricingSection`: Free / Pro (gradient border + "Most popular") / Studio; monthly-yearly toggle with "-20%" pill + "Billed yearly" price swap
- [x] Final CTA band (full-width gradient panel) — new `FinalCtaSection` ("Ready to scale?")
- [x] `LandingFooter`: 4 columns — brand, Product, Legal (Privacy, Terms, Data deletion), Language EN/FR switcher

Phase notes: section anchors + shared consts in `features/landing/consts/landing.consts.ts`; all new strings in `packages/i18n` (EN+FR, parity verified); typecheck green; screenshot-verified at 375/768/1280 dark + light incl. open mobile sheet and yearly toggle state.

## Phase 2 — Auth (`/auth/login`, `/auth/social-callback`)

**Files:** `features/auth/` — `LoginView`, `AuthIcons`, `InlineAuthModal`; `app/auth/social-callback/page.tsx`

- [x] `LoginView`: 45/55 split layout (form / brand visual with floating dashboard mock + testimonial); single column on mobile — new `AuthBrandPanel` (reuses landing `HeroPreview` via new `className` prop) + `TestimonialCard`
- [x] Social buttons (TikTok black, Facebook blue), "or continue with email" divider, gradient submit — shared `SocialProviderButtons` + `SOCIAL_BUTTON_CLASSES` in `auth.consts.ts`; submit uses `.btn-gradient`
- [x] Error state: inline "Invalid credentials" alert styled per mockup — shared `AuthErrorAlert` (icon + red glass card), used for URL OAuth errors and form errors
- [x] `InlineAuthModal` restyled to match (glass surface, gradient CTA) — `.glass-overlay` + `rounded-card`, same social buttons/inputs/alert as LoginView
- [x] Callback page: centered gradient circular loader, "Connecting your account…", failure variant with "Try again" / "Back to login" — page is now thin (`SocialCallbackView` + `useSocialCallback`); failure renders in place instead of redirecting, "Try again" re-runs the last provider (stored in sessionStorage by `loginWithProvider`); new `.spinner-brand` ring primitive in `globals.css` (longhand `mask-image` — Lightning CSS drops the `mask` shorthand rule entirely)

Phase notes: form sub-components extracted one-per-file (`LoginForm`, `RegisterForm`, `EmailField`, `PasswordField` with mail/lock leading icons); new icons `MailIcon`, `LockIcon`, `AlertTriangleIcon` in `AuthIcons`; new i18n keys `auth.welcomeBack/welcomeSubtitle/signUpSubtitle/signUpToStream`, `auth.testimonial.*`, `auth.callback.*` (EN+FR parity); auth footer reuses `landing.footer` keys + `AUTH_LEGAL_LINKS`; typecheck green; screenshot-verified at 375/768/1280 dark + light, callback connecting + failure states.

## Phase 3 — Dashboard (`/dashboard`)

**Files:** `app/dashboard/page.tsx` (thin), `features/stream/` — `GoLiveForm`, `AccountSelector`, `CameraPreview`, `HistorySidebar`; `features/accounts/` — `AccountList`, `AccountCard`, `ConnectAccountModal`; `features/notifications/NotificationBell`

- [x] App bar: bell with unread dot (existing count badge), new `ThemeToggleButton` (auth feature), `UserMenu` avatar — extracted into `DashboardHeader`; gradient wordmark to match landing
- [x] Greeting header + right-aligned "Go Live" gradient CTA — `DashboardGreeting`, CTA smooth-scrolls to the Stream Setup card (`GO_LIVE_FORM_ID` in `stream.consts.ts`)
- [x] `GoLiveForm` (8-col card): caps field labels + surface-token inputs, destination chips (`AccountSelector` rewritten as toggleable platform-colored chips + "+ Connect account" dashed chip opening `ConnectAccountModal`), source segmented pills now include an **OBS / RTMP** tab (`RtmpIngestCard`: RTMP URL + masked stream key with copy + eye toggle — placeholder/disabled until the broadcast starts, since the orchestrator allocates the ingest key on `session.starting`), `.btn-gradient` submit with disabled state. Camera/File/URL/Playlist flows untouched.
- [x] `AccountCard`/`AccountList` (4-col): status pills (Connected green / amber "Reconnect" — driven by `isActive`; there is no separate token-expired flag client-side), kebab menu (Manage / Reconnect / Disconnect via `useRemoveAccount`), freemium footer "Free plan · 2 accounts max — Upgrade"
- [x] Quick-stats card: `.stat-tile` tiles for Total streams + Hours live + **Peak viewers** (added 2026-07-07: the comments-service Socket.io viewer registry now persists each session's all-time peak to a new `viewer_peaks` table — debounced write on the existing 250 ms broadcast window, monotonic via `GREATEST` upsert; read side is the public `GET /comments/viewer-stats?sessionIds=` endpoint proxied by the gateway; web consumes it via `useViewerPeaks` inside `useMonthlyStats`)
- [x] `HistorySidebar` + `RecentSessionsTable`: gradient placeholder thumbnail (`SessionThumbnail` — no capture stored yet), platform-tinted destination chips (`DestinationIcon`), status badge, "Replay" link (`ReplayLink`), restyled empty state; Viewers column with per-session peak ("845 peak") on desktop + eye-icon count on mobile cards — "—" for sessions that predate peak tracking
- [x] Mobile: single-column stack order per mockup (setup → stats → accounts → sessions) + sticky bottom "Go Live" bar (`StickyGoLiveBar`, hidden while a session is active — the return-to-live banner takes over); source tab row scrolls horizontally at 375 px

Phase notes: page recomposed as thin composition (`DashboardHeader`, `DashboardGreeting`, `ActiveSessionBanner`, `StickyGoLiveBar` extracted); grid switched to 12-col (8/4); the old Live Comments card was **removed** from the dashboard (not in the Stitch mockup — Recent Sessions now spans full width; `CommentFeed` stays in the comments feature for the Live Control Room); new i18n keys `stream.obs.*`, `accounts.reconnect`, `accounts.limit.freemiumShort/upgradeCta` (EN+FR parity verified); typecheck green; screenshot-verified at 375/768/1280 dark + light incl. mocked-API states (selected destination chips, Connected/Reconnect pills, populated sessions table, OBS tab, unread bell badge).

## Phase 4 — Live Control Room (`/live/[sessionId]`)

**Files:** `features/stream/` — `FullscreenLiveView` (layout restructured, streaming logic untouched), `LiveCommentPanel`, `LiveCommentRow`, `ViewersPanel` (+ `embedded` variant); new: `LiveStatusBar`, `DestinationHealthDots`, `EndStreamDialog`, `LiveStatsStrip`, `StatSparkline`, `StreamSettingsRow`, `StreamLinksCard`, `StickyEndStreamBar`; `stream.store` (cumulative comment/reaction counters), `stream.consts` (reaction emoji, emoji-only regex, sparkline sampling)

⚠️ This screen is performance-critical (anti-stutter work in `ef14c98`). Restyle without adding re-renders: no new animated components inside the comment list rows; keep memoization intact.

- [x] Top status bar: pulsing LIVE pill + elapsed timer (`useElapsedTime`), per-destination health dots (green Streaming / amber Reconnecting), viewer count, red "End stream" with confirm dialog — new `LiveStatusBar` + `DestinationHealthDots` + `EndStreamDialog` (glass alertdialog, Escape/backdrop cancel)
- [x] Stream monitor: 16:9 panel with thin gradient border (`bg-gradient-brand p-px` wrapper), overlay chips (LIVE/Starting/Paused + timer top-left; whip-health dot + `1080p · 5 Mbps` bitrate chip + REC top-right). Note: the existing `StreamPanel` component is the **dashboard Go-Live card**, so the monitor is new markup inside `FullscreenLiveView` — the camera/video-share `<video>` elements, draggable webcam PiP and canvas compositor all moved inside it (PiP drag + compositor screen→canvas scaling switched from window to monitor-container coordinates)
- [x] Stats strip: 4 compact `stat-tile`s with sparklines — new `LiveStatsStrip` + `StatSparkline` (muted 12-point line, brand-accent current dot; brand hue validated with the dataviz palette validator on both surfaces). Tiles are **viewers / peak / comments / reactions** — "new followers" from the mockup has no data source, so comments took its slot; comment/reaction totals are new cumulative `commentCount`/`reactionCount` counters in `stream.store` (comments[] is capped at 200)
- [x] Collapsible "Stream settings" row — new `StreamSettingsRow` (controlled shell) containing stream-quality presets, `VideoSourcePicker`/`VideoSharePlayer` + source-quality picker, `PlaylistPanel` (share-player/picker sections are `dark`-scoped islands so they stay legible in light theme), and new `StreamLinksCard` (watch link, HLS, WebRTC/WHEP, masked ingest stream key with eye + copy — key fetched from the orchestrator ingest endpoint)
- [x] `LiveCommentPanel`: All/TikTok/Facebook filter chips (platform-identity dots), pause-autoscroll toggle (auto-pauses on scroll-up, "New messages" gradient jump pill), platform badges on rows (colored label via `PLATFORM_IDENTITY_COLORS`; `local` comments show none), emoji-only comments render as reaction rows with a subtle brand-gradient wash (`EMOJI_ONLY_COMMENT_RE`), pinned comment variant (gradient border + pin icon, pin/unpin row action, local state), reply composer kept (`CommentInput`). List now renders oldest→newest with the composer at the bottom (chat convention); rows fully tokenized for dark+light
- [x] `ViewersPanel` as secondary tab — right rail with Chat/Viewers tabs (gradient active underline, live count badges); panel gained an `embedded` variant (theme tokens, no own header) while the watch-page dark-glass default is untouched. Viewer rows have no platform data client-side, so no per-viewer platform badge (initials avatar + name + video-control toggle)
- [x] Mobile: full-bleed monitor (no border/radius below `lg`), horizontal-scroll snap stats strip, chat rail stacked below settings, sticky bottom bar (`StickyEndStreamBar`: Dashboard shortcut + prominent red End stream; the mockup's 5-item bottom tab bar was reduced to the two real destinations)

Phase notes (2026-07-07): `/live/[sessionId]` converted from the fixed-fullscreen immersive view to the control-room layout — **all WHIP/compositor/retry/quality/recording logic in `FullscreenLiveView` preserved unchanged**; removed states that caused re-renders (floating comment bubbles + unread toasts — chat is now always docked; auto-hiding bottom-controls mousemove timer — controls are a static row under the monitor). `LiveCommentFloat` stays for the Watch page. End-stream now confirms via dialog everywhere (status bar + mobile sticky bar). Legacy `LiveDashboard`/`StatsCard` components are now unused (kept, still exported). New i18n keys `stream.controlRoom.*`, `comments.filterAll/pauseAutoscroll/resumeAutoscroll/newMessages/pinned/pin/unpin` (EN+FR parity verified). `pnpm --filter web typecheck` green. Verified end-to-end against the local dev stack with a real registered user + started session and comments seeded through the real REST→socket pipeline (CDP script: scratchpad `cdp-verify2.mjs` pattern — refresh-cookie bootstrap via `/api/auth/session/set`); screenshots at 375/768/1280, dark + light, incl. populated chat with pinned + emoji rows, expanded settings row, and fired reactions. Headless Chrome exposes no fake *video* input, so the monitor shows the camera-off state in screenshots; camera code paths are unchanged from the pre-redesign implementation.

## Phase 5 — Watch Page (`/watch/[sessionId]`)

**Files:** `features/stream/WatchView`, `features/comments/` — `CommentFeed`, `CommentItem`, `CommentInput`, reaction/GIF/emoji popovers

⚠️ Do not touch hls.js `liveSyncDuration` coupling while restyling the player shell.

- [ ] Minimal top bar (logo + "Log in" ghost) for logged-out viewers
- [ ] Player shell: custom controls, LIVE pill + viewer chip overlay
- [ ] Below player: title, creator row (avatar, "Follow" gradient button), TikTok/Facebook destination chips
- [ ] Floating emoji reactions rising over the video (`LiveCommentFloat` — keep fan-out caps)
- [ ] Chat panel: platform badges, sticky composer with emoji/GIF; logged-out variant = "Log in to chat" gradient button
- [ ] Quick-reaction bar (❤️ 🔥 😂 👏 😮) — keep per-socket + per-session rate limits
- [ ] Offline/ended state: dimmed player, "This stream has ended", replay card, "More from this creator" row
  - [x] **Chat replay timeline** (done early, 2026-07-07): the ended state now shows the full comment **and** emoji-reaction history of the session in chronological order with the exact send time (HH:MM:SS) of every entry — `ReplayTimeline`/`ReplayCommentRow`/`ReplayReactionRow` + `useSessionReplay` in `features/comments/`; backed by the new public `GET /comments/reactions` endpoint (comments service; reactions were already persisted by `emit_reaction`, this adds the read side + a `(session_id, created_at)` index via migration `0006`), proxied by the gateway (`PUBLIC_GET_PATHS` + static OpenAPI spec). Identical emojis sent within the same second are grouped (`×n`) but keep their exact timestamp. Verified against a real ended session in the local dev stack.
- [ ] Mobile: sticky video on top, chat fills remaining height

## Phase 6 — Settings (`/settings`)

**Files:** `features/settings/` — `SettingsView`, `ProfileSection`, `ConnectedAccountsSection`, `SubscriptionSection`, `PlanCard`, `PaymentMethodModal`, `NotificationsSection`, `AppearanceSection`, `SecuritySection`

- [ ] `SettingsView` nav: left rail with gradient active-marker; horizontal scrollable pills on mobile
- [ ] `ProfileSection`: avatar upload overlay, verified email, save button disabled-until-dirty
- [ ] `ConnectedAccountsSection`: platform cards with status pill, permissions summary, "Disconnect" danger ghost; locked third slot with padlock + "Upgrade to Pro" (freemium limit comes from billing service — display only)
- [ ] `SubscriptionSection`/`PlanCard`: gradient-border current plan, usage meters, payment method row, invoice table
- [ ] `NotificationsSection`: grouped toggles, gradient "on" state
- [ ] `AppearanceSection`: 3 theme preview cards (Dark/Light/System), active gradient border; EN/FR select
- [ ] `SecuritySection`: password form, active sessions list with "Revoke", red danger-zone card with type-to-confirm delete modal

## Phase 7 — Legal & compliance pages

**Files:** `features/legal/` — `PrivacyView`, `TermsView`; `app/data-deletion/page.tsx`

- [ ] Shared legal template: slim nav, "Last updated" banner, sticky TOC with gradient active marker (dropdown on mobile), 720 px prose column, definition callout boxes
- [ ] Apply to `PrivacyView` and `TermsView` (extract shared layout component under `features/legal/components/`)
- [ ] Data deletion: centered card, 4-item deletion checklist, email + reason form, red submit with confirm, success state with reference ID chip

## Phase 8 — Shared states

- [ ] 404 page (gradient "404", "Back to dashboard") — `app/not-found.tsx`
- [ ] Generic error page with retry + collapsible details — `app/error.tsx`
- [ ] Toast system restyle: success/error/info glass style + "You're live!" pulsing toast
- [ ] Skeletons: dashboard card, comment row, video tile with gradient sweep
- [ ] Upgrade/paywall modal (gradient border, benefit rows, price toggle)
- [ ] `ConnectAccountModal`: platform grid with greyed "More coming soon" tiles

---

## Cross-cutting rules (every phase)

- [ ] **Responsive**: verify each page at 375 / 768 / 1280 px (CLAUDE.md rule — never ship single-viewport)
- [ ] **Screenshot verification**: headless-Chrome screenshots of each finished page, compared against the Stitch mockup (desktop + mobile)
- [ ] **i18n**: every new string goes through `packages/i18n` keys (EN + FR) — no hardcoded UI strings
- [ ] **Feature structure**: new components one-per-file under the owning feature's `components/`; constants in `consts/`; export via the feature `index.ts`
- [ ] **Pages stay thin**: no new logic in `app/*/page.tsx`
- [ ] **No `any`**, explicit return types on exported functions
- [ ] **Dark + light themes** both verified per page (theme toggle in `AppearanceSection`)
- [ ] `pnpm typecheck` + `pnpm test` green after each phase
- [ ] Accessibility: AA contrast on the new surfaces, visible focus states, `prefers-reduced-motion` respected

## Suggested order & status

| # | Phase | Status |
|---|-------|--------|
| 0 | Design tokens + shared primitives | ☑ Done |
| 1 | Landing | ☑ Done |
| 2 | Auth (login + callback) | ☑ Done |
| 3 | Dashboard | ☑ Done |
| 4 | Live Control Room | ☑ Done |
| 5 | Watch Page | ☐ Not started |
| 6 | Settings | ☐ Not started |
| 7 | Legal + Data deletion | ☐ Not started |
| 8 | Shared states | ☐ Not started |

Update the status column (`☐ Not started` → `◐ In progress` → `☑ Done`) and tick checkboxes as work lands. Ship phases as separate PRs; Phase 0 must merge first.
