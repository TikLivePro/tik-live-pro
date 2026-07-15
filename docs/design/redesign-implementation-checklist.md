# TikLivePro — Redesign Implementation Checklist

> Last updated: 2026-07-08 (Phase 8 + fullscreen/no-active-stream-modal follow-up)

Tracking document for implementing the **Stitch redesign** ("relooking") in `apps/web`.
Companion to [`stitch-redesign-prompts.md`](./stitch-redesign-prompts.md) (the prompts that produced the mockups).

## Source of truth

- **Stitch project:** `TikLivePro Streaming Platform` — `projects/12158904351619999069`
- **Design system asset:** `Pro-Stream Aesthetic` — `assets/51358148301f493c913d47afd621149e`
- **Access:** Stitch MCP server (`stitch`, configured in local Claude Code config). Use `get_screen` with a screen ID below to fetch the mockup's screenshot + generated HTML (styling reference only — do **not** copy Stitch HTML into the app; re-implement with Tailwind on our components).
- All 22 original mockups exist: 11 desktop + 11 mobile (375 px) variants. Added 2026-07-08: a Connected Accounts desktop mockup (accounts management split out of Settings — see Phase 6 follow-up). A second generation attempt also landed as `b4fd5852a7fe4c1a91faba2aebe331ba` ("Connected Accounts Management") — ignore it; the canonical screen is the one in the table (the MCP API has no screen deletion).

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
| Connected Accounts | `05d7f5758c1b4b7ea9e46472ae088dfd` | — |
| Privacy Policy | `d419ba4c576b44638bf7942843be2db2` | `4d2b6184510d48b19ed8d18a58100b79` |
| Terms of Service | `dd91bc8bacf54e41a06c8f6bd67a3095` | `00e8d311774b40fdb762b879057c4e8d` |
| Data Deletion | `02a9d6346e0641f0b7f0543e402a0801` | `a9228c9008a64a05ac98063b0aa8a424` |
| Shared UI States | `22b70e42b72b402e95a4d9839cffa71d` | `c01a18605bc643b9ad5b1eb351e3fc75` |
| No Stream Active Modal *(new, 2026-07-08)* | `062d5b3f471b4ab6a4c3ea6ee2755fac` | `11ea54dd60f8429daee630039be2fd22` |

Note: the Live Control Room desktop/mobile screens above (`bfe48c28551942c0b7fde79772aa960f` / `a91f2f2aedcd41dd9fe2f673486ea7d5`) were edited in place on 2026-07-08 to add the monitor fullscreen button — same IDs, updated content. The "No Stream Active Modal" row is a separate pair of screens (Stitch generated new screens for this overlay state rather than patching the Dashboard screens in place — see quirk below).

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
- [x] Creator Studio left sidebar (mockup's fixed left nav) — new `CreatorSidebar` (`features/stream/components/`) + `CreatorLayout`/`SidebarContext` (`components/`): brand header (logo + gradient wordmark + "CREATOR STUDIO" caption), nav Overview→`/dashboard`, Streaming (active, gradient left marker), Analytics (disabled + "Soon" chip — no analytics page exists yet), Accounts→`/settings#accounts`, Settings→`/settings`; footer Upgrade Pro gradient CTA→`/settings#subscription`, Help (mailto), Logout. Desktop: collapsible to a 72 px icon rail (persisted in `localStorage`), hamburger triggers in `LiveStatusBar`/`DashboardHeader`/Settings header; mobile: off-canvas drawer + blurred backdrop. Layout also wraps `/dashboard` and `/settings` so the studio nav is consistent
- [x] Media-controls bar reworked to the mockup's glass control bar: mic + camera buttons are **always visible** — when the camera isn't active they call `start()` (fixes "no way to activate/deactivate webcam" when autostart failed/denied), when active mic toggles mute and camera toggles the video track (or the webcam PiP overlay while a video source is sharing); plus share-source and viewers shortcuts, and a right-aligned "Advanced settings" chevron that drives the `StreamSettingsRow` below
- [x] Settings anchor targets `id="accounts"` / `id="subscription"` (+ `scroll-mt-20`) in `SettingsView` for the sidebar deep links

Phase notes (2026-07-07): `/live/[sessionId]` converted from the fixed-fullscreen immersive view to the control-room layout — **all WHIP/compositor/retry/quality/recording logic in `FullscreenLiveView` preserved unchanged**; removed states that caused re-renders (floating comment bubbles + unread toasts — chat is now always docked; auto-hiding bottom-controls mousemove timer — controls are a static row under the monitor). `LiveCommentFloat` stays for the Watch page. End-stream now confirms via dialog everywhere (status bar + mobile sticky bar). Legacy `LiveDashboard`/`StatsCard` components are now unused (kept, still exported). New i18n keys `stream.controlRoom.*`, `comments.filterAll/pauseAutoscroll/resumeAutoscroll/newMessages/pinned/pin/unpin` (EN+FR parity verified). `pnpm --filter web typecheck` green. Verified end-to-end against the local dev stack with a real registered user + started session and comments seeded through the real REST→socket pipeline (CDP script: scratchpad `cdp-verify2.mjs` pattern — refresh-cookie bootstrap via `/api/auth/session/set`); screenshots at 375/768/1280, dark + light, incl. populated chat with pinned + emoji rows, expanded settings row, and fired reactions. Headless Chrome exposes no fake *video* input, so the monitor shows the camera-off state in screenshots; camera code paths are unchanged from the pre-redesign implementation.

Follow-up (2026-07-07, same day): added the Creator Studio sidebar + reworked control bar (bullets above). New i18n keys `stream.controlRoom.sidebar.*`, `stream.controlRoom.advancedSettings/shareSource/viewersCollaborators`, `stream.camera.showOverlay/hideOverlay`, `common.toggleSidebar` (EN+FR parity); the control bar's previously hardcoded titles ("Advanced Settings", "Viewers & Collaborators", "Upload / Share video source", webcam-overlay titles, "Lire la vidéo" play overlay) now use these keys.

### Follow-up (2026-07-08) — Monitor fullscreen + sidebar "no active stream" modal

- [x] Monitor fullscreen toggle: small glass circular icon button added next to the bitrate/health chip (top-right overlay of the video monitor). Uses the real Fullscreen API (`monitorRef.requestFullscreen()`/`document.exitFullscreen()`), syncs an `isFullscreen` state via a `fullscreenchange` listener (handles Esc too), swaps between a "maximize" and "collapse" icon — `FullscreenLiveView.tsx`. New i18n keys `stream.controlRoom.fullscreen/exitFullscreen` (EN+FR).
- [x] `CreatorSidebar`'s "Streaming" nav item: when no session is active (`currentSession` is null — same convention as `useActiveSession`), clicking it now opens `NoActiveStreamModal` (new component, `EndStreamDialog`-style glass alertdialog) instead of silently routing to `/dashboard`. New i18n keys `stream.controlRoom.sidebar.notLiveModal.*` (EN+FR).
- Stitch: Live Control Room screens (`bfe48c28551942c0b7fde79772aa960f` desktop / `a91f2f2aedcd41dd9fe2f673486ea7d5` mobile) edited in place via `edit_screens` (DOM `append_child` event, verified against the returned `project.file_update` payload — not the frozen `get_screen` export, per the MCP quirk below). The modal request produced two **new** screens instead of patching the Dashboard screens in place — `062d5b3f471b4ab6a4c3ea6ee2755fac` (desktop) / `11ea54dd60f8429daee630039be2fd22` (mobile), "No Stream Active Modal" — added to the screen inventory table above.
- `pnpm --filter web typecheck` + `eslint` on touched files green. Screenshot-verified end-to-end against the local dev stack (2026-07-08): a real registered throwaway user + refresh-cookie bootstrap drove `/dashboard` via CDP — clicking the sidebar's "Streaming" item with no active session opened `NoActiveStreamModal` (captured dark + light; theme toggle confirmed it stays open across a re-render), the "Go to dashboard" CTA closed it and navigated, and Escape closed it too. For the fullscreen toggle, a real session was created → started → an ffmpeg `testsrc2` pushed to the MediaMTX RTMP ingest → `/live/[sessionId]` reached `Live` status; a real (non-synthetic, `Input.dispatchMouseEvent`) click on the button set `document.fullscreenElement` to the monitor node, swapped the icon/`aria-label` to "Exit fullscreen", and `exitFullscreen()` cleared it again with the icon reverting — confirming the `fullscreenchange` listener syncs correctly both ways.

## Phase 5 — Watch Page (`/watch/[sessionId]`)

**Files:** `features/stream/` — `WatchView` (converted from the fixed-fullscreen immersive view to the mockup's page layout; all HLS/WHEP/socket/polling logic untouched); new: `WatchTopBar`, `WatchStatTiles`, `WatchQuickReactions`; `features/comments/` popovers reused as-is

⚠️ Do not touch hls.js `liveSyncDuration` coupling while restyling the player shell.

- [x] Minimal top bar — new `WatchTopBar` (glass sticky header): gradient wordmark; logged-out = "Log in" ghost + "Go Live" gradient CTA; logged-in = single "Dashboard" gradient CTA
- [x] Player shell: 16:9 rounded-card monitor with LIVE `badge-live` + viewer chip top-left, quality picker (HD/Auto/levels — logic unchanged) top-right, click/hover-revealed bottom control bar (mute + volume + % + elapsed + Share + fullscreen via `requestFullscreen`); when the host shares a video source the existing `ViewerVideoControls` pill (play/pause/seek with permission) renders instead. Unmute CTA + loading + paused overlays kept
- [x] Below player: title, TikTok/Facebook `chip-platform` destination chips (identity-tinted), creator row (gradient-ring initials avatar + "{n} watching now" + gradient **Follow** button). The public session payload has no host identity, so the row shows a generic "Live host" label, and Follow is client-local (auth-gated: opens the sign-in gate for logged-out viewers) until a follow API exists. Mockup's hashtag chips + follower count omitted — no data source
- [x] Floating emoji reactions rising over the video — `LiveReactionFloat` container moved inside the player shell (bottom-right); `MAX_REACTIONS` cap kept. Floating comment *bubbles* were removed — chat is now always docked (same rationale as the control room)
- [x] Chat panel: persistent right rail (380 px desktop / fills remaining height under the sticky player on mobile), platform-identity labels + colored dots on rows, oldest→newest ordering with bottom composer (auto-scroll to newest), emoji/GIF/attachment pickers + reply flow kept; logged-out variant = "Log in to chat" gradient button
- [x] Quick-reaction bar (❤️ 🔥 😂 👏 😮 💯 — reuses `QUICK_COMMENT_REACTIONS`) — new `WatchQuickReactions` above the composer; one `emit_reaction` socket emit per tap, server-side per-socket + per-session rate limits stay authoritative; auth-gated for logged-out viewers
- [x] Offline/ended state: dimmed player card ("This stream has ended" + hint), chat composer + quick-reaction bar hidden, replay timeline below the stats. "More from this creator" row omitted — there is no public endpoint listing a creator's sessions
  - [x] **Chat replay timeline** (done early, 2026-07-07): the ended state now shows the full comment **and** emoji-reaction history of the session in chronological order with the exact send time (HH:MM:SS) of every entry — `ReplayTimeline`/`ReplayCommentRow`/`ReplayReactionRow` + `useSessionReplay` in `features/comments/`; backed by the new public `GET /comments/reactions` endpoint (comments service; reactions were already persisted by `emit_reaction`, this adds the read side + a `(session_id, created_at)` index via migration `0006`), proxied by the gateway (`PUBLIC_GET_PATHS` + static OpenAPI spec). Identical emojis sent within the same second are grouped (`×n`) but keep their exact timestamp. Verified against a real ended session in the local dev stack.
- [x] Mobile: player sticky under the top bar (`sticky top-14`, full-bleed), info scrolls beneath it, chat fills the remaining height with the composer at the bottom; stat tiles + creator row `shrink-0` (column-flex shrink gotcha)

Phase notes (2026-07-07): `WatchView` layout rewritten around unchanged streaming internals — `HlsPlayer` (incl. `liveSyncDuration: 4`), `WhepPlayer`, adaptive status polling, socket handlers, comment send/reply/attachments, keyboard shortcuts and the viewers panel are byte-identical. Removed states that no longer exist in the docked-chat design: floating `CommentBubble`s, unread badge, comment-panel open/close, like button (replaced by the quick-reaction bar). The page is deliberately dark-only (`dark`-scoped tokens on the root) like a video player surface — both themes render identically. New i18n keys `watch.nav.*`, `watch.liveChat/messagesCount/logInToChat/quickReactions/fullscreen/endedTitle/replyingTo/replyPlaceholder/attachFile`, `watch.creator.*`, `watch.stats.*` (EN+FR parity verified). `pnpm --filter web typecheck` green. Verified end-to-end against the local dev stack with the **real pipeline**: registered user → session → ffmpeg `testsrc2` pushed to the MediaMTX RTMP ingest (key from the orchestrator ingest endpoint) → session transitioned to `live` → comments seeded through REST→socket; CDP screenshots at 375/768/1280 for logged-out, logged-in (composer + fired quick reactions), revealed control bar, and ended state (replay timeline, composer hidden). Headless Chrome never fired the `playing` event for the HLS/WHEP video so shots show the loading spinner over the live layout — player components are unchanged from production.

## Phase 6 — Settings (`/settings`)

**Files:** `features/settings/` — `SettingsView` (tabbed shell), new `SettingsNav`, `ProfileSection`, `ConnectedAccountsSection` (+ new `ConnectedAccountCard`, `LockedAccountSlot`), `SubscriptionSection` (+ new `CurrentPlanCard`, `UsageMeters`, `PaymentMethodsRow`), `PlanCard`, `PaymentMethodModal`, `NotificationsSection` (+ new `NotificationToggleRow`), `AppearanceSection` (+ new `ThemePreviewCard`, `ThemeMiniPreview`), `SecuritySection` (+ new `DeleteAccountModal`); new hooks `useUploadAvatar`, `useDeleteAccount`; `useTheme` (auth feature) extended

- [x] `SettingsView` nav: left rail with gradient active-marker; horizontal scrollable pills on mobile — new `SettingsNav`; the active section is **hash-driven** (`#profile` … `#security`) so the Creator sidebar deep links (`/settings#accounts`, `/settings#subscription`) keep working (tab clicks assign `location.hash`, which also refreshes the sidebar's active item); page header per mockup (display title + subtitle); redundant bottom logout button removed (the Creator sidebar has Logout on all viewports)
- [x] `ProfileSection`: avatar upload overlay (hover/focus camera overlay + spinner, wired to the real `POST /users/me/avatar` via new `useUploadAvatar`, 5 MB client check), verified email chip (display-only — no verification flow exists), save button disabled-until-dirty. Mockup's username + bio omitted — `PATCH /users/me` only supports `displayName`/`locale`; language select moved to Appearance
- [x] `ConnectedAccountsSection`: platform cards with identity-tinted icon, Connected green / amber Reconnect pill (driven by `isActive`, same convention as the dashboard `AccountCard`), per-platform permissions summary (static i18n — scopes aren't exposed client-side), "Disconnect" danger ghost, dashed "Connect a platform" card (reuses `ConnectAccountModal`), locked slot with padlock + "Upgrade to Pro" gradient link (→ `#subscription`) once the free-tier 2-account limit is filled, "n of 2 accounts used" counter
- [x] `SubscriptionSection`/`PlanCard`: gradient-border current plan (`CurrentPlanCard` with renewal/cancel date), usage meters (`UsageMeters`: accounts n/max gradient bar + hours streamed this month via `useMonthlyStats`), payment method row (`PaymentMethodsRow` lists the methods accepted at checkout — there is **no saved-payment-method API**, so the mockup's "Visa •••• 4242" is not reproducible), plan grid restyled (gradient border on current, gradient "Popular" pill, `.btn-gradient` select; checkout flow untouched). **Invoice table omitted — billing service has no invoices endpoint**
- [x] `NotificationsSection`: toggles grouped into "Stream activity" / "Account & billing" cards, gradient "on" state (extracted `NotificationToggleRow`)
- [x] `AppearanceSection`: 3 theme preview cards Dark/Light/System with mini dashboard mocks (`ThemePreviewCard` + `ThemeMiniPreview`, System = diagonal split), active gradient border + check; EN/FR select (persists via cookie + `PATCH /users/me`). `useTheme` extended with a `system` preference — absent localStorage key = system (matches the pre-paint bootstrap script), matchMedia listener follows OS changes live; existing `toggle`/`theme` API unchanged for `ThemeToggleButton`
- [x] `SecuritySection`: password form restyled (reuses the auth feature's `PasswordField`; fabricated "changed 30 days ago" copy replaced with a static hint), active sessions card shows the **current device only** (parsed from `navigator.userAgent` + "Current" badge — there is no sessions-list/revoke API, so the mockup's revoke list is omitted), red danger-zone card with type-to-confirm `DeleteAccountModal` (localized confirm word DELETE/SUPPRIMER) wired to the real `DELETE /users/me` — 409 (live session running) surfaced specifically, logout on success

Phase notes (2026-07-08): the users-service routes behind the new wiring (`POST /users/me/avatar`, `DELETE /users/me`) are still doc-stubs server-side — the UI is wired to their documented contracts and will light up when the service is implemented. New i18n keys `settings.subtitle`, `settings.nav.*`, `settings.profile.title/avatarHint/changeAvatar/verified/avatarUploaded/avatarUploadFailed/avatarTooLarge`, `settings.connectedAccounts.title/connectPlatform/accountsUsed/permissionsLabel/permissions.*/disconnect/lockedTitle/lockedUpgrade`, `settings.subscription.title/currentPlanTitle/availablePlans/usage.*/paymentMethodsTitle/paymentMethodsSubtitle`, `settings.notifications.title/groupStream/groupAccount`, `settings.appearance.title/themeSystem/language`, `settings.security.title/passwordHint/sessions.*/danger.*` (EN+FR parity verified by script). `pnpm --filter web typecheck` green (repo `next lint` script is broken pre-existing). Screenshot-verified via CDP against the local dev stack with a real registered user (refresh-cookie bootstrap) at 375/768/1280, dark + light, every tab — `GET /integrations/accounts` stubbed at the CDP `Fetch` layer (incl. CORS preflight) to exercise Connected + Reconnect pills and the locked slot; also captured: open password form, armed type-to-confirm delete modal, mobile pill nav.

### Follow-up (2026-07-08) — Accounts management split out to `/accounts`

Connected-accounts management was separated from general settings into its own page (prompt №9 in `stitch-redesign-prompts.md`):

- New route `app/accounts/page.tsx` (thin) → `AccountsView` in `features/accounts/` (same Creator Studio shell as Settings: sidebar toggle, back link, ambient orbs). The OAuth connect callback feedback (`?connected=` / `?error=connect_failed`) moved from `SettingsView` to `AccountsView`, and the integrations service OAuth callback now redirects to `/accounts` instead of `/settings`.
- `ConnectedAccountsSection`, `ConnectedAccountCard`, `LockedAccountSlot` and hooks `useConnectTikTok`, `useConnectFacebook`, `useRemoveAccount` moved from `features/settings/` to `features/accounts/` (fixes the pre-existing accounts→settings cross-feature hook imports); `FREE_PLAN_MAX_ACCOUNTS` moved to `accounts.consts.ts`.
- `/settings` now has 5 sections (profile, subscription, notifications, appearance, security); `settings.nav.accounts` i18n key removed, new `accounts.page.title/subtitle` keys (EN+FR). A legacy `/settings#accounts` deep link client-redirects to `/accounts`.
- `CreatorSidebar`: Accounts item → `/accounts` (path-based active state; hash tracking removed). Dashboard `AccountList`/`AccountCard` "Manage" links → `/accounts`; the freemium "Upgrade" link → `/settings#subscription`.
- Stitch: Settings mockup edited to drop the Connected Accounts nav item/section; new "Connected Accounts" desktop screen generated (see screen inventory).

Implementation against the Connected Accounts mockup (`05d7f5758c1b4b7ea9e46472ae088dfd`) — done 2026-07-08:

- [x] Page header: display title + subtitle, right-aligned usage pill — new `AccountsUsageBadge` (green/amber dot + "n of 2 accounts used" + FREE PLAN chip; free tier only, hidden while loading)
- [x] `ConnectedAccountCard` redesigned: gradient-ring avatar (grey ring + grayscale when expired), name + Connected/**Expired** status pill (new `accounts.status.expired` key), identity-tinted platform icon line, amber "Reconnect to resume streaming" link on expired cards (replaces the old amber Reconnect pill), permission-scope **chips** (PERMISSIONS / PERMISSIONS (DISABLED) label; static `PLATFORM_PERMISSION_SCOPES` in `accounts.consts.ts` → `accounts.page.scopes.*` keys — OAuth scopes aren't exposed client-side), footer "Connected since {Mon YYYY}" + Disconnect. Mockup's follower count and "Token expired 2 days ago" omitted (no data client-side: `SocialAccount` has no follower/expiry fields); kebab menu omitted (all its actions are already visible on the card)
- [x] Connect dashed card gained the hint line ("Add TikTok or Facebook" — mockup's YouTube/Twitch/RTMP copy replaced with the real platforms)
- [x] `LockedAccountSlot`: lock icon + title + "Free plan is limited to {max} concurrent account connections." description + gradient "Upgrade to Pro …" link — now a real `Link` to `/settings#subscription` (was `location.hash = 'subscription'`, a no-op leftover from when the section lived on `/settings`)
- [x] Empty state — new `NoAccountsEmptyState` (icon, title, description, gradient "Connect your first account" CTA opening `ConnectAccountModal`); shown when 0 accounts, replacing the bare dashed card
- [x] Loading skeletons + OAuth `?connected=` success toast were already in place (mockup's "Empty & Loading States" strip is a design-spec demo section, not a page section)
- [x] i18n: `settings.connectedAccounts.*` namespace fully migrated into `accounts.page.*` (settings no longer owns any accounts strings; mobile never used them) — EN+FR parity verified
- [x] Section heading + counter removed from `ConnectedAccountsSection` (page header owns them now); `pnpm --filter web typecheck` green; CDP screenshot-verified at 375/768/1280, dark + light: connected+expired+locked (2/2), connected+connect card (1/2), open connect modal, empty state (`GET /integrations/accounts` stubbed at the CDP Fetch layer incl. CORS preflight)

## Phase 7 — Legal & compliance pages

**Files:** `features/legal/` — `PrivacyView`, `TermsView`, `DataDeletionView`; new: `LegalPageLayout`, `LegalNav`, `LegalFooter`, `LegalToc`, `LegalCallout`, `LegalIcons`, `DataDeletionCard`, `DataDeletionChecklist`, `DataDeletionForm`, `DataDeletionConfirmDialog`, `DataDeletionSuccess`; hooks `useActiveSection`, `useDataDeletionRequest`; `app/data-deletion/page.tsx` (now thin)

- [x] Shared legal template: slim nav (`LegalNav` — wordmark + back link only, theme/locale switchers dropped to match the mockup, matching the OAuth-callback precedent of controls living only where the design calls for them), "Last updated" banner + plain-language summary callout, sticky TOC with gradient active marker (`LegalToc` + `useActiveSection` IntersectionObserver hook; collapses to a native `<select>` dropdown below `md`), 720 px prose column, highlighted callout boxes (`LegalCallout` — `banner` variant for the summary, `note` variant reused on the Data Deletion grace-period line)
- [x] Applied to `PrivacyView` and `TermsView` — both now thin wrappers mapping `PRIVACY_SECTION_KEYS`/`TERMS_SECTION_KEYS` (moved to `legal.consts.ts`) to `LegalPageLayout`; new `legal.summaryLabel`, `legal.toc.title`, `legal.privacy.summary`, `legal.terms.summary` i18n keys (EN+FR)
- [x] Data deletion: centered card (`DataDeletionCard`), 4-item deletion checklist (`DataDeletionChecklist`, icons in new `LegalIcons`), email + optional reason form (`DataDeletionForm`), red submit with confirm dialog (`DataDeletionConfirmDialog`, same `alertdialog` pattern as `EndStreamDialog`/`DeleteAccountModal`), success state with reference ID chip (`DataDeletionSuccess`). **No backend accepts an unauthenticated deletion request** (only the Facebook signed-request webhook actually deletes anything, via the existing `app/api/auth/facebook/deletion/route.ts` → `POST /auth/oauth/deletion`) — confirming the manual form composes a real `mailto:support@tiklivepro.me` with a locally generated `DEL-{year}-{code}` reference embedded in the body, rather than faking a server response. The page now branches on `?code=` (Facebook webhook redirect → immediate "Request received" success reusing the real code) vs. the manual flow (form → confirm → drafted-email success), both sharing `DataDeletionSuccess`

Phase notes (2026-07-08): shared `LegalFooter` (Privacy/Terms/Data deletion links, reuses `landing.footer` i18n keys per the `AUTH_LEGAL_LINKS` precedent) replaces the old per-page "TikLivePro — {other doc}" footer. New i18n keys `legal.dataDeletion.*` (title/subtitle/checklist.*/gracePeriodNote/form.*/confirm.*/success.*/contactSupport) — EN+FR parity verified by script. `pnpm --filter web typecheck` green. CDP screenshot-verified at 375/768/1280, dark + light, for Privacy, Terms, and Data Deletion (incl. the mobile TOC dropdown, filled form → confirm dialog → success state end-to-end, and the `?code=` Facebook deep link); FR locale spot-checked on the Data Deletion page.

## Phase 8 — Shared states

- [x] 404 page (gradient "404", "Back to dashboard") — `app/not-found.tsx` restyled with `.glass-overlay` card, floating icon (new `.animate-float-gentle` primitive) with a red X badge, ghost gradient "404" behind, and a `.btn-gradient` CTA that reads the auth store: authenticated → "Back to dashboard" (`/dashboard`), logged out → "Back to home" (`/`)
- [x] Generic error page with retry + collapsible details — new `app/error.tsx` (client boundary): warning icon + "System Error" label, title/message, `<details>` "Technical Details" (error message + digest), "Retry" (calls `reset()`) and "Back to home" actions
- [x] Toast system restyle: success/error/info glass style + "You're live!" pulsing toast — sonner's `--normal/success/error/info-bg|border|text` CSS vars retargeted to the surface tokens in `globals.css` (glass blur + 4px colored left accent per `data-type`; `richColors` dropped since we now own the palette); new `LiveToast` (`features/stream/components/LiveToast.tsx`, `showLiveToast()`) renders a `bg-gradient-brand` toast with a pulsing dot (new `.pulse-live-dot` primitive) — wired into `useStream.ts`'s two "session started" call sites (replacing the old plain `toast.success`)
- [x] Skeletons: dashboard card, comment row, video tile with gradient sweep — new shared primitives in `src/components/skeletons/` (`DashboardCardSkeleton`, `CommentRowSkeleton`, `VideoTileSkeleton`), all built on the existing `.skeleton` shimmer utility. Wired into real gaps: `SubscriptionSection` (current-plan + plan-grid loading, replacing ad hoc divs), `ReplayTimeline` (comment-replay loading, replacing a plain `animate-pulse` block), `RecentSessionsTable` and `SessionHistory` (both previously showed generic bars or a blank flash — `if (loading) return <></>`)
- [x] Upgrade/paywall modal (gradient border, benefit rows, price toggle) — new `UpgradeModal` (`features/settings/components/UpgradeModal.tsx`): gradient-border wrapper, "Pro Feature" chip, Monthly/Yearly toggle (cosmetic -20% yearly display only, same precedent as the landing pricing toggle — checkout itself is monthly-only), benefit rows sourced from the real `premium` plan via `usePlans()` (`FEATURE_LABEL_KEYS` moved from `PlanCard` into `settings.consts.ts` and reused), gradient "Upgrade now — $price/mo" CTA. Wired into `LockedAccountSlot` (accounts feature, cross-imported from `@/features/settings`), replacing the old bare "Upgrade to Pro" link
- [x] `ConnectAccountModal`: platform grid with greyed "More coming soon" tiles — converted from a vertical row list to a 2-col icon-tile grid (TikTok/Facebook) plus 2 dashed, opacity-40 locked tiles (reuses the existing `LockIcon`) captioned "More coming soon" (deliberately generic — no unannounced platform names), and an info line about the OAuth redirect/password privacy below the grid

Phase notes (2026-07-08): reference mockup fetched via Stitch (`22b70e42b72b402e95a4d9839cffa71d` desktop / `c01a18605bc643b9ad5b1eb351e3fc75` mobile — a single "UI State Gallery" reference sheet, not a real page layout, so each section maps to a component/primitive rather than a route). New i18n keys: `notFound.goDashboard`, `errorPage.*`, `stream.liveToastSubtitle`, `settings.subscription.upgradeModal.*`, `accounts.modal.comingSoon/privacyNote` (EN+FR parity verified by script). `pnpm --filter web typecheck` green. Screenshot-verified via a persistent headless-Chrome + CDP session (bun + `chrome-remote-interface`) against the local dev stack with a real registered throwaway user (refresh-cookie bootstrap): 404 and error pages at 375/1280 dark+light (error page triggered via a temporary throw-on-render test route, removed after capture); `ConnectAccountModal` grid dark+light from the real `/accounts` empty state; the "Stream is live!" toast triggered end-to-end through a real Go-Live form submission; `UpgradeModal` at 375/1280 dark+light rendered with real premium-plan data (temporary standalone test route, removed after capture — reaching it via the real `LockedAccountSlot` needs 2 OAuth-connected accounts, not reproducible in dev); the `DashboardCardSkeleton` grid on `/settings#subscription` caught mid-flight via CDP network throttling.

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
| 5 | Watch Page | ☑ Done |
| 6 | Settings | ☑ Done |
| 7 | Legal + Data deletion | ☑ Done |
| 8 | Shared states | ☑ Done |

Update the status column (`☐ Not started` → `◐ In progress` → `☑ Done`) and tick checkboxes as work lands. Ship phases as separate PRs; Phase 0 must merge first.
