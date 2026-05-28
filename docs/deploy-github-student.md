# Déploiement via GitHub Student Developer Pack

> Dernière mise à jour : 2026-05-27

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

### 6d — Dossier du projet et fichier `.env`

```bash
mkdir -p /opt/tiklivepro
```

> **Où vont les secrets ?**
>
> | Variable | Où la mettre | Pourquoi |
> |----------|-------------|---------|
> | `DROPLET_IP`, `DROPLET_SSH_KEY` | **GitHub Secrets** | utilisées par le runner GitHub Actions pour se connecter au serveur |
> | Tout le reste (JWT, DB, OAuth…) | **`/opt/tiklivepro/.env`** | chargées par `docker compose` sur le serveur — ne transitent jamais par GitHub |
> | `REGISTRY`, `IMAGE_TAG` | **injectées par le CI** | le workflow les exporte via `export` avant `docker compose pull` — pas besoin de les mettre dans `.env` |

Créez `/opt/tiklivepro/.env` avec uniquement les secrets applicatifs :

```bash
cat > /opt/tiklivepro/.env << 'EOF'
# Secrets de l'application
JWT_SECRET=        # openssl rand -hex 64
TOKEN_ENCRYPTION_KEY=  # openssl rand -hex 32

# Neon — connection strings (même host, base différente par service)
AUTH_DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/tiklivepro_auth?sslmode=require
USERS_DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/tiklivepro_users?sslmode=require
SESSIONS_DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/tiklivepro_sessions?sslmode=require
BILLING_DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/tiklivepro_billing?sslmode=require
INTEGRATIONS_DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/tiklivepro_integrations?sslmode=require
COMMENTS_DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/tiklivepro_comments?sslmode=require
NOTIFICATIONS_DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/tiklivepro_notifications?sslmode=require
ANALYTICS_DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/tiklivepro_analytics?sslmode=require
STREAM_DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/tiklivepro_stream?sslmode=require

# Upstash Redis
REDIS_URL=rediss://default:TOKEN@HOST.upstash.io:6379

# Social OAuth
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PREMIUM_PRICE_ID=

# Frontend
NEXT_PUBLIC_API_URL=https://api.tiklivepro.me
OAUTH_REDIRECT_BASE_URL=https://api.tiklivepro.me

# Grafana (uniquement avec --profile observability)
GRAFANA_PASSWORD=
EOF
```

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

Le workflow GitHub Actions a besoin de deux informations pour se connecter à votre Droplet et y déclencher le déploiement. Ces informations sont stockées comme **secrets chiffrés** dans GitHub — elles ne sont jamais visibles dans les logs CI.

**Où les ajouter :**
**GitHub > votre repo > Settings > Secrets and variables > Actions > New repository secret**

---

**Secret 1 : `DROPLET_IP`**

Valeur = l'IP publique de votre Droplet, visible dans le dashboard DigitalOcean (ex : `167.99.143.212`).

```
Name:   DROPLET_IP
Secret: 167.99.143.212
```

---

**Secret 2 : `DROPLET_SSH_KEY`**

Valeur = le contenu **complet** de votre clé SSH privée (le fichier `~/.ssh/id_rsa` sur votre machine locale — c'est la clé dont la partie publique a été ajoutée au Droplet lors de sa création).

Pour copier le contenu de la clé dans votre presse-papier, exécutez **sur votre machine locale** :
```bash
cat ~/.ssh/id_rsa
```

Copiez tout le bloc, en incluant les lignes d'en-tête et de fin :
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAA...
...
-----END OPENSSH PRIVATE KEY-----
```

Collez ce bloc entier comme valeur du secret :
```
Name:   DROPLET_SSH_KEY
Secret: -----BEGIN OPENSSH PRIVATE KEY-----
        b3BlbnNzaC1rZXktdjEAAAAA...
        -----END OPENSSH PRIVATE KEY-----
```

> **Pourquoi la clé privée ?** GitHub Actions doit se connecter en SSH au Droplet pour lancer `docker compose pull && up`. Il a besoin de la clé privée pour s'authentifier, exactement comme vous le faites avec `ssh root@<IP>` depuis votre terminal.

---

**Récapitulatif des secrets à créer :**

| Secret | Valeur |
|--------|--------|
| `DROPLET_IP` | IP publique du Droplet (ex : `167.99.143.212`) |
| `DROPLET_SSH_KEY` | Contenu complet de `~/.ssh/id_rsa` (clé privée, bloc `BEGIN … END`) |

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
                                     export IMAGE_TAG=1.2.3
                                     export REGISTRY=ghcr.io/...
                                     docker compose pull
                                     docker compose up -d
                                     docker image prune -f
```

Le tag `IMAGE_TAG=1.2.3` est injecté par le CI au moment du deploy — il n'est pas dans le `.env` du serveur. Chaque service démarre exactement la version taguée à ce commit.

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
