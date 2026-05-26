# Déploiement via GitHub Student Developer Pack

> Dernière mise à jour : 2026-05-26

Ce guide couvre le déploiement de TikLivePro en production en utilisant deux avantages du GitHub Student Pack :
- **Namecheap** — domaine gratuit `.me` pendant 1 an + SSL
- **DigitalOcean** — $200 de crédit valable 1 an

Architecture cible : un **Droplet DigitalOcean** unique (Docker Compose), suffisant pour un environnement de démonstration / MVP.

---

## Étape 1 — Obtenir un domaine gratuit (Namecheap)

1. Connectez-vous sur [education.github.com/pack](https://education.github.com/pack)
2. Cherchez **Namecheap** et cliquez sur **Get access**
3. Vous serez redirigé vers Namecheap avec votre offre étudiante activée
4. Enregistrez un domaine `.me` gratuit (ex : `tiklive.me`)
5. Activez le **SSL gratuit** inclus (section "SSL Certificates" dans votre dashboard Namecheap)

> Le domaine `.me` sera utilisé pour toutes les URLs de configuration TikTok et Facebook.

---

## Étape 2 — Créer un compte DigitalOcean avec le crédit étudiant

1. Sur [education.github.com/pack](https://education.github.com/pack), cherchez **DigitalOcean**
2. Cliquez **Get access** — vous obtenez $200 de crédit valable 1 an
3. Créez votre compte DigitalOcean en vous authentifiant via GitHub
4. Ajoutez un moyen de paiement (obligatoire même avec crédit, rien ne sera débité si vous restez dans la limite)

---

## Étape 3 — Créer un Droplet

Dans le dashboard DigitalOcean :

1. **Create > Droplets**
2. Choisissez la région la plus proche de vos utilisateurs (ex : Frankfurt ou Amsterdam pour l'Europe)
3. Image : **Ubuntu 24.04 LTS**
4. Plan : **Basic — 4 GB RAM / 2 vCPUs / 80 GB SSD** (~$24/mois, couvert par le crédit)
5. Authentication : **SSH Key** (recommandé) — ajoutez votre clé publique `~/.ssh/id_rsa.pub`
6. Hostname : `tiklive-prod`
7. Cliquez **Create Droplet**

Notez l'adresse IP publique du Droplet (ex : `167.99.xxx.xxx`).

---

## Étape 4 — Pointer le domaine vers le Droplet

Dans le dashboard **Namecheap > Domain List > Manage > Advanced DNS** :

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A Record | `@` | `167.99.xxx.xxx` | Automatic |
| A Record | `www` | `167.99.xxx.xxx` | Automatic |
| CNAME Record | `api` | `tiklive.me.` | Automatic |

Attendez la propagation DNS (5 à 30 minutes). Vérifiez avec :
```bash
dig tiklive.me +short
```

---

## Étape 5 — Configurer le serveur

Connectez-vous au Droplet :
```bash
ssh root@167.99.xxx.xxx
```

Installez Docker et Docker Compose :
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

# Vérifier
docker --version
docker compose version
```

Installez Caddy (reverse proxy + SSL automatique) :
```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
```

---

## Étape 6 — Déployer le projet

Clonez le dépôt sur le serveur :
```bash
git clone https://github.com/VOTRE_USERNAME/tik-live-pro.git /opt/tiklive
cd /opt/tiklive
```

Créez les fichiers `.env` pour chaque service à partir des `.env.example` :
```bash
# Exemple pour le service auth
cp services/auth/.env.example services/auth/.env
# Éditez chaque fichier .env avec vos vraies valeurs
nano services/auth/.env
```

Variables critiques à renseigner dans chaque `.env` :
- `DATABASE_URL` — connexion PostgreSQL
- `NATS_URL` — `nats://nats:4222`
- `JWT_SECRET` — chaîne aléatoire ≥ 64 caractères (`openssl rand -hex 64`)
- `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`
- `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`

Lancez tous les services :
```bash
docker compose -f docker-compose.prod.yml up -d
```

Vérifiez que tout tourne :
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50
```

---

## Étape 7 — Configurer Caddy (reverse proxy + SSL)

Créez `/etc/caddy/Caddyfile` :
```
tiklive.me, www.tiklive.me {
    reverse_proxy localhost:3010
}

api.tiklive.me {
    reverse_proxy localhost:3000
}
```

Rechargez Caddy :
```bash
systemctl reload caddy
```

Caddy obtient et renouvelle automatiquement les certificats SSL via Let's Encrypt. Votre site sera accessible en HTTPS sans configuration supplémentaire.

---

## Étape 8 — Vérification TikTok du domaine

Une fois le site en ligne, ajoutez la meta tag de vérification TikTok dans `apps/web/src/app/layout.tsx` :

```tsx
export const metadata: Metadata = {
  // ...metadata existant
  other: {
    'tiktok-domain-verification': 'VOTRE_CODE_FOURNI_PAR_TIKTOK',
  },
};
```

Reconstruisez et redéployez :
```bash
docker compose -f docker-compose.prod.yml build web
docker compose -f docker-compose.prod.yml up -d web
```

Puis cliquez **Verify** dans le TikTok Developer Portal.

---

## URLs finales à utiliser dans TikTok / Facebook

| Champ | Valeur |
|-------|--------|
| Site web | `https://tiklive.me` |
| API Gateway | `https://api.tiklive.me` |
| Terms of Service | `https://tiklive.me/legal/terms` |
| Privacy Policy | `https://tiklive.me/legal/privacy` |
| OAuth Redirect (TikTok) | `https://api.tiklive.me/integrations/oauth/tiktok/callback` |
| OAuth Redirect (Facebook) | `https://api.tiklive.me/integrations/oauth/facebook/callback` |

---

## Estimation des coûts mensuels

| Ressource | Coût |
|-----------|------|
| Droplet 4 GB | ~$24/mois |
| Domaine `.me` | Gratuit 1 an (Student Pack) |
| SSL | Gratuit (Caddy + Let's Encrypt) |
| **Total** | **~$24/mois** (couvert par les $200 de crédit pendant ~8 mois) |
