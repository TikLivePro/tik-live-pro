# TikLivePro — Google Stitch Full Redesign Prompts

> Last updated: 2026-07-06

This file contains ready-to-paste prompts for [Google Stitch](https://stitch.withgoogle.com) to completely redesign the TikLivePro web app. Use the **Master Design Brief** as the first prompt of your Stitch project (it sets the design system), then generate each screen with its dedicated prompt. Each screen prompt is self-contained, so it also works standalone.

**Tip:** In Stitch, generate desktop (1280 px) first, then ask "adapt this screen for mobile (375 px)" — every screen must be responsive (375 / 768 / 1280).

---

## 1. Master Design Brief (paste first)

```
Design a complete, modern web app called "TikLivePro" — a professional live-streaming
platform that lets creators broadcast simultaneously to TikTok and Facebook, watch
aggregated real-time comments from both platforms in one feed, and manage connected
social accounts and subscriptions.

DESIGN SYSTEM:
- Mood: premium, energetic, creator-focused. Think "Linear meets Twitch".
- Theme: dark-first. Background: deep charcoal (#0B0B0F) with subtle layered surfaces
  (#141419, #1C1C24). Also provide a clean light variant.
- Brand accent: a red-to-orange gradient (#FF2D55 → #FF7A00) used on primary CTAs,
  the LIVE badge, active states, and key data highlights. Never use flat blue as accent.
- Secondary accents: TikTok cyan (#25F4EE) and Facebook blue (#1877F2) ONLY as small
  platform identity chips/icons, never for CTAs.
- Typography: modern grotesque (e.g. Inter / General Sans). Big confident headings,
  tight letter-spacing on display sizes, 14–15px comfortable body.
- Shape: 12–16px rounded corners on cards, pill-shaped buttons and badges,
  1px subtle borders (white at 6–8% opacity) instead of heavy shadows.
- Depth: soft glow behind the gradient CTAs, glassmorphism (blur + translucency) on
  overlays and sticky navs.
- Motion feel (communicate visually): pulsing red dot on LIVE badges, animated
  gradient shimmer on primary buttons, skeleton loaders.
- Iconography: thin 1.5px stroke icons (Lucide style).
- Everything responsive: 375px mobile, 768px tablet, 1280px desktop.
- Accessibility: AA contrast minimum, visible focus rings using the brand gradient.
```

---

## 2. Landing Page — `/`

```
Design the marketing landing page for TikLivePro (dark theme, red→orange gradient brand).

STRUCTURE, top to bottom:

1. Sticky glass navbar: logo "TikLivePro" (gradient wordmark), links: Features,
   Pricing, Docs; right side: "Log in" ghost button + "Go Live Free" gradient pill CTA.

2. Hero section: huge headline "Go live everywhere. At once." with the word
   "everywhere" in the brand gradient. Subheadline: "Broadcast to TikTok and Facebook
   simultaneously, and read every comment in one unified feed." Two CTAs:
   "Start streaming free" (gradient, glowing) and "Watch demo" (ghost with play icon).
   Below the CTAs, a large product mockup: a dark live-streaming dashboard preview
   showing a video tile with a pulsing LIVE badge, viewer count, and a real-time
   comment feed with TikTok and Facebook platform chips on each comment. The mockup
   tilts slightly in 3D perspective with a soft gradient glow behind it.
   Social proof strip: "Trusted by 12,000+ creators" with 5 small avatar circles.

3. Features section: 6 feature cards in a 3×2 grid (1 column on mobile):
   - Multi-platform broadcast (one stream → TikTok + Facebook)
   - Unified comment feed (merged real-time comments with platform badges)
   - OBS & RTMP ingest (professional ingest with stream key)
   - Live analytics (viewers, peak concurrents, reactions)
   - Account manager (connect/disconnect socials with OAuth)
   - Instant replays (auto-recorded sessions)
   Each card: thin-stroke icon in a gradient-tinted rounded square, title, 2-line
   description, subtle border, lifts with glow on hover.

4. "How it works" — 3 numbered horizontal steps: Connect your accounts → Configure
   your stream → Go live everywhere. Connected by a thin gradient line.

5. Pricing section: 3 plan cards — Free (2 connected accounts, 720p, TikLivePro
   watermark), Pro highlighted with gradient border + "Most popular" badge ($19/mo,
   unlimited accounts, 1080p, no watermark, analytics), Studio ($49/mo, 4K, team
   seats, priority support). Monthly/Yearly toggle with "-20%" pill on Yearly.

6. Final CTA band: full-width gradient panel, "Your audience is everywhere.
   Be there." + "Start free" white button.

7. Footer: 4 columns (Product, Company, Legal — Privacy, Terms, Data deletion —
   Social), language switcher EN/FR, small copyright.

Fully responsive; on mobile the navbar collapses to a hamburger sheet menu.
```

---

## 3. Login Page — `/auth/login`

```
Design a login screen for TikLivePro (dark theme, red→orange gradient brand).

Split layout on desktop:
- LEFT 45%: auth panel on deep charcoal. Logo top-left. Heading "Welcome back",
  subtext "Log in to manage your live streams." Social login buttons stacked:
  "Continue with TikTok" (black button, cyan/red TikTok glyph) and "Continue with
  Facebook" (Facebook-blue button). Divider "or continue with email". Email +
  password fields (rounded, subtle inner border, focus ring in brand gradient),
  "Forgot password?" link, full-width gradient "Log in" button. Bottom:
  "New here? Create an account" link. Include a small error state variant: a red
  toast/inline alert "Invalid credentials".
- RIGHT 55%: immersive brand visual — abstract dark gradient mesh in red/orange
  with a floating mockup of the live dashboard (video tile + LIVE badge + comment
  feed) and a short testimonial quote card from a creator with avatar.

Mobile: single column, brand visual removed, logo centered on top, form fills width.
```

---

## 4. OAuth Callback / Loading — `/auth/social-callback`

```
Design a minimal full-screen transitional page for TikLivePro shown while an OAuth
login completes (dark theme). Centered: TikLivePro gradient logo, a circular loader
whose stroke is the red→orange gradient, text "Connecting your account…" and a
subtext "You'll be redirected in a moment." Include a failure state variant: warning
icon, "We couldn't connect your account", explanation line, and two buttons:
"Try again" (gradient) and "Back to login" (ghost). No navbar, no footer.
```

---

## 5. Dashboard (Home) — `/dashboard`

```
Design the main dashboard of TikLivePro, a live-streaming control center
(dark theme, red→orange gradient brand).

LAYOUT: top app bar + content grid.
- App bar: logo left; center: nothing; right: notification bell with unread dot,
  theme toggle, user avatar menu.

CONTENT (desktop, 12-col grid):

1. Header row: "Ready to go live, Alex?" greeting + date. Right-aligned primary
   gradient CTA "Go Live" with a broadcast icon.

2. LEFT MAIN COLUMN (8 cols) — "Go Live" setup card:
   - Stream title input, description textarea.
   - Destination selector: horizontal row of connected-account chips
     (TikTok @handle with cyan chip, Facebook Page name with blue chip), each
     toggleable with a checkmark; "+ Connect account" dashed chip.
   - Source selector: two segmented options "Camera" (with a live camera preview
     tile) and "OBS / RTMP" (revealing a stream-key field with copy button and
     server URL, key masked with an eye toggle).
   - Big gradient "Start broadcast" button, disabled state variant when no
     destination selected.

3. RIGHT COLUMN (4 cols):
   - Connected accounts card: list rows with platform icon, @handle, status pill
     (Connected green / Token expired amber with "Reconnect" link), kebab menu.
     Footer note "Free plan: 2 accounts max — Upgrade" with gradient "Upgrade" link.
   - Quick stats card: 3 stat tiles — Total streams, Hours live, Peak viewers.

4. FULL-WIDTH BOTTOM — "Recent sessions" history: table/list of past streams:
   thumbnail, title, date, duration, destinations (platform chips), peak viewers,
   status badge (Ended / Recorded), row action "Watch replay". Empty-state variant:
   illustration + "Your first stream will appear here."

Mobile: single column in order — greeting, Go Live card, accounts, stats, history
as stacked cards; sticky bottom "Go Live" gradient button.
```

---

## 6. Live Streamer View — `/live/[sessionId]`

```
Design the LIVE streaming control room for TikLivePro — the screen a creator sees
while broadcasting (dark theme, red→orange gradient brand). Dense, mission-control
feel, everything visible at a glance.

DESKTOP LAYOUT (3 zones):

1. TOP STATUS BAR: pulsing red "● LIVE" pill + elapsed timer (00:42:17),
   stream title, destination platform chips with per-platform health dots
   (TikTok: green "Streaming", Facebook: green "Streaming" — include an amber
   "Reconnecting" variant), current viewer count with eye icon, and a prominent
   red "End stream" button (with confirm-dialog variant).

2. LEFT/CENTER (≈65%): large 16:9 video monitor tile of the outgoing stream with
   a thin gradient border, overlay chips top-left (LIVE + timer) and top-right
   (bitrate/health "6.2 Mbps · Excellent"). Under it a stats strip of 4 compact
   tiles: Current viewers, Peak viewers, New followers, Reactions — each with a
   tiny sparkline. Below, a collapsible "Stream settings" row: resolution,
   ingest source, copy stream key.

3. RIGHT PANEL (≈35%): unified live comment feed, the hero feature:
   - Header "Live comments" with filter chips: All / TikTok / Facebook and a
     pause-autoscroll toggle.
   - Fast-scrolling feed: each comment row = small avatar, username, platform
     badge (cyan TikTok / blue Facebook), message, timestamp; special rows for
     gifts/reactions with subtle gradient background; a pinned comment variant.
   - Bottom composer: input "Reply to your audience…" with emoji button and
     send button; replies broadcast to both platforms.
   - Secondary tab "Viewers" listing current viewers with platform badges.

Mobile: full-bleed video on top with overlaid LIVE pill and viewer count, stats
strip as horizontal scroll, comment feed fills the rest, End stream as a sticky
bottom-right red button.
```

---

## 7. Viewer Watch Page — `/watch/[sessionId]`

```
Design the public viewer page of TikLivePro where anyone watches a live stream
(dark theme, red→orange gradient brand). Feels like a polished Twitch/YouTube-Live
hybrid.

DESKTOP LAYOUT:
- Minimal top bar: logo, "Log in" ghost button (viewers can watch logged out).
- LEFT (≈70%): large 16:9 video player with custom controls (play/pause, volume,
  quality selector, fullscreen), "● LIVE" pill and viewer-count chip overlaid
  top-left. Below the player: stream title, creator identity row (avatar, name,
  "Follow" gradient button), destination chips showing it's also live on TikTok
  and Facebook, and floating emoji reactions rising over the bottom of the video.
- RIGHT (≈30%): live chat panel — comment feed with avatars, usernames, platform
  badges, and messages; sticky input at bottom "Say something…" with emoji and
  GIF buttons. For logged-out users show a variant where the input is replaced by
  a "Log in to chat" gradient button. Include a reaction bar with 5 quick emoji
  (❤️ 🔥 😂 👏 😮) that anyone can tap.

Also include an OFFLINE state variant of the page: dimmed player area with
"This stream has ended", replay thumbnail with play button, and a "More from this
creator" row of 3 past-session cards.

Mobile: video full-width on top (sticky while scrolling), title/creator below,
chat takes the remaining height, reaction bar floats above the chat input.
```

---

## 8. Settings — `/settings`

```
Design the settings area of TikLivePro (dark theme, red→orange gradient brand).

LAYOUT: left vertical section nav (icons + labels) with the active item highlighted
by a gradient accent bar; content area on the right. Sections:

1. PROFILE: avatar upload with edit overlay, display name, email (read-only with
   "verified" check), username, bio textarea, "Save changes" gradient button
   (disabled until dirty).

2. CONNECTED ACCOUNTS: cards per platform — TikTok and Facebook. Each card:
   platform logo, connected @handle + profile picture, status pill
   (Connected / Expired), granted permissions summary, "Disconnect" danger ghost
   button. A "+ Connect a platform" card with dashed border. Show the freemium
   limit state: a locked third slot with a padlock and "Upgrade to Pro to connect
   more accounts" gradient link.

3. SUBSCRIPTION & BILLING: current plan card ("Pro — $19/mo" with gradient border,
   renewal date, "Manage plan" and "Cancel" links), usage meters (connected
   accounts 2/2, streamed hours), payment method row (Visa •••• 4242 with "Edit"
   opening a card modal), invoice history table (date, amount, status, download
   icon).

4. NOTIFICATIONS: grouped toggle switches — Email (stream summary, billing
   receipts, product news) and Push (stream went live, comment spikes, follower
   milestones). Toggles use the brand gradient when on.

5. APPEARANCE: theme selector as 3 visual preview cards (Dark / Light / System)
   with the active one gradient-bordered; language select EN/FR.

6. SECURITY: change-password form, active sessions list (device icon, browser,
   location, "current" badge, "Revoke" link), and a red-tinted DANGER ZONE card:
   "Delete my account" with an explanation and a destructive confirm modal variant
   (type-to-confirm input).

Mobile: the section nav becomes horizontal scrollable pills under the page title.
```

---

## 9. Legal — Privacy `/legal/privacy` & Terms `/legal/terms`

```
Design a clean legal document template page for TikLivePro used for both the
Privacy Policy and the Terms of Service (dark theme with a readable long-form
light-on-dark text column).

- Slim top nav (logo + "Back to home").
- Header: document title "Privacy Policy", "Last updated: June 2026" and a
  one-line plain-language summary in a subtle info banner.
- Two-column desktop layout: sticky table-of-contents on the left (numbered
  section links, active section highlighted with a gradient marker), 720px
  max-width prose column on the right with clear H2/H3 hierarchy, comfortable
  1.7 line-height, styled lists, and highlighted definition callout boxes.
- Footer with links to Terms, Privacy, Data deletion.
Mobile: TOC collapses into a "Contents" dropdown above the prose.
```

---

## 10. Data Deletion — `/data-deletion`

```
Design a "Data deletion request" page for TikLivePro (dark theme, red→orange
gradient brand) — required for Facebook/TikTok platform compliance.

- Slim top nav (logo + back link).
- Centered 640px card: shield/trash icon in a red-tinted rounded square, title
  "Delete your data", explanation of what gets deleted (account, connected social
  tokens, stream history, recordings) and the 30-day processing window as a
  4-item checklist with icons.
- Form: email field + optional reason select + "Request deletion" red button
  with confirm modal variant.
- Success state variant: green check, "Request received", reference ID chip
  (e.g. DEL-2026-8841), "You'll get a confirmation email."
- Small print: links to Privacy Policy and contact support.
```

---

## 11. Shared States (generate once, reuse)

```
Design a set of shared UI states for TikLivePro (dark theme, red→orange gradient):

1. 404 page: giant gradient "404", "This stream doesn't exist", floating broken
   play-button illustration, "Back to dashboard" gradient button.
2. Generic error page: warning icon, "Something went wrong", retry button,
   collapsible technical-details accordion.
3. Toast/notification system: success (green), error (red), info (neutral), and a
   special "You're live!" toast with pulsing dot — all glass style, bottom-right.
4. Loading skeletons: dashboard card skeleton, comment-row skeleton, video-tile
   skeleton with shimmering gradient sweep.
5. Upgrade/paywall modal: gradient-bordered modal, "Unlock Pro", 4 benefit rows
   with check icons, price toggle, "Upgrade now" gradient CTA.
6. Connect-account modal: platform choice grid (TikTok, Facebook, greyed-out
   "More coming soon" tiles), OAuth-redirect explainer line.
```

---

## Suggested Stitch workflow

1. New Stitch project → paste the **Master Design Brief**.
2. Generate screens in this order (later screens reuse earlier components):
   Landing → Dashboard → Live Streamer View → Watch → Settings → Login →
   Callback → Legal → Data deletion → Shared states.
3. For each screen: generate desktop, then prompt *"Adapt this exact screen for
   a 375px mobile viewport, keeping the same components and hierarchy."*
4. Iterate with targeted prompts (e.g. *"make the comment feed denser"*,
   *"increase contrast of the stat tiles"*).
5. Export to Figma via Stitch's "Copy to Figma", or copy the generated frontend
   code as a styling reference for the Tailwind implementation in `apps/web`.
