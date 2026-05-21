# Rule: TikLivePro Frontend Architecture

This rule covers feature-first modular components, mobile-first responsive design, Zustand stores, and localization across Web (Next.js) and Mobile (React Native) clients.

## 1. Feature-First Directory Structure

All frontend capabilities must be organized into modular features under `src/features/<feature>/`. Do not create global `hooks/` or `store/` folders; state and hooks must be co-located with their owning feature.

### Directory Layout
```
src/features/<feature>/
├── components/     # Feature-specific UI components (one component per file)
├── hooks/          # Custom hooks specific to this feature (one hook per file)
├── store/          # Zustand stores for this feature
├── consts/         # Feature-specific constants (no magic values in components)
├── interfaces/     # TypeScript types/interfaces specific to this feature
└── index.ts        # Barrel file re-exporting only public feature APIs
```

### Constraints
- **Thin Pages**: Routing page controllers (Next.js App Router files or Mobile screens) must act as thin wrappers, importing and composing components from feature directories. Keep business logic, fetching, and event handlers inside hooks.
- **No Inline Components**: Every named component that renders UI must reside in its own file under `components/`.
- **Barrel Exports**: Interact with other features strictly by importing from their `index.ts` barrel file to prevent tight coupling.

---

## 2. Responsive UI & Layouts (Web)

- All web interfaces must be fully responsive.
- Apply mobile-first responsive utility prefixes (`sm:`, `md:`, `lg:`) on every page and layout.
- Test and verify views at three target viewports:
  - **Mobile**: 375 px
  - **Tablet**: 768 px
  - **Desktop**: 1280 px

---

## 3. Localization (i18n)

- Never hardcode user-facing strings directly in components or pages.
- Place all translations in localization resource keys inside `packages/i18n/locales/en.json` and `fr.json`.
- Use the translation hook/component to dynamically load strings based on the user's selected language.
