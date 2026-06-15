# V9 — Migration du Refresh Token vers httpOnly Cookie

> **Date :** 2026-06-15  
> **Statut :** Planifié  
> **Périmètre :** `apps/web` uniquement — aucun service backend n'est modifié  
> **Priorité :** Medium (V9 dans l'audit de sécurité)

---

## 1. Contexte et problème

Aujourd'hui le `refreshToken` (durée de vie 30 jours) est persisté dans `localStorage`
via le middleware `persist` de Zustand (clé `tik-live-pro-auth`).

```
localStorage["tik-live-pro-auth"] = {
  refreshToken: "dGhpc2...",   ← 🔴 accessible à tout JS sur la page
  userId: "...",
  isAuthenticated: true,
  ...
}
```

**Conséquence :** une XSS — même mineure, même dans une dépendance tierce — peut voler
le refresh token et maintenir un accès prolongé pendant 30 jours sans que l'utilisateur le
sache.

**Solution :** déplacer le refresh token dans un cookie `httpOnly`. Ce cookie est
**invisible au JavaScript** ; seul le navigateur peut l'envoyer, et uniquement vers la
même origine.

---

## 2. Architecture cible

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (client JS)                                            │
│                                                                 │
│  Zustand (memory only)                                          │
│  ┌───────────────────────────────────┐                         │
│  │ accessToken (15 min, in-memory)   │                         │
│  │ userId, displayName, tier, ...    │  ← localStorage OK      │
│  └───────────────────────────────────┘                         │
│                                                                 │
│  Cookie jar (managed by browser)                               │
│  ┌───────────────────────────────────┐                         │
│  │ refresh_token (httpOnly, 30 days) │  ← JS cannot read this  │
│  └───────────────────────────────────┘                         │
│           │                                                     │
│           │ automatic (browser sends cookie)                    │
│           ▼                                                     │
│  POST /api/auth/session/refresh  (Next.js Route Handler)       │
│           │                                                     │
└───────────│─────────────────────────────────────────────────────┘
            │ server-side fetch (not visible to browser JS)
            ▼
  POST /auth/refresh  (API Gateway → Auth Service)
            │
            └─ rotates refresh token → new accessToken + new refreshToken
                                           │
                               sets new cookie + returns accessToken
```

### Propriétés du cookie

| Attribut | Valeur |
|----------|--------|
| `Name` | `refresh_token` |
| `HttpOnly` | `true` |
| `Secure` | `true` en production, `false` en dev |
| `SameSite` | `lax` |
| `Path` | `/` |
| `MaxAge` | `2592000` (30 jours en secondes) |

`SameSite: lax` empêche l'envoi sur les requêtes cross-site avec méthode dangereuse
(POST), ce qui protège contre le CSRF. Les requêtes GET cross-site normales (clic de lien)
enverront le cookie, ce qui est le comportement attendu.

---

## 3. Fichiers impactés

| Fichier | Action |
|---------|--------|
| `apps/web/src/app/api/auth/session/set/route.ts` | **CRÉER** |
| `apps/web/src/app/api/auth/session/refresh/route.ts` | **CRÉER** |
| `apps/web/src/app/api/auth/session/clear/route.ts` | **CRÉER** |
| `apps/web/src/features/auth/store/auth.store.ts` | **MODIFIER** — supprimer `refreshToken` |
| `apps/web/src/lib/api.ts` | **MODIFIER** — `silentRefresh` via `/api/auth/session/refresh` |
| `apps/web/src/features/auth/hooks/useAuth.ts` | **MODIFIER** — appel cookie après login |
| `apps/web/src/features/auth/components/AuthSync.tsx` | **MODIFIER** — bootstrap via cookie |
| `apps/web/src/app/auth/social-callback/page.tsx` | **MODIFIER** — set cookie après OAuth |
| `apps/web/src/features/auth/hooks/useTokenRefresh.ts` | **MODIFIER** — retirer dépendance refreshToken |

---

## 4. Implémentation détaillée

### Étape 1 — Créer les trois Route Handlers Next.js

#### `apps/web/src/app/api/auth/session/set/route.ts`

Appelé après un login réussi (email/password ou OAuth). Reçoit le `refreshToken` en JSON
dans le corps et le stocke dans le cookie httpOnly. **Ne retourne jamais** le refresh token
au client.

```typescript
import { type NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'refresh_token';
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as { refreshToken?: string };
  if (!body.refreshToken || typeof body.refreshToken !== 'string') {
    return NextResponse.json({ error: 'refreshToken required' }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, body.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS_S,
  });
  return response;
}
```

#### `apps/web/src/app/api/auth/session/refresh/route.ts`

Appelé à la place de l'ancien `silentRefresh()`. Lit le cookie côté serveur,
appelle le backend, écrit le nouveau cookie (token rotation), et retourne le nouvel
`accessToken` au client en JSON.

```typescript
import { type NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'refresh_token';
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;
const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(COOKIE_NAME)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  let data: { accessToken: string; refreshToken: string };
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      // Refresh token expired or revoked — clear cookie and signal logout
      const response = NextResponse.json({ error: 'session_expired' }, { status: 401 });
      response.cookies.delete(COOKIE_NAME);
      return response;
    }
    const json = (await res.json()) as { data: { accessToken: string; refreshToken: string } };
    data = json.data;
  } catch {
    return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
  }

  // Rotate: overwrite cookie with the new refresh token
  const response = NextResponse.json({ accessToken: data.accessToken });
  response.cookies.set(COOKIE_NAME, data.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS_S,
  });
  return response;
}
```

#### `apps/web/src/app/api/auth/session/clear/route.ts`

Appelé à la déconnexion pour supprimer le cookie.

```typescript
import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('refresh_token');
  return response;
}
```

---

### Étape 2 — Modifier `auth.store.ts`

Supprimer `refreshToken` de l'état Zustand et de `partialize`. L'access token reste
en mémoire (non persisté). Conserver `accessTokenExpiresAt` dans `partialize` pour
que `useTokenRefresh` puisse planifier le prochain refresh dès le rechargement de page.

```typescript
// apps/web/src/features/auth/store/auth.store.ts

interface AuthState {
  userId: UserId | null;
  accessToken: string | null;
  // 🔴 SUPPRIMER : refreshToken: string | null;
  accessTokenExpiresAt: number | null;
  subscriptionTier: SubscriptionTier | null;
  displayName: string | null;
  email: string | null;
  locale: string | null;
  isAuthenticated: boolean;
  setAuth: (params: {
    userId: UserId;
    accessToken: string;
    // 🔴 SUPPRIMER : refreshToken: string;
    subscriptionTier: SubscriptionTier;
    displayName?: string;
    email?: string | null;
  }) => void;
  clearAuth: () => void;
  updateAccessToken: (accessToken: string) => void;
  // 🔴 SUPPRIMER updateTokens — n'est plus utile maintenant que le refreshToken est géré par le cookie
  updateProfile: (params: { displayName?: string; locale?: string }) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      accessToken: null,
      // 🔴 SUPPRIMER refreshToken: null,
      accessTokenExpiresAt: null,
      subscriptionTier: null,
      displayName: null,
      email: null,
      locale: null,
      isAuthenticated: false,

      setAuth: ({ userId, accessToken, subscriptionTier, displayName, email }) =>
        set({
          userId,
          accessToken,
          // 🔴 SUPPRIMER refreshToken,
          accessTokenExpiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
          subscriptionTier,
          displayName: displayName ?? null,
          email: email ?? null,
          isAuthenticated: true,
        }),

      clearAuth: () =>
        set({
          userId: null,
          accessToken: null,
          // 🔴 SUPPRIMER refreshToken: null,
          accessTokenExpiresAt: null,
          subscriptionTier: null,
          displayName: null,
          email: null,
          locale: null,
          isAuthenticated: false,
        }),

      updateAccessToken: (accessToken) =>
        set({ accessToken, accessTokenExpiresAt: Date.now() + ACCESS_TOKEN_TTL_MS }),

      // 🔴 SUPPRIMER updateTokens — remplacé par updateAccessToken + gestion cookie côté serveur

      updateProfile: ({ displayName, locale }) =>
        set((state) => ({
          displayName: displayName ?? state.displayName,
          locale: locale ?? state.locale,
        })),
    }),
    {
      name: 'tik-live-pro-auth',
      partialize: (state) => ({
        userId: state.userId,
        isAuthenticated: state.isAuthenticated,
        // 🔴 SUPPRIMER refreshToken: state.refreshToken,
        accessTokenExpiresAt: state.accessTokenExpiresAt,
        subscriptionTier: state.subscriptionTier,
        displayName: state.displayName,
        email: state.email,
        locale: state.locale,
      }),
    },
  ),
);
```

---

### Étape 3 — Modifier `api.ts`

Remplacer `silentRefresh()` pour qu'il appelle la Route Handler au lieu du backend
directement. Supprimer la lecture du `refreshToken` depuis le store.

```typescript
// apps/web/src/lib/api.ts

// 🔴 SUPPRIMER l'import useAuthStore dans silentRefresh (il n'en a plus besoin pour le refreshToken)

export function silentRefresh(): Promise<string | null> {
  // Pas besoin de vérifier refreshToken dans le store — le cookie est envoyé automatiquement
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/session/refresh', { method: 'POST' })
      .then(async (r) => {
        if (!r.ok) return null;
        const { accessToken } = (await r.json()) as { accessToken: string };
        useAuthStore.getState().updateAccessToken(accessToken);
        return accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}
```

`apiFetch` ne change pas — il utilise toujours `silentRefresh()` en cas de 401.

---

### Étape 4 — Modifier `useAuth.ts`

Après chaque login réussi (email/password), appeler `POST /api/auth/session/set` pour
écrire le cookie, puis appeler `setAuth()` **sans** passer le `refreshToken`.

```typescript
// apps/web/src/features/auth/hooks/useAuth.ts

// Fonction utilitaire interne (non exportée)
async function persistRefreshCookie(refreshToken: string): Promise<void> {
  await fetch('/api/auth/session/set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
}

// Dans login() :
const login = useCallback(
  async (params: LoginCredentials, callbackUrl?: string, onSuccess?: () => void) => {
    // ... fetch /auth/login ...
    const { data } = (await res.json()) as { data: AuthResponse };
    // ① Écrire le cookie httpOnly côté serveur
    await persistRefreshCookie(data.refreshToken);
    // ② Stocker l'access token et les métadonnées en mémoire (sans refreshToken)
    setAuth({ ...data, email: params.email });
    // ...
  },
  // ...
);

// Dans register() : même pattern que login()

// Dans logout() :
const logout = useCallback(async () => {
  clearAuth();
  // Effacer le cookie côté serveur
  await fetch('/api/auth/session/clear', { method: 'POST' });
  router.push('/auth/login');
}, [clearAuth, router]);
```

> **Note :** `loginWithProvider` (OAuth via NextAuth) ne change pas ici — la mise en
> cookie est gérée dans `social-callback` (étape 6).

---

### Étape 5 — Modifier `AuthSync.tsx`

Supprimer la dépendance sur `refreshToken` depuis le store. Au démarrage, si
`accessToken` est absent, appeler `silentRefresh()` qui utilisera le cookie
automatiquement.

```typescript
// apps/web/src/features/auth/components/AuthSync.tsx

export function AuthSync() {
  const { data: session, status } = useSession();
  const accessToken = useAuthStore((s) => s.accessToken);
  // 🔴 SUPPRIMER : const refreshToken = useAuthStore((s) => s.refreshToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useTokenRefresh();

  useEffect(() => {
    if (status === 'loading') return;

    if (status === 'unauthenticated') {
      if (!accessToken) {
        // Tenter un refresh silencieux via le cookie (si présent)
        // Si le cookie n'existe pas ou est expiré, silentRefresh() retourne null
        void silentRefresh().then((token) => { if (!token) clearAuth(); });
      }
      return;
    }

    // Cas OAuth : session NextAuth disponible
    if (session?.appAccessToken && session.appUserId && !accessToken) {
      setAuth({
        userId: session.appUserId as UserId,
        accessToken: session.appAccessToken,
        // 🔴 SUPPRIMER refreshToken: session.appRefreshToken ?? '',
        subscriptionTier: (session.appSubscriptionTier ?? 'free') as SubscriptionTier,
        ...(session.appDisplayName !== undefined ? { displayName: session.appDisplayName } : {}),
        ...(session.appEmail !== undefined ? { email: session.appEmail } : {}),
      });
    }
  }, [session, status, accessToken, setAuth, clearAuth]);

  return null;
}
```

---

### Étape 6 — Modifier `social-callback/page.tsx`

Après le login OAuth via NextAuth, écrire le cookie avec le refresh token issu de la
session, puis appeler `setAuth()` sans `refreshToken`.

```typescript
// apps/web/src/app/auth/social-callback/page.tsx

if (session.appAccessToken && session.appUserId) {
  // ① Cookie httpOnly pour le refresh token
  if (session.appRefreshToken) {
    await fetch('/api/auth/session/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.appRefreshToken }),
    });
  }
  // ② Zustand en mémoire (sans refreshToken)
  setAuth({
    userId: session.appUserId as UserId,
    accessToken: session.appAccessToken,
    // 🔴 SUPPRIMER refreshToken: session.appRefreshToken ?? '',
    subscriptionTier: (session.appSubscriptionTier ?? 'free') as SubscriptionTier,
    ...(session.appDisplayName !== undefined ? { displayName: session.appDisplayName } : {}),
    ...(session.appEmail !== undefined ? { email: session.appEmail } : {}),
  });
  const rawNext = searchParams.get('next') ?? '/dashboard';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';
  router.replace(next);
  return;
}
```

> **Attention :** `social-callback` est un Client Component (`'use client'`). `fetch`
> vers `/api/auth/session/set` doit être `await`-é **avant** `router.replace()` pour
> garantir que le cookie est posé avant la navigation.

---

### Étape 7 — Modifier `useTokenRefresh.ts`

Le hook ne dépend plus de `refreshToken` — il utilise uniquement `accessTokenExpiresAt`
pour planifier le prochain refresh (qui lui utilisera le cookie).

```typescript
// apps/web/src/features/auth/hooks/useTokenRefresh.ts

export function useTokenRefresh(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessTokenExpiresAt = useAuthStore((s) => s.accessTokenExpiresAt);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useEffect(() => {
    if (!isAuthenticated || !accessTokenExpiresAt) return;

    const delay = accessTokenExpiresAt - Date.now() - REFRESH_BEFORE_EXPIRY_MS;

    if (delay <= 0) {
      void silentRefresh().then((token) => { if (!token) clearAuth(); });
      return;
    }

    const timerId = setTimeout(() => {
      void silentRefresh().then((token) => { if (!token) clearAuth(); });
    }, delay);

    return () => clearTimeout(timerId);
  }, [isAuthenticated, accessTokenExpiresAt, clearAuth]);
  // 🟢 refreshToken retiré des dépendances — le hook est plus simple
}
```

---

## 5. Nettoyage du localStorage existant

Les sessions actives des utilisateurs ont encore `refreshToken` dans leur localStorage.
À la première visite après déploiement :

1. `AuthSync` monte, trouve `isAuthenticated: true` et `refreshToken: "<valeur>"` dans
   le store persisté (Zustand hydrate depuis localStorage)
2. Mais le store ne contient plus `refreshToken` dans son type — Zustand ignore
   silencieusement les clés inconnues lors de l'hydratation (comportement par défaut)
3. `accessToken` est absent (non persisté) → `AuthSync` appelle `silentRefresh()`
4. `silentRefresh()` appelle `/api/auth/session/refresh` → cookie absent → retourne 401
5. `clearAuth()` est appelé → l'utilisateur est redirigé vers `/auth/login`

**Conséquence :** tous les utilisateurs devront se reconnecter une fois après déploiement.
C'est le comportement correct et attendu pour une migration de ce type.

> Si vous souhaitez éviter la déconnexion forcée, ajoutez une logique de migration
> temporaire dans `AuthSync` : détecter `refreshToken` dans le store persisté (version
> ancienne), appeler `POST /api/auth/session/set`, puis le supprimer du localStorage.
> Cette fenêtre de migration peut être retirée après 30 jours (durée max du refresh token).

---

## 6. Variables d'environnement

Aucune nouvelle variable d'environnement n'est requise. Les Route Handlers utilisent
`NEXT_PUBLIC_API_URL` (déjà défini) pour appeler le backend.

**Optionnel (recommandé en production) :** ajouter une variable serveur-only
`BACKEND_INTERNAL_URL` (non préfixée `NEXT_PUBLIC_`) pointant directement vers l'auth
service sans passer par la gateway. Cela évite un saut réseau inutile pour les refresh
côté serveur.

```bash
# .env.local (apps/web)
BACKEND_INTERNAL_URL=http://localhost:3001   # auth service direct en dev
```

```typescript
// Dans refresh/route.ts
const API_BASE = process.env['BACKEND_INTERNAL_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';
```

---

## 7. Checklist de tests

### Fonctionnel
- [ ] Login email/password → cookie `refresh_token` posé (onglet Application → Cookies dans DevTools)
- [ ] Cookie est marqué `HttpOnly` (non visible en `document.cookie`)
- [ ] Rechargement de page → accès token reconstruit via le cookie (pas de login requis)
- [ ] Attendre expiration de l'access token (ou passer `accessTokenExpiresAt` dans le passé dans DevTools > Storage) → refresh automatique déclenché
- [ ] Supprimer manuellement le cookie → refresh échoue → redirection vers `/auth/login`
- [ ] Logout → cookie supprimé (vérifier dans DevTools)
- [ ] Login OAuth (Google/Facebook/TikTok) → même comportement cookie
- [ ] `localStorage["tik-live-pro-auth"]` ne contient plus `refreshToken`

### Sécurité
- [ ] `document.cookie` ne liste pas `refresh_token`
- [ ] Requête depuis une autre origine (test avec `fetch` depuis la console d'un autre onglet) → cookie non envoyé (SameSite: lax)
- [ ] En production : cookie présent uniquement sur HTTPS (Secure flag)

### Cas limites
- [ ] Deux onglets ouverts simultanément → un seul refresh s'exécute à la fois (déduplication via `refreshPromise`)
- [ ] Token rotation : après un refresh, l'ancien refresh token est invalidé ; un deuxième refresh simultané (depuis un autre onglet) échoue proprement et déclenche une déconnexion
- [ ] Utilisateur avec session active avant déploiement → déconnecté proprement à la prochaine visite (pas de boucle d'erreur)

---

## 8. Risques et mitigations

| Risque | Mitigation |
|--------|-----------|
| SameSite: lax ne protège pas contre les requêtes GET cross-site | Le refresh token n'est consommé que par des POST (`/api/auth/session/refresh`) → non impacté |
| CSP bloque les fetch vers `/api/*` | Pas de CSP sur les appels same-origin — ces routes sont sur le même domaine |
| Boucle infinie si `/api/auth/session/refresh` retourne 502 | `silentRefresh` catch toutes les erreurs et retourne `null` — `clearAuth` est appelé, la boucle s'arrête |
| Cookie absent sur un sous-domaine différent | Spécifier `domain: '.tiklivepro.me'` si nécessaire (uniquement si frontend et API sont sur des sous-domaines différents) |
| Le cookie n'est pas envoyé lors des requêtes `fetch` cross-origin | Toutes les routes Next.js (`/api/*`) sont same-origin — pas de problème |
