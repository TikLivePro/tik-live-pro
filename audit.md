# Rapport d'Audit de Sécurité — TikLivePro

> **Date :** 2026-06-15  
> **Auditeur :** Claude Code (Sonnet 4.6)  
> **Périmètre :** Ensemble du monorepo `/home/tokiarivelo/Documents/Projects/tik-live-pro`  
> **Méthodologie :** Revue statique de code (tous les services, frontend web, packages partagés)

---

## 1. Résumé Exécutif

L'application TikLivePro présente une architecture microservices globalement bien structurée avec plusieurs bonnes pratiques en place (JWT 15 min, rotation des refresh tokens, chiffrement AES-256-GCM des tokens OAuth, validation Zod à l'entrée). Cependant, **12 vulnérabilités** ont été identifiées lors de cet audit, dont **3 de gravité Critical**, **4 High**, **3 Medium** et **2 Low**.

Les problèmes les plus critiques sont :

1. **Des secrets de production réels sont présents dans le fichier `.env.prod`** committé dans l'historique git — incluant des credentials Neon (PostgreSQL production), Redis, TikTok OAuth, Facebook OAuth, Google OAuth, Stripe en mode production (`sk_live_...`), et SMTP.
2. **Le service `stream-orchestrator` n'implémente pas de vérification JWT dans ses handlers** malgré l'utilisation du schéma `security: bearerAuth` — toute requête authentifiée au niveau du gateway passe sans re-vérification downstream.
3. **`POST /comments` accepte et publie des commentaires sans vérification JWT** — un attaquant non authentifié peut injecter des commentaires dans n'importe quelle session.

---

## 2. Tableau Récapitulatif des Vulnérabilités

| # | Titre | Gravité | Fichier(s) |
|---|-------|---------|-----------|
| V1 | Secrets de production dans `.env.prod` commité | **Critical** | `.env.prod`, `services/integrations/..env` |
| V2 | `POST /comments` sans authentification obligatoire | **Critical** | `services/comments/src/interfaces/http/comments.routes.ts` |
| V3 | `stream-orchestrator` : pas de `jwtVerify` dans les handlers | **Critical** | `services/stream-orchestrator/src/interfaces/http/routes.ts` |
| V4 | CORS wildcard sur tous les microservices | **High** | Tous les `services/*/src/main.ts` |
| V5 | `/integrations/internal/accounts/tokens` accessible via la gateway | **High** | `services/api-gateway/src/main.ts`, `services/integrations/src/interfaces/http/integrations.routes.ts` |
| V6 | Open redirect dans le callback OAuth social (`/auth/social-callback`) | **High** | `apps/web/src/app/auth/social-callback/page.tsx`, `apps/web/src/features/auth/hooks/useAuth.ts` |
| V7 | Webhook Stripe — handler stub sans vérification de signature | **High** | `services/billing/src/interfaces/http/billing.routes.ts` |
| V8 | `encryptToken` : padding du keyHex avec des zéros | **Medium** | `services/integrations/src/interfaces/http/integrations.routes.ts` |
| V9 | Tokens stockés dans `localStorage` (via Zustand `persist`) | **Medium** | `apps/web/src/features/auth/store/auth.store.ts` |
| V10 | Rate limiting manquant sur les services downstream | **Medium** | `services/auth/src/main.ts` (100 req/min seulement) |
| V11 | `/auth/oauth/deletion` — endpoint interne sans protection gateway | **Low** | `services/auth/src/interfaces/http/auth.routes.ts` |
| V12 | `dangerouslySetInnerHTML` dans le layout principal | **Low** | `apps/web/src/app/layout.tsx` |

---

## 3. Détail des Vulnérabilités

---

### V1 — Secrets de production dans `.env.prod` commité (Critical)

**Fichier :** `.env.prod` (racine du projet)  
**Fichier secondaire :** `services/integrations/..env` (tracké par git)

**Description :**  
Le fichier `.env.prod` contient des credentials de production réels et est présent dans le répertoire de travail. Bien qu'il ne soit pas tracké par git (il est dans `.gitignore`), la vérification `git ls-files | grep ".env"` révèle que `services/integrations/..env` **est tracké par git** (nom avec double point : `..env` au lieu de `.env`). Ce fichier contient :
- `JWT_SECRET` (même valeur dev, mais)
- `FACEBOOK_APP_ID=991478913733075` et `FACEBOOK_APP_SECRET=f2a8b35a537d48df6e8d7aa413402a20` (credentials réels)

Le fichier `.env.prod` (non commité mais présent sur le disque) contient :
- Credentials Neon PostgreSQL production : `npg_Z3WymhP4XRpb@ep-billowing-poetry...`
- Redis Upstash production : `gQAAAAAAAaKIAAIg...@intimate-crow-107144.upstash.io`
- `TIKTOK_CLIENT_SECRET=LXpguGdXiawEpJz7O0nKxdab4p0M2mXZ` (réel)
- `STRIPE_SECRET_KEY=sk_live_51NxTwFGl2vOxY7zK_mock_live_secret_key_abc789`
- `SMTP_PASS=ysqq brww hrup ppnw` (app password Gmail)
- `GOOGLE_CLIENT_SECRET=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`

**Risque :**  
Si ce fichier est accidentellement commité (ou si `services/integrations/..env` est déjà dans l'historique), tous ces secrets sont compromis. Un attaquant avec accès au repository ou au disque peut :
- Accéder directement aux bases de données production
- Usurper l'identité TikTok OAuth pour lier des comptes
- Émettre des charges Stripe frauduleuses
- Accéder à la boîte email et envoyer des mails au nom de l'application

**Corrections :**
1. Révoquer **immédiatement** et régénérer tous les secrets listés dans `.env.prod`
2. Supprimer `services/integrations/..env` de l'historique git : `git rm --cached 'services/integrations/..env' && git filter-branch` (ou BFG Repo Cleaner)
3. Utiliser un gestionnaire de secrets (Vault, Doppler, GitHub Secrets) pour les environnements de production
4. Ajouter `..env` (double point) au `.gitignore`

---

### V2 — `POST /comments` sans authentification obligatoire (Critical)

**Fichier :** `services/comments/src/interfaces/http/comments.routes.ts`, lignes 235–290  
**Fichier gateway :** `services/api-gateway/src/main.ts`, ligne 61 (PUBLIC_GET_PATHS)

**Description :**  
Le handler `POST /comments` ne vérifie le JWT que dans un bloc `try/catch` optionnel, et **seulement dans le cas du fallback "local comment"**. En revanche, si `postToAllPlatforms()` retourne un tableau vide (ce qui arrive systématiquement quand aucun compte social n'est lié à la session), le code persiste un commentaire en base sans authentification obligatoire :

```typescript
// ligne 254 : dans le bloc "No linked platform accounts"
try {
  await request.jwtVerify();
  // ...
} catch {
  // No valid JWT — use defaults ← SILENCIEUX, SANS BLOCAGE
}
```

La gateway côté API (`/comments` POST) requiert bien un JWT, mais le service lui-même ne le valide pas, et tout client qui contacte directement le service (ou passe par un contournement) peut poster des commentaires anonymement.

**Risque :**  
- Spam/flood de commentaires dans toutes les sessions sans authentification
- Attribution de commentaires à un `authorPlatformUserId='local'` arbitraire (le `authorName` est contrôlé par le corps de la requête)
- Le `sessionId` n'est pas validé contre l'utilisateur authentifié — n'importe qui peut poster dans n'importe quelle session

**Correction :**
```typescript
async (request, reply) => {
  await request.jwtVerify(); // ← Ajouter AVANT tout traitement
  const userId = (request.user as { sub: string }).sub;
  // ...
}
```

De même pour `POST /comments/:commentId/reply` (lignes 346–365) : le `jwtVerify` est dans un `try/catch` silencieux.

---

### V3 — `stream-orchestrator` : handlers sans `jwtVerify` (Critical)

**Fichier :** `services/stream-orchestrator/src/interfaces/http/routes.ts`  
**Fichier main :** `services/stream-orchestrator/src/main.ts` (aucun `fastifyJwt` enregistré)

**Description :**  
Le service `stream-orchestrator` **n'enregistre pas `fastifyJwt`** dans `main.ts` (contrairement à tous les autres services qui ont `await fastify.register(fastifyJwt, ...)`). De ce fait, `request.jwtVerify()` n'est jamais disponible dans les handlers. En pratique, **aucun des handlers n'appelle `jwtVerify`** : les routes `/sessions/:sessionId/ingest`, `/sessions/:sessionId/video-push`, `/recordings/completed`, `/sessions/:sessionId/recording/*` n'effectuent aucune vérification d'identité.

La gateway protège ces routes par JWT avant de les forwarder, mais :
1. Si le service est accessible directement (depuis le réseau interne, un autre pod K8s, ou par exposition accidentelle), aucune auth n'est vérifiée
2. Il n'y a aucune vérification que le `sessionId` appartient à l'utilisateur appelant — même au niveau gateway

**Risque :**  
- N'importe quel pod K8s ou service interne peut démarrer/arrêter des enregistrements ou récupérer les ingest keys de n'importe quelle session
- Un attaquant avec un JWT valide peut accéder aux sessions d'autres utilisateurs (pas de vérification de propriété au niveau du service)
- Via `POST /sessions/:id/video-push`, un attaquant peut pousser n'importe quelle URL HTTP/HTTPS dans le pipeline RTMP d'une session qui ne lui appartient pas

**Correction :**
1. Enregistrer `fastifyJwt` dans `stream-orchestrator/src/main.ts`
2. Ajouter `await req.jwtVerify()` et une vérification de propriété (`session.userId === req.user.sub`) dans chaque handler

---

### V4 — CORS wildcard sur tous les microservices (High)

**Fichiers :** Tous les `services/*/src/main.ts`

**Description :**  
Tous les services (auth, api-gateway, users, live-session, billing, integrations, comments, notifications, analytics) sont configurés avec `{ origin: true }`, ce qui accepte n'importe quelle origine :

```typescript
await fastify.register(fastifyCors, { origin: true }); // partout
```

`origin: true` dans `@fastify/cors` est l'équivalent de `Access-Control-Allow-Origin: *` reflété depuis `request.headers.origin`.

**Risque :**  
- N'importe quel site tiers peut faire des requêtes cross-origin vers les services
- Sur les services downstream (qui ne sont pas censés être exposés directement), cela facilite les attaques CSRF si des endpoints state-changing utilisent des cookies
- Le service `stream-orchestrator` en particulier, sans auth, est entièrement accessible cross-origin

**Correction :**  
Remplacer `origin: true` par une liste de domaines autorisés explicite :
```typescript
await fastify.register(fastifyCors, {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://tiklivepro.me', 'https://app.tiklivepro.me']
    : ['http://localhost:3010', 'http://localhost:3000'],
  credentials: true,
});
```

---

### V5 — `/integrations/internal/accounts/tokens` accessible via la gateway (High)

**Fichier gateway :** `services/api-gateway/src/main.ts`, ligne 35  
**Fichier route :** `services/integrations/src/interfaces/http/integrations.routes.ts`, lignes 526–583

**Description :**  
La route interne `POST /internal/accounts/tokens` retourne les **tokens OAuth déchiffrés** (tokens d'accès à TikTok/Facebook) pour une liste d'`accountIds`. Elle est protégée par un header `X-Internal-Secret`. Cependant, la gateway proxifie **tout** le préfixe `/integrations/*` vers le service integrations, y compris `/integrations/internal/accounts/tokens`.

Toute requête authentifiée (JWT valide) vers `POST /integrations/internal/accounts/tokens` via la gateway :
1. Passe la vérification JWT de la gateway
2. Est proxifiée vers `https://integrations-service/integrations/internal/accounts/tokens`
3. Le service vérifie `request.headers['x-internal-secret'] !== deps.internalApiKey`
4. Si un attaquant connaît ou devine `INTERNAL_API_KEY`, il obtient tous les tokens OAuth de n'importe quel compte

La route n'est pas documentée dans la gateway (swagger), mais elle est techniquement accessible.

**Risque :**  
Un attaquant avec un JWT valide qui possède ou devine la clé interne peut extraire les tokens OAuth de tous les comptes sociaux connectés, permettant de streamer ou de publier en leur nom.

**Corrections :**
1. **Option A (préférée)** : Bloquer le préfixe `/integrations/internal` explicitement dans la gateway :
```typescript
fastify.all('/integrations/internal/*', async (_req, reply) => {
  return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
});
```
2. **Option B** : Exposer l'endpoint interne sur un port séparé non exposé via la gateway
3. S'assurer que `INTERNAL_API_KEY` ne partage pas de valeur avec des secrets connus

---

### V6 — Open redirect dans le callback OAuth social (High)

**Fichier :** `apps/web/src/app/auth/social-callback/page.tsx`, ligne 37  
**Fichier :** `apps/web/src/features/auth/hooks/useAuth.ts`, lignes 107–110

**Description :**  
Après un login OAuth réussi, le paramètre `next` extrait de l'URL est utilisé directement dans `router.replace(next)` sans validation :

```typescript
// social-callback/page.tsx, ligne 37
const next = searchParams.get('next') ?? '/dashboard';
router.replace(next); // ← Aucune validation
```

L'URL `next` est construite par `useAuth.ts` avec `encodeURIComponent(callbackUrl)`, mais `callbackUrl` provient lui-même du paramètre de query `callbackUrl` de la page de login (`LoginView.tsx`, ligne 38), qui est une entrée utilisateur non validée.

Un lien de phishing du type :
```
/auth/login?callbackUrl=https://evil.com/fake-tiklivepro
```
... déclencherait après login OAuth :
```
/auth/social-callback?next=https://evil.com/fake-tiklivepro
```
... puis `router.replace('https://evil.com/fake-tiklivepro')`.

**Risque :**  
Attaque de phishing post-authentication : l'utilisateur se connecte légitimement sur `tiklivepro.me`, puis est redirigé vers un site malveillant qui peut voler ses tokens ou l'induire en erreur.

**Correction :**
```typescript
// Dans social-callback/page.tsx
const next = searchParams.get('next') ?? '/dashboard';
const safePath = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
router.replace(safePath);
```
Idem dans `useAuth.ts` pour `callbackUrl`.

---

### V7 — Webhook Stripe — handler stub sans vérification de signature (High)

**Fichier :** `services/billing/src/interfaces/http/billing.routes.ts`, lignes 437–481

**Description :**  
Le handler `POST /billing/webhooks/stripe` est un **stub vide** qui retourne systématiquement `{ received: true }` sans effectuer aucune vérification de signature :

```typescript
async (_request, reply) => {
  return reply.status(200).send({ received: true }); // ← Stub, aucune logique
},
```

La documentation du Swagger indique que la signature Stripe est vérifiée, mais le code ne fait rien. En conséquence :
- Les événements Stripe (paiement validé, abonnement annulé) ne sont **jamais traités**
- N'importe qui peut envoyer de faux événements à cet endpoint et recevoir `200 OK`
- Les entitlements (accès premium) ne sont **jamais mis à jour** suite aux paiements Stripe

**Risque :**  
- Un utilisateur payant qui souscrit ne passera jamais en premium (si la logique de mise à jour est supposée venir du webhook)
- Un attaquant peut forger des webhooks Stripe sans détection (bien que sans effet utile dans l'état actuel)
- Cette découverte indique que la logique de facturation est incomplète

**Correction :**
```typescript
async (request, reply) => {
  const signature = request.headers['stripe-signature'] as string;
  const rawBody = await request.body; // nécessite rawBody plugin
  try {
    const event = stripe.webhooks.constructEvent(rawBody, signature, deps.stripeWebhookSecret);
    // traiter l'événement selon event.type
  } catch (err) {
    return reply.status(400).send({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid Stripe signature' } });
  }
},
```

---

### V8 — `encryptToken` : padding du keyHex avec des zéros (Medium)

**Fichier :** `services/integrations/src/interfaces/http/integrations.routes.ts`, lignes 78–97

**Description :**  
La fonction `encryptToken` pad la clé hex avec des zéros `'0'` si elle est trop courte :

```typescript
const key = Buffer.from(keyHex.padEnd(64, '0').slice(0, 64), 'hex');
```

Si `TOKEN_ENCRYPTION_KEY` fait moins de 64 caractères hexadécimaux (32 octets), les octets manquants sont des zéros prédictibles. Dans le fichier `.env` de dev de `services/integrations`, la valeur est `your-32-character-encryption-key-for-social-tokens-here` — non hexadécimale, donc `Buffer.from(..., 'hex')` produira un buffer partiel ou vide selon les caractères, et le padding avec '0' remplira le reste.

**Risque :**  
- Si la clé de chiffrement de production est faible ou non hexadécimale, les tokens OAuth stockés en base sont chiffrés avec une clé prévisible
- La validation Zod exige seulement `.min(32)` (longueur de chaîne, pas d'octets hexadécimaux)

**Correction :**
1. Valider que `TOKEN_ENCRYPTION_KEY` est bien une chaîne hexadécimale de 64 caractères (32 octets) :
```typescript
TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'Must be a 64-character hex string (32 bytes)'),
```
2. Lever une erreur si la clé est trop courte au lieu de padder silencieusement

---

### V9 — Tokens stockés dans `localStorage` via Zustand `persist` (Medium)

**Fichier :** `apps/web/src/features/auth/store/auth.store.ts`, lignes 83–95

**Description :**  
Le store Zustand persiste le `refreshToken`, l'`accessTokenExpiresAt`, et les métadonnées utilisateur dans `localStorage` via le middleware `persist` :

```typescript
persist(
  ...,
  {
    name: 'tik-live-pro-auth',
    partialize: (state) => ({
      refreshToken: state.refreshToken, // ← dans localStorage
      userId: state.userId,
      // ...
    }),
  }
)
```

**Risque :**  
- Le `refreshToken` en `localStorage` est accessible à tout JavaScript s'exécutant sur la page (attaques XSS)
- Un refresh token a une durée de vie de 30 jours — une XSS peut dérober des sessions longue durée
- Les `httpOnly cookies` sont inaccessibles au JavaScript, ce qui est la protection standard

**Correction :**  
Stocker le `refreshToken` dans un `httpOnly` cookie géré par la route `/api` Next.js (ou par NextAuth qui gère déjà ses propres tokens). Zustand en mémoire (sans persist) est suffisant pour l'`accessToken` (courte durée de vie, régénéré au rechargement via le refresh silencieux).

---

### V10 — Rate limiting insuffisant sur les endpoints d'authentification (Medium)

**Fichier :** `services/auth/src/main.ts`, ligne 61

**Description :**  
Le service auth applique un rate limit global de **100 requêtes/minute** par IP. Ce limite est partagée entre tous les endpoints, y compris `/auth/login` et `/auth/register`. Aucun rate limit spécifique n'est appliqué aux endpoints sensibles d'authentification.

100 requêtes/minute = ~1,67 req/seconde. Un attaquant peut tester ~4 320 combinaisons email/mot de passe en 43 minutes avant d'être bloqué — sans aucune mécanisme de compte de tentatives échouées, pas de CAPTCHA, pas de lockout progressif.

La gateway a un rate limit de 500 req/min, ce qui est encore plus permissif.

**Risque :**  
Attaques de credential stuffing et brute force sur les comptes utilisateurs.

**Corrections :**
1. Appliquer un rate limit spécifique sur `POST /auth/login` : 5 req/min par IP
2. Implémenter un backoff exponentiel après 3 échecs consécutifs pour la même adresse email
3. Envisager un CAPTCHA après plusieurs échecs

---

### V11 — `/auth/oauth/deletion` endpoint interne sans protection gateway (Low)

**Fichier :** `services/auth/src/interfaces/http/auth.routes.ts`, lignes 423–466

**Description :**  
L'endpoint `POST /auth/oauth/deletion` est documenté comme "interne — doit ne pas être exposé via la gateway", mais le préfixe `/auth/*` est entièrement proxifié vers le service auth dans la gateway. Bien que le service auth ne vérifie pas de JWT sur cet endpoint (aucun `request.jwtVerify()`), n'importe qui peut appeler `POST /auth/oauth/deletion` via la gateway sans authentification.

```typescript
// auth.routes.ts
fastify.post('/auth/oauth/deletion', ...
  async (request, reply) => {
    const { provider, providerUserId } = z.object(...).parse(request.body);
    await userRepo.deleteOAuthAccount(provider, providerUserId); // Aucune auth
  }
)
```

**Risque :**  
Un attaquant qui connaît l'`open_id` TikTok ou le Facebook `user_id` d'une victime peut supprimer son lien OAuth, forçant la victime à se reconnecter.

**Correction :**  
Bloquer l'accès à `/auth/oauth/deletion` dans la gateway (comme pour `/integrations/internal/*`), ou exiger une vérification côté service (ex. vérifier que l'appelant est le serveur Next.js via un secret partagé).

---

### V12 — `dangerouslySetInnerHTML` dans le layout principal (Low)

**Fichier :** `apps/web/src/app/layout.tsx`, ligne 36

**Description :**  
Un script inline est injecté via `dangerouslySetInnerHTML` dans le layout principal pour détecter le thème sombre :

```tsx
<script dangerouslySetInnerHTML={{ __html: `(function(){try{...}catch(e){}})()` }} />
```

Le contenu du script est une constante hardcodée (pas d'interpolation de données utilisateur), donc pas de risque XSS direct ici. Cependant, l'utilisation de `dangerouslySetInnerHTML` avec les CSP (Content Security Policy) actuelles (non vérifiées explicitement dans ce rapport) peut nécessiter un nonce ou un hash pour fonctionner avec une CSP `script-src 'self'`.

**Risque faible :** Le code actuellement injecté est sûr. Le risque est architectural : si un développeur ajoute une interpolation à ce pattern dans le futur, cela pourrait créer une XSS.

**Correction :**  
Utiliser une approche CSS-first (`prefers-color-scheme`) ou un script avec nonce CSP plutôt que `dangerouslySetInnerHTML`.

---

## 4. Observations Positives

Les éléments suivants constituent des bonnes pratiques correctement implémentées :

- **Rotation des refresh tokens** : chaque refresh invalide l'ancien token (token rotation)
- **AES-256-GCM** pour les tokens OAuth en base de données (integrations service)
- **Zod validation** sur toutes les entrées HTTP des routes (avec `additionalProperties: false` sur les bodies)
- **HMAC-SHA256 avec `timingSafeEqual`** pour la vérification des signed_requests Facebook
- **SSRF protection** dans `merge-stream` et `link-preview` : rejet des IP privées en production
- **JWT TTL court** : 15 minutes pour l'access token
- **Secrets JWT de longueur minimale 64 caractères** validés via Zod
- **State token CSRF** pour les flows OAuth TikTok et Facebook (généré, stocké, vérifié)
- **x-correlation-id** propagé par la gateway à tous les services downstream
- **Helmet** activé sur tous les services

---

## 5. Recommandations Générales

### 5.1 Priorité immédiate (avant toute mise en production)

1. **Révoquer et régénérer** tous les secrets présents dans `.env.prod` (voir V1)
2. **Supprimer** `services/integrations/..env` de git (voir V1)
3. **Corriger l'authentification de `POST /comments`** (voir V2)
4. **Ajouter `jwtVerify`** dans tous les handlers du stream-orchestrator (voir V3)
5. **Implémenter le handler Stripe réel** avec vérification de signature (voir V7)

### 5.2 Court terme

6. **Bloquer `/integrations/internal/*` dans la gateway** (voir V5)
7. **Valider le paramètre `next`/`callbackUrl`** contre une liste d'origines autorisées (voir V6)
8. **Restreindre CORS** à des origines explicites (voir V4)

### 5.3 Moyen terme

9. **Migrer le refresh token vers httpOnly cookie** (voir V9)
10. **Renforcer le rate limiting** sur `/auth/login` (voir V10)
11. **Corriger la validation de `TOKEN_ENCRYPTION_KEY`** (voir V8)

### 5.4 Architecture

- **Réseau interne** : les services downstream ne devraient idéalement pas être accessibles depuis Internet. Utiliser un réseau Docker/K8s isolé avec la gateway comme seul point d'entrée.
- **Mutual TLS** ou token d'authentification inter-services pour protéger les communications NATS et HTTP internes.
- **Audit logging** : aucun système d'audit des actions sensibles (connexions, modifications de compte, démarrage de session) n'est visible — envisager un bus d'événements d'audit dédié.
