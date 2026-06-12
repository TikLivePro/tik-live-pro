# Déploiement via GitHub Student Developer Pack

> Dernière mise à jour : 2026-06-12 (yt-dlp fixes: python3 now in runtime image, YTDLP_AUTO_UPDATE enabled by default, YouTube cookie bypass for datacenter IPs auto-activated by deploy workflow)

Ce guide couvre le déploiement de TikLivePro en production avec les ressources du GitHub Student Pack.

## Architecture de déploiement recommandée

```
GitHub Actions (gratuit — runners 7 GB RAM)
  → build 11 images Docker en parallèle
  → push vers GitHub Container Registry (GHCR, gratuit)
  → deploy via SSH (docker pull + up)

Droplet DigitalOcean 4 GB (≈ $24/mois)
  → docker compose pull   ← pas de build, juste télécharger
  → docker compose up -d

Services externes gratuits
  Neon.tech  → PostgreSQL managé (free tier — 0,5 GB)
  Upstash    → Redis managé      (free tier — 10k req/jour)
```

**Pourquoi cette architecture ?**

| Problème | Sans CI/CD | Avec CI/CD + managed DBs |
|----------|-----------|--------------------------|
| Build sur le serveur | ~3 GB RAM pendant le build → OOM | Build sur GitHub (7 GB) → serveur intact |
| Postgres self-hosted | -512 MB de RAM disponible | Neon free tier → 0 MB sur le serveur |
| Redis self-hosted | -300 MB de RAM disponible | Upstash free tier → 0 MB sur le serveur |
| **RAM utilisée** | **~3,2 GB** (limite critique) | **~2,4 GB** (confortable) |

---

## Budget RAM final (4 GB Droplet)

| Conteneur | Limite mémoire |
|-----------|---------------|
| NATS | 128 m |
| MediaMTX (relay HLS/WebRTC) | 64 m |
| api-gateway | 192 m |
| auth | 160 m |
| users | 160 m |
| live-session | 160 m |
| billing | 160 m |
| integrations | 192 m |
| comments | 192 m |
| notifications | 128 m |
| analytics | 128 m |
| stream-orchestrator | 320 m |
| web (Next.js) | 512 m |
| **Total** | **~2 496 m** |
| OS + marge | ~1 504 m |

> **MediaMTX** (binaire Go) consomme ~10–30 MB en runtime — bien en dessous de la limite de 64 m. Aucun impact perceptible sur le Droplet 4 GB.

---

## Ressources à obtenir (toutes gratuites pour étudiants)

| Ressource | Service | Lien |
|-----------|---------|------|
| $200 crédit cloud | DigitalOcean (Student Pack) | education.github.com/pack |
| Domaine `.me` 1 an | Namecheap (Student Pack) | education.github.com/pack |
| PostgreSQL managé | Neon.tech | neon.tech |
| Redis managé | Upstash | upstash.com |
| Registry d'images | GitHub Container Registry | github.com |
| CI/CD | GitHub Actions | github.com |
| Stockage vidéo (option A) | DigitalOcean Spaces | cloud.digitalocean.com/spaces |
| Stockage vidéo (option B) | Cloudflare R2 (10 GB gratuit, 0 frais d'egress) | cloudflare.com/developer-platform/r2 |

---

## Étape 1 — Domaine gratuit (Namecheap)

1. Connectez-vous sur [education.github.com/pack](https://education.github.com/pack)
2. Cherchez **Namecheap** → **Get access**
3. Enregistrez un domaine `.me` gratuit (ex : `tiklivepro.me`)
4. Activez le **SSL gratuit** inclus (section "SSL Certificates")

---

## Étape 2 — DigitalOcean + Droplet

1. Sur [education.github.com/pack](https://education.github.com/pack), cherchez **DigitalOcean** → **Get access** ($200 de crédit)
2. Créez votre compte en vous authentifiant via GitHub
3. **Create > Droplets** :
   - Image : **Ubuntu 24.04 LTS**
   - Plan : **Basic — 4 GB RAM / 2 vCPUs / 80 GB SSD** (~$24/mois)
   - Authentication : **SSH Key** (`~/.ssh/id_rsa.pub`)
   - Hostname : `tiklivepro-prod`
4. Notez l'IP publique : `188.166.197.25`

---

## Étape 3 — DNS (Namecheap → Droplet)

**Namecheap > Domain List > Manage > Advanced DNS :**

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A Record | `@` | `188.166.197.25` | Automatic |
| A Record | `www` | `188.166.197.25` | Automatic |
| CNAME Record | `api` | `tiklivepro.me.` | Automatic |
| CNAME Record | `hls` | `tiklivepro.me.` | Automatic |
| CNAME Record | `webrtc` | `tiklivepro.me.` | Automatic |
| CNAME Record | `status` | `tiklivepro.me.` | Automatic |

> **Option R2 avec domaine custom (`recordings.tiklivepro.me`) :** Cloudflare R2 refuse les domaines custom si le DNS n'est **pas** géré par Cloudflare (erreur : *"That domain was not found on your account"*). Le sous-domaine `recordings` ne peut donc pas être ajouté dans Namecheap. Deux solutions :
> - **Recommandé :** migrer l'ensemble du DNS de `tiklivepro.me` vers Cloudflare (gratuit) — les enregistrements ci-dessus sont recréés dans Cloudflare DNS, et le custom domain R2 fonctionne. Voir `docs/recording.md § 5` (Chemin A).
> - **Alternatif :** utiliser l'URL `pub-<hash>.r2.dev` fournie par Cloudflare — aucune config DNS supplémentaire. Voir `docs/recording.md § 5` (Chemin B).
> - **Option DO Spaces :** aucune contrainte de ce type — le CDN Spaces fonctionne sans migration DNS.

Vérifier la propagation (5–30 min) — **tous les enregistrements** doivent retourner `188.166.197.25` :
```bash
dig tiklivepro.me +short
dig www.tiklivepro.me +short
dig api.tiklivepro.me +short
dig hls.tiklivepro.me +short
dig webrtc.tiklivepro.me +short
dig status.tiklivepro.me +short
```

> **Erreur fréquente :** si l'un des sous-domaines retourne vide ou une erreur `NXDOMAIN`, l'enregistrement correspondant est absent dans Namecheap. Retournez dans **Advanced DNS** et ajoutez l'enregistrement manquant — les CNAME `api`, `hls` et `webrtc` sont souvent oubliés.

---

## Étape 4 — Base de données managée (Neon)

Neon remplace le conteneur PostgreSQL auto-hébergé — économie de 512 MB sur le Droplet.

1. Créez un compte sur [neon.tech](https://neon.tech) (gratuit, pas de carte bancaire)
2. **New Project** → nommez-le `tiklivepro`
3. Dans la console Neon, créez les bases de données suivantes (section **Databases**) :
   ```
   tiklivepro_auth
   tiklivepro_users
   tiklivepro_sessions
   tiklivepro_billing
   tiklivepro_integrations
   tiklivepro_comments
   tiklivepro_notifications
   tiklivepro_analytics
   tiklivepro_stream
   ```
4. Récupérez la **connection string** depuis **Dashboard > Connection Details** (format `postgresql://user:pass@ep-xxx.region.aws.neon.tech/DATABASE?sslmode=require`)
5. Exécutez les migrations SQL initiales sur Neon :
   ```bash
   # Depuis votre machine locale (remplacez l'URL par votre vraie URL Neon)
   psql "postgresql://user:pass@ep-xxx.neon.tech/tiklivepro_auth?sslmode=require" \
     -f infra/docker/postgres/init.sql
   ```

> **Note :** Chaque service a sa propre base de données sur le même projet Neon. Seul le nom de la base change en fin d'URL (`/tiklivepro_auth`, `/tiklivepro_users`, etc.).

---

## Étape 5 — Redis managé (Upstash)

Upstash remplace le conteneur Redis — économie de 300 MB sur le Droplet.

1. Créez un compte sur [upstash.com](https://upstash.com) (gratuit)
2. **Create Database** → région Europe → nommez-la `tiklivepro`
3. Récupérez le **Redis URL (TLS)** dans le dashboard (format `rediss://default:TOKEN@HOST.upstash.io:6379`)

---

## Étape 6 — Configurer le serveur

Connectez-vous au Droplet :
```bash
ssh root@188.166.197.25
```

### 6a — Swap (filet de sécurité obligatoire)

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' >> /etc/sysctl.conf
sysctl -p
```

### 6b — Docker

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

### 6c — Caddy (reverse proxy + SSL automatique)

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
```

Le Caddyfile canonique est versionné dans `infra/caddy/Caddyfile` et **déployé automatiquement** par le workflow CI à chaque tag (`systemctl reload caddy` est appelé après le `scp`). Vous n'avez à le créer manuellement qu'une seule fois pour le premier déploiement.

`/etc/caddy/Caddyfile` — le fichier canonique est versionné dans `infra/caddy/Caddyfile` et **déployé automatiquement** par le CI. La version complète fait référence :

```
tiklivepro.me, www.tiklivepro.me {
    reverse_proxy localhost:3010
}

status.tiklivepro.me {
    reverse_proxy localhost:3011
}

api.tiklivepro.me {
    handle /socket.io/* {
        reverse_proxy localhost:3006
    }
    handle /stream-orchestrator/* {
        uri strip_prefix /stream-orchestrator
        reverse_proxy localhost:3009
    }
    handle {
        reverse_proxy localhost:3000
    }
}

hls.tiklivepro.me {
    reverse_proxy localhost:8888 {
        header_down -Access-Control-Allow-Origin
        header_down Access-Control-Allow-Origin  "*"
        header_down Access-Control-Allow-Methods "GET, HEAD, OPTIONS"
        header_down Access-Control-Allow-Headers "Range"
    }
}

webrtc.tiklivepro.me {
    @cors_preflight method OPTIONS
    handle @cors_preflight {
        header Access-Control-Allow-Origin  "*"
        header Access-Control-Allow-Methods "GET, HEAD, POST, OPTIONS"
        header Access-Control-Allow-Headers "Content-Type, Authorization"
        header Access-Control-Max-Age       "86400"
        respond "" 204
    }
    handle {
        header {
            Access-Control-Allow-Origin   "*"
            Access-Control-Expose-Headers "Location"
            defer
        }
        reverse_proxy localhost:8889
    }
}
```
```bash
systemctl reload caddy
```

> **Pourquoi CORS sur `hls` ?** Le player HLS dans le navigateur fait des requêtes XHR vers `hls.tiklivepro.me` depuis l'origine `tiklivepro.me`. Sans `Access-Control-Allow-Origin`, le navigateur bloque les segments `.m3u8` et `.ts`. Le header `Range` est requis pour les requêtes de segments partiels (HLS byte-range).
>
> **Pourquoi `header_down` sur `hls` et `header { defer }` sur `webrtc` ?** `header_down` modifie les headers **après** la réponse upstream (nécessaire pour écraser ceux que MediaMTX envoie déjà). Sur `webrtc`, `defer` a le même effet mais via la directive `header` standard. Le WHIP preflight (`OPTIONS`) est géré directement par Caddy car MediaMTX ne répond pas toujours `2xx` aux `OPTIONS`.

### 6d — Dossier du projet

```bash
mkdir -p /opt/tiklivepro
```

> **Où vont les secrets ?**
>
> | Variable | Où la mettre | Pourquoi |
> |----------|-------------|---------|
> | `DROPLET_IP`, `DROPLET_SSH_KEY` | **GitHub Secrets** | utilisées par le runner pour se connecter au serveur via SSH |
> | Tout le reste (JWT, DB, OAuth, NextAuth…) | **GitHub Secrets** | le CI écrit le fichier `.env` sur le serveur à chaque déploiement — pas de maintenance manuelle |
> | `NEXT_PUBLIC_*` | **GitHub Secrets** | passées en `--build-arg` lors du build de l'image — intégrées dans le bundle JS à la compilation |
> | `REGISTRY`, `IMAGE_TAG` | **injectées par le CI** | calculées depuis le tag git — pas besoin de les configurer |

Le fichier `/opt/tiklivepro/.env` est **écrit automatiquement par le workflow CI** à chaque déploiement. Vous n'avez pas à le créer ni à le maintenir manuellement sur le serveur.

### 6e — Authentification GHCR sur le serveur

Pour que le **Droplet DigitalOcean** puisse télécharger vos images depuis votre registre privé GHCR, il faut lui donner les credentials GitHub une seule fois.

**Étape 1 — Créer le token (sur votre machine locale / navigateur)**

1. Allez sur **GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic)**
2. Cliquez **Generate new token (classic)**
3. Cochez uniquement le scope `read:packages`
4. Générez et **copiez le token** (il ne s'affiche qu'une seule fois)

**Étape 2 — Connecter Docker à GHCR (sur le Droplet)**

Ouvrez une session SSH sur le serveur (si ce n'est pas déjà fait) :
```bash
# depuis votre machine locale
ssh root@188.166.197.25
```

Puis, **depuis la session SSH sur le Droplet**, collez votre token et exécutez :
```bash
# remplacez VOTRE_PAT par le token copié à l'étape 1
# remplacez VOTRE_USERNAME par votre nom d'utilisateur GitHub (ex: tokiarivelo)
echo "VOTRE_PAT" | docker login ghcr.io -u VOTRE_USERNAME --password-stdin
```

Vous devez voir `Login Succeeded`. Docker enregistre les credentials dans `~/.docker/config.json` sur le serveur — tous les futurs `docker pull ghcr.io/...` se feront automatiquement sans re-saisir le mot de passe.

> **Résumé** : le token est créé sur GitHub (dans votre navigateur), puis utilisé **une seule fois** sur le Droplet pour autoriser Docker. Rien à faire côté GitHub Actions — le CI construit et pousse les images, le serveur n'a besoin que de les télécharger.

---

## Étape 7 — Configurer GitHub Actions

### 7a — Rendre les packages GHCR visibles

Après le premier push (étape 8), allez dans **GitHub > Packages** et passez chaque image en **Public** (ou laissez en Private si vous avez configuré le PAT côté serveur).

### 7b — Secrets GitHub du dépôt

Le workflow a besoin que **tous** les secrets soient configurés dans GitHub — il se connecte au Droplet via SSH et écrit le fichier `.env` à partir de ces valeurs à chaque déploiement.

**Où les ajouter :**
**GitHub > votre repo > Settings > Secrets and variables > Actions > New repository secret**

---

**Connexion au serveur**

| Secret | Valeur |
|--------|--------|
| `DROPLET_IP` | IP publique du Droplet, visible dans le dashboard DigitalOcean (ex : `167.99.143.212`) |
| `DROPLET_SSH_KEY` | Contenu complet de `~/.ssh/id_rsa` (clé privée, bloc `BEGIN … END`) |

Pour copier la clé privée :
```bash
cat ~/.ssh/id_rsa
```
Copiez le bloc entier incluant les lignes d'en-tête/fin (`-----BEGIN OPENSSH PRIVATE KEY-----` … `-----END OPENSSH PRIVATE KEY-----`).

---

**Secrets applicatifs**

Ces valeurs sont écrites dans `/opt/tiklivepro/.env` sur le serveur à chaque deploy. Le serveur ne stocke jamais de secrets en dehors de ce fichier généré par le CI.

| Secret | Comment l'obtenir |
|--------|------------------|
| `JWT_SECRET` | `openssl rand -hex 64` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -hex 32` |

**Neon (PostgreSQL)** — récupérez la connection string depuis **Dashboard > Connection Details**, changez uniquement le nom de la base en fin d'URL :

| Secret | Base de données |
|--------|----------------|
| `AUTH_DATABASE_URL` | `tiklivepro_auth` |
| `USERS_DATABASE_URL` | `tiklivepro_users` |
| `SESSIONS_DATABASE_URL` | `tiklivepro_sessions` |
| `BILLING_DATABASE_URL` | `tiklivepro_billing` |
| `INTEGRATIONS_DATABASE_URL` | `tiklivepro_integrations` |
| `COMMENTS_DATABASE_URL` | `tiklivepro_comments` |
| `NOTIFICATIONS_DATABASE_URL` | `tiklivepro_notifications` |
| `ANALYTICS_DATABASE_URL` | `tiklivepro_analytics` |
| `STREAM_DATABASE_URL` | `tiklivepro_stream` |

Format attendu : `postgresql://user:pass@ep-xxx.region.aws.neon.tech/tiklivepro_auth?sslmode=require`

**Upstash (Redis)**

| Secret | Comment l'obtenir |
|--------|------------------|
| `REDIS_URL` | Dashboard Upstash > votre DB > **Redis URL (TLS)** — format `rediss://default:TOKEN@HOST.upstash.io:6379` |

**TikTok & Facebook**

Ces credentials sont utilisés à la fois par les services backend (`integrations`, `stream-orchestrator`) et par le frontend Next.js (NextAuth pour la connexion sociale).

| Secret | Comment l'obtenir |
|--------|------------------|
| `TIKTOK_CLIENT_KEY` | TikTok Developer Portal > votre app > App Key |
| `TIKTOK_CLIENT_SECRET` | TikTok Developer Portal > votre app > App Secret |
| `FACEBOOK_APP_ID` | Meta for Developers > votre app > App ID |
| `FACEBOOK_APP_SECRET` | Meta for Developers > votre app > App Secret |

**Web frontend (NextAuth + OAuth côté serveur)**

Ces secrets servent à NextAuth (gestion des sessions côté serveur du frontend).

| Secret | Comment l'obtenir |
|--------|------------------|
| `NEXTAUTH_URL` | URL publique du site web — ex : `https://tiklivepro.me` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Google Cloud Console > APIs & Services > Credentials > votre app OAuth 2.0 > Client ID |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console > APIs & Services > Credentials > votre app OAuth 2.0 > Client Secret |

> **Paramétrer Google OAuth :**
> 1. [console.cloud.google.com](https://console.cloud.google.com) > **APIs & Services > Credentials > Create Credentials > OAuth 2.0 Client ID**
> 2. Type d'application : **Web application**
> 3. Origines autorisées : `https://tiklivepro.me`
> 4. URI de redirection autorisés : `https://tiklivepro.me/api/auth/callback/google`

**Variables publiques du frontend (baked at build time)**

> **Important :** les variables `NEXT_PUBLIC_*` sont **intégrées dans le bundle JavaScript** lors du build de l'image Docker — elles ne peuvent pas être changées à l'exécution. Le CI les passe en `--build-arg` avant le `next build`. Changer ces secrets nécessite de rebuilder et redéployer l'image.

| Secret | Valeur pour la prod |
|--------|-------------------|
| `NEXT_PUBLIC_API_URL` | `https://api.tiklivepro.me` — URL publique de l'API Gateway |
| `NEXT_PUBLIC_COMMENTS_WS_URL` | `https://api.tiklivepro.me` — base URL pour le WebSocket des commentaires (proxié via l'API Gateway) |
| `NEXT_PUBLIC_GIPHY_API_KEY` | _(optionnel)_ Clé API Giphy — [developers.giphy.com](https://developers.giphy.com) — laisser vide pour désactiver |

**MediaMTX (relay HLS/WebRTC)**

| Secret | Valeur pour la prod |
|--------|-------------------|
| `MEDIAMTX_HLS_URL` | `https://hls.tiklivepro.me` — URL publique Caddy-frontée que les navigateurs utilisent pour charger les segments HLS. Doit correspondre exactement au sous-domaine configuré dans le Caddyfile. |
| `MEDIAMTX_WEBRTC_URL` | `https://webrtc.tiklivepro.me` — URL publique WHIP. Renvoyée au navigateur du broadcaster via l'API (`GET /sessions/:id/ingest` → champ `whipUrl`). Doit être HTTPS pour que le navigateur autorise l'accès caméra/micro. |

> **Pas de credentials MediaMTX.** MediaMTX n'interpole pas `$VAR` dans les champs `user:` / `pass:` du fichier de config YAML. Les deux configs (dev et prod) utilisent l'auth ouverte (`user: any`). La sécurité est assurée au niveau applicatif : seul le propriétaire authentifié d'une session connaît l'`ingestKey` UUID. Les ports 9997 (API REST) et 1936 (RTMP) ne sont pas exposés en dehors du réseau Docker.

> **`SERVER_PUBLIC_IP` — pas de secret supplémentaire.** Le workflow utilise automatiquement `secrets.DROPLET_IP` comme valeur de `SERVER_PUBLIC_IP`. Cela permet à MediaMTX d'annoncer l'IP publique du serveur dans ses candidats ICE WebRTC, sans quoi le navigateur ne peut pas atteindre le port UDP 8189 et le flux WHIP échoue silencieusement après la négociation SDP. Aucune action requise si `DROPLET_IP` est déjà configuré.

**Stripe**

| Secret | Comment l'obtenir |
|--------|------------------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard > Developers > API keys > Secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard > Developers > Webhooks > votre endpoint > Signing secret |
| `STRIPE_PREMIUM_PRICE_ID` | Stripe Dashboard > Products > votre plan Premium > Price ID (format `price_xxx`) |

**SMTP — emails de bienvenue (optionnel)**

Le service `auth` envoie un email de bienvenue après chaque inscription. Si `SMTP_USER` est absent (ou vide), l'envoi est silencieusement désactivé — les inscriptions fonctionnent normalement.

Trois fournisseurs sont supportés via `SMTP_PROVIDER` : `gmail`, `sendgrid`, ou `custom`.

| Secret | Description |
|--------|-------------|
| `SMTP_PROVIDER` | Fournisseur SMTP : `gmail` \| `sendgrid` \| `custom` |
| `SMTP_USER` | Identifiant SMTP (ex : `vous@gmail.com`). Laisser vide pour désactiver. |
| `SMTP_PASS` | Mot de passe SMTP ou App Password |
| `SMTP_FROM` | Expéditeur affiché (ex : `TikLive Pro <noreply@tiklivepro.me>`) |
| `SMTP_HOST` | _(custom uniquement)_ Hôte SMTP (ex : `smtp.example.com`) |
| `SMTP_PORT` | _(custom uniquement)_ Port SMTP (ex : `587`) |
| `SMTP_SECURE` | _(custom uniquement)_ `true` pour TLS direct (port 465), `false` pour STARTTLS |

> **Gmail — App Password (recommandé pour les étudiants)**
>
> Gmail bloque les connexions SMTP avec votre mot de passe principal. Créez un **App Password** dédié :
> 1. Activez la **vérification en deux étapes** sur votre compte Google (obligatoire)
> 2. Allez sur [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
> 3. Créez un mot de passe pour l'app **Mail** — vous obtenez un code à 16 caractères
> 4. Configurez les secrets :
>    ```
>    SMTP_PROVIDER = gmail
>    SMTP_USER     = vous@gmail.com
>    SMTP_PASS     = xxxx xxxx xxxx xxxx   ← code 16 caractères (espaces optionnels)
>    SMTP_FROM     = TikLive Pro <noreply@tiklivepro.me>
>    ```
>
> **Limite Gmail gratuit :** 500 emails/jour — largement suffisant pour un projet étudiant.

**Enregistrement vidéo — Cloud Storage (optionnel)**

Choisissez l'une des deux options. Laissez `RECORDING_STORAGE_PROVIDER` vide pour désactiver l'enregistrement.
Voir `docs/recording.md` pour les instructions complètes.

> **L'enregistrement est activé par session** — il ne démarre pas automatiquement à la connexion du broadcaster. L'utilisateur ou l'application appelle `POST /stream-orchestrator/sessions/:id/recording/start` pour activer l'enregistrement sur un stream actif. Une fois le stream terminé, les fichiers uploadés sont listables via `GET /stream-orchestrator/sessions/:id/recordings` et téléchargeables via `GET /stream-orchestrator/recordings/:id/download` — ces routes sont accessibles à `https://api.tiklivepro.me/stream-orchestrator/…` (bloc Caddy `/stream-orchestrator/*`). Si `RECORDING_STORAGE_PROVIDER` est absent, l'activation de l'enregistrement fonctionne (MediaMTX écrit les fichiers) mais les fichiers ne sont pas uploadés et aucune entrée en DB n'est créée.

*Option A — DigitalOcean Spaces* (couvert par votre crédit $200)

| Secret | Valeur |
|--------|--------|
| `RECORDING_STORAGE_PROVIDER` | `do-spaces` |
| `RECORDING_STORAGE_BUCKET` | Nom du bucket Spaces (ex : `tiklivepro-recordings`) |
| `RECORDING_STORAGE_REGION` | Région du bucket (ex : `fra1`) |
| `RECORDING_STORAGE_ENDPOINT` | `https://fra1.digitaloceanspaces.com` |
| `RECORDING_STORAGE_ACCESS_KEY_ID` | DO Spaces > API > Spaces Keys > Key |
| `RECORDING_STORAGE_SECRET_ACCESS_KEY` | DO Spaces > API > Spaces Keys > Secret |
| `RECORDING_STORAGE_CDN_URL` | URL CDN du bucket (optionnel, ex : `https://tiklivepro-recordings.fra1.cdn.digitaloceanspaces.com`) |

*Option B — Cloudflare R2* (10 GB/mois gratuit, aucun frais d'egress)

| Secret | Valeur |
|--------|--------|
| `RECORDING_STORAGE_PROVIDER` | `r2` |
| `RECORDING_STORAGE_BUCKET` | Nom du bucket R2 (ex : `tiklivepro-recordings`) |
| `RECORDING_STORAGE_REGION` | `auto` |
| `RECORDING_STORAGE_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `RECORDING_STORAGE_ACCESS_KEY_ID` | R2 > Manage R2 API Tokens > Access Key ID |
| `RECORDING_STORAGE_SECRET_ACCESS_KEY` | R2 > Manage R2 API Tokens > Secret Access Key |
| `RECORDING_STORAGE_CDN_URL` | URL publique du bucket. Deux formes possibles — voir `docs/recording.md § 5` : (1) domaine custom `https://recordings.tiklivepro.me` **seulement si le DNS de tiklivepro.me est migré vers Cloudflare** ; (2) URL directe `https://pub-<hash>.r2.dev` si vous gardez Namecheap comme DNS. |

**Observability (optionnel)**

| Secret | Description |
|--------|-------------|
| `GRAFANA_PASSWORD` | Mot de passe admin Grafana — requis uniquement si vous démarrez le stack avec `--profile observability` |

### 7c — Environnement de production (optionnel mais recommandé)

**GitHub > repo > Settings > Environments > New environment** : nommez-le `production`.

Cela permet d'ajouter des règles de protection (approbation manuelle avant deploy) si nécessaire.

---

## Étape 8 — Premier déploiement

Le pipeline a deux comportements distincts :

| Événement | Ce qui se passe |
|-----------|----------------|
| `git push origin main` | Build + push des images uniquement (pas de deploy) |
| `git push origin v1.0.0` | Build + push + **deploy en production** |

### Pousser le code (build de validation)
```bash
git push origin main
```
GitHub Actions build les 11 images applicatives en parallèle sur les runners (7 GB RAM — aucun risque d'OOM) et les pousse vers GHCR. MediaMTX est tiré directement depuis Docker Hub au déploiement — aucun build nécessaire. Le serveur n'est pas touché pendant le build.

### Déployer en production (tag de release)
```bash
git tag v1.0.0
git push origin v1.0.0
```
GitHub Actions rebuild, repush avec les tags `1.0.0`, `1.0`, `1`, `latest`, puis se connecte au Droplet via SSH et fait `docker compose pull && up`.

Suivez la progression : **GitHub > votre repo > Actions**

### Vérification manuelle sur le serveur

```bash
# Status de tous les conteneurs
docker compose -f /opt/tiklivepro/docker-compose.prod.managed.yml ps

# Logs en temps réel
docker compose -f /opt/tiklivepro/docker-compose.prod.managed.yml logs -f

# Consommation mémoire
docker stats --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
```

---

## Étape 9 — Caddy + SSL

Caddy obtient et renouvelle automatiquement les certificats SSL via Let's Encrypt dès que les enregistrements DNS pointent vers le Droplet. Aucune configuration supplémentaire.

À partir du **deuxième déploiement**, le workflow CI met à jour `/etc/caddy/Caddyfile` automatiquement (copie depuis `infra/caddy/Caddyfile` dans le dépôt, puis `systemctl reload caddy`). Toute modification du Caddyfile dans le dépôt est donc propagée en production à chaque tag.

---

## Étape 10 — Vérification TikTok du domaine

Une fois le site en ligne, ajoutez la meta tag dans `apps/web/src/app/layout.tsx` :

```tsx
export const metadata: Metadata = {
  other: {
    'tiktok-domain-verification': 'VOTRE_CODE_FOURNI_PAR_TIKTOK',
  },
};
```

Commitez, poussez sur `main`, puis créez un tag pour déclencher le déploiement :
```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat: add TikTok domain verification"
git push origin main
git tag v1.0.1 && git push origin v1.0.1
```

---

## Flux de déploiement

```
git push origin main          git tag v1.2.3 && git push origin v1.2.3
        ↓                                      ↓
GitHub Actions                       GitHub Actions
  ├─ Build api-gateway  ┐              ├─ Build api-gateway  ┐
  ├─ Build auth         │              ├─ Build auth         │
  ├─ Build users        │ parallèle    ├─ Build users        │ parallèle
  ├─ Build ...          │              ├─ Build ...          │
  └─ Build web          ┘              └─ Build web          ┘
        ↓                                      ↓
  push :main, :sha-xxx             push :1.2.3, :1.2, :1, :latest
  (pas de deploy)                         ↓
                                   SSH → Droplet
                                     écriture de .env depuis GitHub Secrets
                                     docker compose pull
                                     docker compose up -d
                                     docker image prune -f
```

Le fichier `.env` est **recréé à chaque déploiement** depuis les secrets GitHub — le serveur ne stocke jamais de secrets de façon permanente. `IMAGE_TAG` et `REGISTRY` sont calculés depuis le tag git et injectés directement.

---

## URLs finales

| Champ | Valeur |
|-------|--------|
| Site web | `https://tiklivepro.me` |
| API Gateway | `https://api.tiklivepro.me` |
| Status page | `https://status.tiklivepro.me` |
| HLS viewer (stream natif) | `https://hls.tiklivepro.me/live/<ingestKey>/index.m3u8` |
| WHIP ingest (broadcaster) | `https://webrtc.tiklivepro.me/live/<ingestKey>/whip` |
| Recordings (actifs) | `https://api.tiklivepro.me/stream-orchestrator/recordings` |
| Recordings (terminés) | `https://api.tiklivepro.me/stream-orchestrator/sessions/<id>/recordings` |
| Terms of Service | `https://tiklivepro.me/legal/terms` |
| Privacy Policy | `https://tiklivepro.me/legal/privacy` |
| OAuth Redirect (TikTok) | `https://api.tiklivepro.me/integrations/oauth/tiktok/callback` |
| OAuth Redirect (Facebook) | `https://api.tiklivepro.me/integrations/oauth/facebook/callback` |

---

## Estimation des coûts mensuels

| Ressource | Coût |
|-----------|------|
| Droplet 4 GB | ~$24/mois (couvert par les $200 pendant ~8 mois) |
| Domaine `.me` | Gratuit 1 an (Student Pack) |
| SSL | Gratuit (Caddy + Let's Encrypt) |
| PostgreSQL (Neon) | Gratuit (free tier) |
| Redis (Upstash) | Gratuit (free tier) |
| GitHub Actions | Gratuit (2 000 min/mois pour repos publics) |
| GHCR | Gratuit (500 MB pour repos publics) |
| **Total** | **~$24/mois** |

---

## Dépannage

### Un service est tué (OOM)
```bash
dmesg | grep -i "out of memory"
docker compose -f /opt/tiklivepro/docker-compose.prod.managed.yml ps
```
Augmentez la limite mémoire dans `docker-compose.prod.managed.yml` et réduisez celle d'un service moins critique (`analytics`, `notifications`).

### Le deploy GitHub Actions échoue au SSH
Vérifiez que `DROPLET_IP` et `DROPLET_SSH_KEY` sont bien configurés dans les secrets GitHub. Testez manuellement :
```bash
ssh -i ~/.ssh/id_rsa root@188.166.197.25 "docker ps"
```

### Un service refuse de démarrer (variable manquante)
Le fichier `.env` est écrit par le CI depuis les secrets GitHub. Si une variable est absente :
1. Vérifiez que le secret correspondant existe dans **GitHub > Settings > Secrets and variables > Actions**
2. Relancez le déploiement (nouveau tag ou `workflow_dispatch`)

### Le frontend affiche "Something went wrong" à la connexion
Deux causes possibles :
- **`NEXTAUTH_SECRET` ou `NEXTAUTH_URL` manquant** — vérifiez ces deux secrets et relancez le déploiement.
- **`NEXT_PUBLIC_API_URL` pointe vers `localhost`** — ces variables sont baked dans le bundle JS à la compilation. Vérifiez que `NEXT_PUBLIC_API_URL` et `NEXT_PUBLIC_COMMENTS_WS_URL` sont bien définis dans les secrets GitHub **avant** de déclencher un build (`git tag v...`). Modifier uniquement le `.env` sur le serveur ne suffit pas — il faut rebuilder l'image.

Vérifier le `.env` actuel sur le serveur :
```bash
cat /opt/tiklivepro/.env
```

### `docker pull` échoue (unauthorized)
Re-connectez Docker à GHCR sur le serveur :
```bash
echo "VOTRE_PAT" | docker login ghcr.io -u VOTRE_USERNAME --password-stdin
```

### Un sous-domaine est inaccessible (`DNS_PROBE_FINISHED_NXDOMAIN`)

Symptôme : `hls.tiklivepro.me`, `api.tiklivepro.me`, ou `www.tiklivepro.me` retourne une erreur DNS dans le navigateur.

Cause : l'enregistrement DNS correspondant est absent dans Namecheap.

```bash
# Vérifier quel enregistrement est manquant
dig hls.tiklivepro.me +short      # doit retourner 188.166.197.25
dig api.tiklivepro.me +short
dig webrtc.tiklivepro.me +short
dig status.tiklivepro.me +short
```

Fix : **Namecheap > Domain List > Manage > Advanced DNS** — ajoutez l'enregistrement manquant :

| Type | Host | Value |
|------|------|-------|
| CNAME Record | `hls` | `tiklivepro.me.` |
| CNAME Record | `api` | `tiklivepro.me.` |
| CNAME Record | `webrtc` | `tiklivepro.me.` |
| CNAME Record | `status` | `tiklivepro.me.` |

Attendez 5–30 min puis relancez le `dig`. Une fois le DNS propagé, Caddy émet automatiquement le certificat SSL Let's Encrypt pour le sous-domaine.

### Le stream HLS ne se charge pas dans le navigateur

Vérifiez l'ordre de cause le plus probable :

```bash
# 1. MediaMTX est-il en cours d'exécution ?
docker compose -f /opt/tiklivepro/docker-compose.prod.managed.yml ps mediamtx

# 2. Y a-t-il un stream actif ? (pas d'auth requise — auth ouverte en prod et en dev)
curl http://localhost:9997/v3/paths/list

# 3. Caddy forward-il bien le port 8888 ?
curl http://localhost:8888/index.m3u8

# 4. Les logs MediaMTX montrent-ils une connexion RTMP entrant ?
docker compose -f /opt/tiklivepro/docker-compose.prod.managed.yml logs mediamtx --tail=50
```

Si `/v3/paths/list` retourne `{"items":[]}` alors que la session est `live`, cela signifie que le worker ffmpeg n'a pas réussi à connecter au port 1936 de MediaMTX. Vérifiez les logs de stream-orchestrator.

### La session reste en statut `starting`

Le passage à `live` ne se produit que quand le `MediaMtxStreamWatcher` du stream-orchestrator détecte un path actif sur MediaMTX (`GET /v3/paths/list` retourne un élément). Causes les plus fréquentes :

**Streaming navigateur (WHIP) :**
1. **Candidats ICE manquants** — cause la plus courante en production. MediaMTX tourne dans Docker et n'annonce que son IP interne (`172.x.x.x`) si `SERVER_PUBLIC_IP` n'est pas défini. Le navigateur ne peut alors pas atteindre le port UDP 8189 et la connexion WebRTC échoue silencieusement après une négociation SDP réussie. Vérifiez que `DROPLET_IP` est bien défini dans les secrets GitHub — le workflow en dérive automatiquement `SERVER_PUBLIC_IP`.
2. **Port UDP 8189 bloqué** — vérifiez que le pare-feu du Droplet autorise le port `8189/udp` en entrée (DigitalOcean > Networking > Firewalls, ou `ufw allow 8189/udp`).
3. **`MEDIAMTX_WEBRTC_URL` incorrect** — doit être `https://webrtc.tiklivepro.me`. Vérifiez dans la console du navigateur que le POST WHIP vers cette URL retourne bien un `201`.
4. **Enregistrement DNS `webrtc` manquant** — `webrtc.tiklivepro.me` doit avoir un CNAME vers `tiklivepro.me.` dans Namecheap (voir Étape 3).

**Streaming OBS/RTMP :** un client externe doit pousser sur `rtmp://<DROPLET_IP>:1935/live/<ingestKey>`. Récupérez la clé via `GET /stream-orchestrator/sessions/<id>/ingest`.

### Swap saturé
```bash
free -h && swapon --show
```
Si saturé : redémarrez les services non critiques ou passez au Droplet 8 GB.

### Vérifier l'espace disque
```bash
df -h
docker system df
docker system prune -f   # nettoie les images inutilisées
```

### La résolution YouTube échoue avec `RESOLVE_FAILED` ou "Sign in to confirm you're not a bot"

Les IP DigitalOcean sont des plages datacenter que YouTube bloque systématiquement. Aucun paramètre yt-dlp (player client iOS, etc.) ne contourne cette restriction sans cookies.

**Fix — uploader des cookies YouTube (une seule fois) :**

1. Installez l'extension Chrome [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
2. Ouvrez YouTube en étant connecté à votre compte Google, exportez les cookies → `youtube-cookies.txt`
3. Uploadez sur le serveur :
   ```bash
   scp youtube-cookies.txt root@188.166.197.25:/opt/tiklivepro/youtube-cookies.txt
   ```
4. Activez immédiatement (sans rebuild) :
   ```bash
   ssh root@188.166.197.25
   cd /opt/tiklivepro
   echo "YTDLP_COOKIES_FILE=/app/youtube-cookies.txt" >> .env
   sed -i 's|      # - /opt/tiklivepro/youtube-cookies.txt:/app/youtube-cookies.txt:ro|      - /opt/tiklivepro/youtube-cookies.txt:/app/youtube-cookies.txt:ro|' docker-compose.prod.managed.yml
   docker compose -f docker-compose.prod.managed.yml up -d stream-orchestrator
   ```

À partir du déploiement suivant, le workflow CI détecte automatiquement la présence du fichier et l'active sans intervention manuelle.

**Quand les cookies expirent** (symptôme : `RESOLVE_FAILED` qui réapparaît après une période de bon fonctionnement) :
```bash
# Ré-exporter depuis le navigateur → télécharger youtube-cookies.txt
scp youtube-cookies.txt root@188.166.197.25:/opt/tiklivepro/youtube-cookies.txt
docker compose -f /opt/tiklivepro/docker-compose.prod.managed.yml restart stream-orchestrator
```

Voir `docs/video-proxy.md § YouTube on datacenter IPs` pour la documentation complète.
