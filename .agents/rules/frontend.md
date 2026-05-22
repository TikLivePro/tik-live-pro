# Rule: TikLivePro Frontend Architecture

This rule covers feature-first modular components, mobile-first responsive design, Zustand stores, and localization across Web (Next.js) and Mobile (React Native) clients.

> **Keep in sync with:** `CLAUDE.md` (Frontend Feature Architecture section) · `docs/setup.md` (Mobile section)

---

## 1. Feature-First Directory Structure

All frontend capabilities must be organized into modular features under `src/features/<feature>/`. Do not create global `hooks/` or `store/` folders; state and hooks must be co-located with their owning feature.

### Directory Layout

```
src/features/<feature>/
├── components/     # Feature-specific UI components (one component per file)
├── hooks/          # Custom hooks specific to this feature (one hook per file)
├── store/          # Zustand stores owned by this feature
├── consts/         # Feature-specific constants (no magic values in components)
├── interfaces/     # TypeScript types/interfaces specific to this feature
└── index.ts        # Barrel file re-exporting only public feature APIs
```

### Constraints

- **Thin pages**: Next.js App Router files and Mobile screen components must act as thin wrappers — compose feature components only; no data fetching, hooks, or business logic directly in page files.
- **No inline components**: every named component that renders UI must reside in its own file under `components/`.
- **Barrel exports**: interact with other features strictly by importing from their `index.ts` barrel file to prevent tight coupling.
- **No magic values**: move all strings, numbers, colors, and API path constants to `consts/<feature>.consts.ts`.

---

## 2. Responsive UI & Layouts (Web)

- All web interfaces must be **fully responsive**.
- Use **mobile-first** Tailwind breakpoint prefixes (`sm:`, `md:`, `lg:`) on every page and layout component.
- Verify every view at three target viewports:
  - **Mobile**: 375 px
  - **Tablet**: 768 px
  - **Desktop**: 1280 px
- Never ship a web component that is only verified at a single viewport.

---

## 3. Localization (i18n)

- Never hardcode user-facing strings in components or pages.
- Place all translations in `packages/i18n/locales/en.json` and `fr.json`.
- Use the `next-intl` translation hook (`useTranslations`) to load strings dynamically.
- For dynamic values (e.g. `{{days}}`), ensure the message key uses the correct placeholder syntax before calling `t('key', { days })`. Malformed placeholders throw `MALFORMED_ARGUMENT` at runtime.

---

## 4. State Management

- Use **Zustand** for client-side state.
- Stores are co-located inside the feature that owns them: `src/features/<feature>/store/`.
- Cross-feature shared state (e.g. authenticated user, auth tokens) lives in `src/store/` (mobile) or the `auth` feature store (web). A store is only "shared" if two or more features genuinely depend on it.
- Do not use React Context for global state management — prefer Zustand.
- Do not store server data in Zustand — use React Query or SWR for server state.

---

## 5. API Communication

- All HTTP API calls go through the centralized client in `src/lib/api.ts`.
- `API_BASE` is read from the environment — never hardcode the URL.
- WebSocket connections (comments) use `COMMENTS_WS_URL` from `src/lib/api.ts`.
- Never call a service directly (e.g. `http://localhost:3001`) — always route through the API Gateway (`http://localhost:3000`).

---

## 6. Authentication

- Session management is handled by **NextAuth.js** (`apps/web`).
- The `NEXTAUTH_URL` env var must match the registered redirect URIs in Google Cloud Console and TikTok/Meta developer portals exactly.
- Access tokens for API calls are attached via `Authorization: Bearer <token>` header inside `src/lib/api.ts`.
- Never store raw access tokens in `localStorage` — use NextAuth session cookies.
