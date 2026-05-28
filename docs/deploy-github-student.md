# Déploiement via GitHub Student Developer Pack

> Dernière mise à jour : 2026-05-28

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
| **Total** | **~2 432 m** |
| OS + marge | ~1 600 m |

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

Vérifier la propagation (5–30 min) :
```bash
dig tiklivepro.me +short
```

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

`/etc/caddy/Caddyfile` :
```
tiklivepro.me, www.tiklivepro.me {
    reverse_proxy localhost:3010
}

api.tiklivepro.me {
    reverse_proxy localhost:3000
}
```
```bash
systemctl reload caddy
```

### 6d — Dossier du projet

```bash
mkdir -p /opt/tiklivepro
```

> **Où vont les secrets ?**
>
> | Variable | Où la mettre | Pourquoi |
> |----------|-------------|---------|
> | `DROPLET_IP`, `DROPLET_SSH_KEY` | **GitHub Secrets** | utilisées par le runner pour se connecter au serveur via SSH |
> | Tout le reste (JWT, DB, OAuth…) | **GitHub Secrets** | le CI écrit le fichier `.env` sur le serveur à chaque déploiement — pas de maintenance manuelle |
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

| Secret | Comment l'obtenir |
|--------|------------------|
| `TIKTOK_CLIENT_KEY` | TikTok Developer Portal > votre app > App Key |
| `TIKTOK_CLIENT_SECRET` | TikTok Developer Portal > votre app > App Secret |
| `FACEBOOK_APP_ID` | Meta for Developers > votre app > App ID |
| `FACEBOOK_APP_SECRET` | Meta for Developers > votre app > App Secret |

**Stripe**

| Secret | Comment l'obtenir |
|--------|------------------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard > Developers > API keys > Secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard > Developers > Webhooks > votre endpoint > Signing secret |
| `STRIPE_PREMIUM_PRICE_ID` | Stripe Dashboard > Products > votre plan Premium > Price ID (format `price_xxx`) |

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
GitHub Actions build les 11 images en parallèle sur les runners (7 GB RAM — aucun risque d'OOM) et les pousse vers GHCR. Le serveur n'est pas touché.

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

Caddy obtient et renouvelle automatiquement les certificats SSL via Let's Encrypt dès que le DNS pointe vers le Droplet. Aucune configuration supplémentaire.

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

Vérifier le `.env` actuel sur le serveur :
```bash
cat /opt/tiklivepro/.env
```

### `docker pull` échoue (unauthorized)
Re-connectez Docker à GHCR sur le serveur :
```bash
echo "VOTRE_PAT" | docker login ghcr.io -u VOTRE_USERNAME --password-stdin
```

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
