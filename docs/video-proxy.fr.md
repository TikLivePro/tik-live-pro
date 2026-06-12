> Dernière mise à jour : 2026-06-12 (python3 requis dans l'image, flag --js-runtimes nodejs, section détection bot YouTube sur IP datacenter et contournement par cookies)

# Proxy Vidéo — Résolution d'URL de plateforme

Ce guide explique comment TikLivePro résout des liens de plateformes de streaming (YouTube, Twitch, Vimeo, Dailymotion) en URL directement lisibles, afin de les utiliser comme source vidéo pendant une session live.

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Fonctionnement](#fonctionnement)
3. [Modèle de sécurité](#modèle-de-sécurité)
4. [Plateformes prises en charge](#plateformes-prises-en-charge)
5. [Prérequis — installer yt-dlp et ffmpeg](#prérequis--installer-yt-dlp-et-ffmpeg)
6. [YouTube sur IP datacenter](#youtube-sur-ip-datacenter)
7. [Utilisation via l'interface](#utilisation-via-linterface)
8. [Référence API](#référence-api)
9. [Environnement et configuration](#environnement-et-configuration)
10. [Dépannage](#dépannage)

---

## Vue d'ensemble

L'élément `<video>` du navigateur ne peut charger que des **URL de médias directs** — un `.mp4` brut, un `.webm`, ou un manifeste HLS (`.m3u8`). Coller un lien YouTube ou Twitch dans le champ URL échoue, car ces plateformes servent leur contenu via des lecteurs propriétaires et appliquent des restrictions CORS qui empêchent la capture du flux.

Le Proxy Vidéo résout ce problème grâce à deux mécanismes complémentaires :

| Mécanisme | Où il s'exécute | Ce qu'il fait |
|---|---|---|
| **Résoudre via le serveur** (bouton frontend) | Backend `stream-orchestrator` | Extrait une URL CDN directe via `yt-dlp`, la renvoie au navigateur qui la charge dans `<video>` et l'envoie via WHIP |
| **video-push avec URL de plateforme** (API / mobile) | Backend `stream-orchestrator` | Détecte les URL de plateformes dans `POST /sessions/:id/video-push`, les résout avec `yt-dlp`, puis passe le résultat directement à `ffmpeg` — sans passer par le navigateur |

---

> **Note DASH** : pour les vidéos YouTube / Vimeo en haute qualité, yt-dlp sélectionne des flux DASH séparés (vidéo seule + audio seul). Lorsque la réponse contient `resolvedUrl` **et** `audioUrl`, l'endpoint `merge-stream` et le proxy Next.js `video-stream` prennent en charge la fusion automatiquement — voir [Fonctionnement → Chemin DASH](#chemin-dash--vidéo--audio-séparés).

---

## Fonctionnement

### Chemin navigateur (Résoudre via le serveur) — flux combiné

Lorsque yt-dlp renvoie une URL unique contenant déjà vidéo et audio (courant pour Twitch, Dailymotion et YouTube en qualité standard) :

```
L'utilisateur colle une URL YouTube
        │
        ▼
VideoSourcePicker détecte une URL de plateforme
→ affiche un avertissement ambre + bouton « Résoudre via le serveur »
        │
        ▼
L'utilisateur clique sur « Résoudre via le serveur »
        │
        ▼
POST /stream-orchestrator/video-proxy/resolve
  { url: "https://www.youtube.com/watch?v=..." }
        │
        ▼
stream-orchestrator : vérification isPlatformUrl() (liste blanche)
        │
        ▼
resolveWithYtDlp() lance yt-dlp dans un sous-processus isolé
  args : ['--no-playlist', '--js-runtimes', 'nodejs',
          '--extractor-args', 'youtube:player_client=ios,web',
          '-f', 'best[...]', '--dump-json', '--', url]
  (optionnel : --cookies /app/youtube-cookies.txt si YTDLP_COOKIES_FILE est défini)
        │
        ▼
yt-dlp contacte la plateforme et extrait l'URL CDN directe
(généralement un manifeste HLS pour les live, un mp4 signé pour les VOD)
        │
        ▼
Réponse : { resolvedUrl, title, availableHeights }
        │
        ▼
Le navigateur charge resolvedUrl via le proxy Next.js /api/video-stream
(proxy same-origin — contourne les CORS pour que captureStream() fonctionne)
        │
        ▼
captureStream() capture la vidéo en tant que MediaStream
        │
        ▼
WebRTC / WHIP → MediaMTX → ffmpeg → TikTok + Facebook
```

### Chemin DASH — vidéo + audio séparés

Pour les vidéos YouTube ou Vimeo en haute qualité, yt-dlp sélectionne des flux DASH séparés (H.264 vidéo seule + AAC audio seul). La réponse contient `resolvedUrl` et `audioUrl`. Le navigateur ne peut pas lire deux flux indépendants ; l'endpoint `merge-stream` comble cette lacune :

```
Réponse : { resolvedUrl, audioUrl, title, availableHeights }
        │
        ▼
Le navigateur construit l'URL de fusion :
  GET /stream-orchestrator/video-proxy/merge-stream?v=<videoUrl>&a=<audioUrl>
        │
        ▼
stream-orchestrator lance :
  ffmpeg -i <videoUrl> -i <audioUrl> -c copy -movflags frag_keyframe+empty_moov -f mp4 pipe:1
  (fusion temps réel, sans réencodage)
        │
        ▼
Sortie ffmpeg envoyée en réponse MP4 fragmenté
        │
        ▼
Le navigateur charge l'URL merge-stream via le proxy Next.js /api/video-stream
(same-origin — captureStream() fonctionne)
        │
        ▼
captureStream() → WebRTC / WHIP → MediaMTX → ffmpeg → TikTok + Facebook
```

### Chemin serveur (video-push avec URL de plateforme)

```
POST /stream-orchestrator/sessions/:id/video-push
  { videoUri: "https://www.youtube.com/watch?v=..." }
        │
        ▼
Vérification isPlatformUrl() (liste blanche)
        │
        ▼
resolveWithYtDlp() extrait l'URL CDN directe
        │
        ▼
ffmpeg -i <resolvedUrl> ... → RTMP → TikTok + Facebook
```

Ce chemin contourne entièrement le navigateur — utile pour les clients mobiles ou les flux de travail automatisés lorsque la session est déjà active.

---

## Modèle de sécurité

### Prévention SSRF

`yt-dlp` n'est invoqué que pour des URL correspondant à une liste blanche de noms d'hôte explicite dans `ytdlp-resolver.ts`. Toute URL hors liste est rejetée avec HTTP 400 **avant** que le sous-processus soit lancé :

```
youtube.com, www.youtube.com, youtu.be, m.youtube.com
twitch.tv, www.twitch.tv, clips.twitch.tv
vimeo.com, www.vimeo.com, player.vimeo.com
dailymotion.com, www.dailymotion.com
```

Les plages d'IP privées et les adresses internes sont également bloquées par le validateur côté client `isUnsafeVideoUrl()` dans `VideoSourcePicker` (première ligne de défense — la vérification backend est la porte d'entrée faisant autorité).

### Isolation du sous-processus

`yt-dlp` est lancé avec `spawn('yt-dlp', args, { shell: false })`. Le tableau d'arguments n'est jamais concaténé en chaîne shell, ce qui élimine l'injection de commandes. `stdin` est fermé (`'ignore'`) ; seuls les pipes `stdout` et `stderr` sont ouverts.

### Authentification

L'endpoint `/video-proxy/resolve` exige un JWT Bearer valide. L'API Gateway valide le jeton avant que la requête atteigne `stream-orchestrator`.

### Limitation de débit

`/video-proxy/resolve` est limité à **5 requêtes par IP par 60 secondes** (en mémoire, par processus). Cela empêche un utilisateur unique d'épuiser le CPU du serveur avec des lancements rapides de yt-dlp.

### Délai d'expiration

Chaque processus `yt-dlp` est tué via `SIGKILL` après **30 secondes** s'il n'a pas terminé, évitant l'accumulation de processus bloqués.

---

## Plateformes prises en charge

| Plateforme | Streams live | VOD | Remarques |
|---|---|---|---|
| **YouTube** | ✅ | ✅ | Les streams live donnent un manifeste HLS ; les VOD donnent une URL mp4 signée (expire ~6 h) |
| **Twitch** | ✅ | ✅ (VODs) | Les streams live donnent un manifeste HLS |
| **Vimeo** | ⚠️ | ✅ | Les vidéos privées ou protégées par mot de passe échouent avec `VIDEO_UNAVAILABLE` |
| **Dailymotion** | ✅ | ✅ | |
| Facebook | ❌ | ❌ | Exclu — nécessite des cookies d'authentification que yt-dlp ne peut pas obtenir côté serveur |
| Instagram | ❌ | ❌ | Exclu — même raison |
| TikTok | ❌ | ❌ | Exclu — même raison |

> **Contenu protégé DRM** : les vidéos protégées par Widevine ou FairPlay DRM ne peuvent pas être extraites par yt-dlp quelle que soit la plateforme. Une tentative de résolution renvoie une erreur `RESOLVE_FAILED`.

---

## Prérequis — installer yt-dlp et ffmpeg

`yt-dlp` **et** `ffmpeg` doivent tous deux être installés et disponibles dans le `PATH` de la machine qui exécute `stream-orchestrator`.

- `yt-dlp` résout les URL de plateformes en URL CDN directes.
- `ffmpeg` fusionne les flux DASH vidéo+audio séparés (endpoint `merge-stream`) et est aussi utilisé par le worker RTMP pour la diffusion. Il n'est **pas** fourni avec l'application.

> Les deux sont intégrés dans `infra/docker/Dockerfile.stream-orchestrator` — aucune installation manuelle n'est nécessaire pour les déploiements Docker/Kubernetes.

### Linux (recommandé pour la production)

```bash
# Via pip (toujours à jour)
pip install yt-dlp

# Ou télécharger le binaire autonome
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp
sudo chmod +x /usr/local/bin/yt-dlp
```

### macOS (développement)

```bash
brew install yt-dlp
```

### Windows (développement)

```powershell
winget install yt-dlp
# ou
scoop install yt-dlp
```

### Docker / Kubernetes

`yt-dlp` est intégré dans `infra/docker/Dockerfile.stream-orchestrator` — aucune installation manuelle n'est nécessaire.

L'image runtime installe :
- `ffmpeg` — fusion des flux DASH et diffusion RTMP
- `python3` — interpréteur requis par le zipapp Python de yt-dlp
- `yt-dlp` — téléchargé depuis GitHub Releases lors du build

La version est contrôlée par l'ARG de build `YTDLP_VERSION`. Pour mettre à jour, modifiez l'ARG dans `Dockerfile.stream-orchestrator` et reconstruisez l'image.

**Mise à jour automatique au démarrage (activée par défaut en production) :** `YTDLP_AUTO_UPDATE=true` est défini dans `docker-compose.prod.managed.yml` — le conteneur exécute `yt-dlp -U` à chaque démarrage pour récupérer les derniers extracteurs.

### Vérifier l'installation

```bash
yt-dlp --version
# Résultat attendu : 2024.XX.XX ou plus récent
```

Si `yt-dlp` est introuvable lors d'une requête de résolution, l'endpoint renvoie HTTP **503 YTDLP_NOT_INSTALLED**.

---

## YouTube sur IP datacenter

YouTube applique une détection de bot agressive aux requêtes provenant de plages d'IP datacenter (DigitalOcean, AWS, Hetzner…). Même avec la dernière version de yt-dlp et le client iOS (`--extractor-args youtube:player_client=ios,web`), YouTube renvoie :

```
Sign in to confirm you're not a bot.
```

Le seul contournement fiable pour un serveur datacenter est d'authentifier la requête via des cookies exportés d'un navigateur connecté.

### Fonctionnement

yt-dlp accepte un fichier de cookies au format Netscape (`--cookies /chemin/vers/cookies.txt`). Quand des cookies d'une session YouTube connectée sont présents, YouTube authentifie la requête serveur comme un utilisateur réel.

`stream-orchestrator` lit le chemin depuis `YTDLP_COOKIES_FILE`. Si la variable est vide, yt-dlp s'exécute sans cookies (fonctionnel sur les IP résidentielles). Si définie, `--cookies <chemin>` est ajouté automatiquement à chaque invocation.

### Configuration (une seule fois, par serveur)

**Étape 1 — Exporter les cookies depuis votre navigateur**

Installez l'extension Chrome [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc). Ouvrez YouTube en étant connecté à votre compte Google, cliquez sur l'extension et exportez les cookies sous le nom `youtube-cookies.txt` (format Netscape).

**Étape 2 — Uploader sur le serveur**

```bash
scp youtube-cookies.txt root@188.166.197.25:/opt/tiklivepro/youtube-cookies.txt
```

**Étape 3 — Activer**

Le workflow de déploiement détecte le fichier automatiquement à chaque deploy :
- Il ajoute `YTDLP_COOKIES_FILE=/app/youtube-cookies.txt` au `.env`
- Il décommente le montage de volume dans `docker-compose.prod.managed.yml`

Pour activer immédiatement sans attendre le prochain tag :

```bash
ssh root@188.166.197.25
cd /opt/tiklivepro
echo "YTDLP_COOKIES_FILE=/app/youtube-cookies.txt" >> .env
sed -i 's|      # - /opt/tiklivepro/youtube-cookies.txt:/app/youtube-cookies.txt:ro|      - /opt/tiklivepro/youtube-cookies.txt:/app/youtube-cookies.txt:ro|' docker-compose.prod.managed.yml
docker compose -f docker-compose.prod.managed.yml up -d stream-orchestrator
```

### Expiration des cookies

Les cookies YouTube expirent — généralement après quelques semaines à quelques mois. Le symptôme est `RESOLVE_FAILED` qui réapparaît après une période de bon fonctionnement. Quand cela se produit, ré-exportez et ré-uploadez :

```bash
# Ré-exporter depuis le navigateur → télécharger youtube-cookies.txt
scp youtube-cookies.txt root@188.166.197.25:/opt/tiklivepro/youtube-cookies.txt
docker compose -f /opt/tiklivepro/docker-compose.prod.managed.yml restart stream-orchestrator
```

Aucun redéploiement ni rebuild d'image n'est nécessaire — le fichier est monté en bind mount à l'exécution.

---

## Utilisation via l'interface

### Pas à pas

1. Dans l'écran de configuration de la session live, cliquez sur l'onglet **URL** dans le sélecteur de source vidéo.
2. Collez une URL de plateforme prise en charge (par ex. une vidéo YouTube ou une chaîne Twitch).
3. Un **avertissement ambre** apparaît :
   > *« Les plateformes (YouTube, Twitch…) ne peuvent pas être capturées — utilisez une URL directe .mp4 ou .m3u8, ou résolvez-la via le serveur. »*
4. Cliquez sur **Résoudre via le serveur**.
5. Un indicateur de chargement apparaît pendant que `yt-dlp` s'exécute (jusqu'à 30 secondes).
6. En cas de succès, la vidéo se charge automatiquement dans le lecteur de prévisualisation et est prête à diffuser.
7. En cas d'échec, un message d'erreur rouge apparaît sous le bouton avec la raison.

### Ce qui se passe après la résolution

L'URL résolue est un lien CDN limité dans le temps. Si la session dure longtemps (plusieurs heures), l'URL peut expirer et la vidéo s'arrêtera de se charger. Dans ce cas, collez à nouveau l'URL de la plateforme originale et cliquez sur **Résoudre via le serveur** pour la rafraîchir.

Pour les **streams live** (par ex. une chaîne Twitch en direct), l'URL du manifeste HLS résolu reste valide pendant toute la durée de la diffusion.

---

## Référence API

### `POST /stream-orchestrator/video-proxy/resolve`

Résout une URL de plateforme en URL média directe.

**Authentification :** JWT Bearer requis.
**Limitation de débit :** 5 requêtes par IP par 60 secondes.

**Corps de la requête :**
```json
{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
```

**Réponse en cas de succès (200) :**
```json
{
  "resolvedUrl": "https://rr3---sn-xxx.googlevideo.com/videoplayback?...",
  "title": "Rick Astley - Never Gonna Give You Up"
}
```

**Codes d'erreur :**

| HTTP | Code | Signification |
|---|---|---|
| 400 | `UNSUPPORTED_PLATFORM` | L'URL n'est pas d'une plateforme autorisée |
| 401 | — | JWT manquant ou invalide |
| 422 | `VIDEO_UNAVAILABLE` | Vidéo privée, supprimée ou géo-bloquée |
| 422 | `RESOLVE_FAILED` | yt-dlp n'a pas pu extraire une URL lisible |
| 429 | `RATE_LIMITED` | Limite de débit dépassée — réessayer dans 60 s |
| 503 | `YTDLP_NOT_INSTALLED` | yt-dlp n'est pas installé sur le serveur |
| 504 | `RESOLVE_TIMEOUT` | yt-dlp n'a pas répondu dans les 30 s |

---

### `GET /stream-orchestrator/video-proxy/merge-stream`

Fusionne une URL CDN vidéo seule (DASH) et une URL audio seule en temps réel via ffmpeg, et envoie le résultat en MP4 fragmenté. Consommé par le navigateur à travers le proxy same-origin Next.js `/api/video-stream`.

**Authentification :** aucune — les URL CDN sont déjà des jetons à durée limitée émis par l'endpoint `/resolve` (lui-même authentifié).  
**Limitation de débit :** 3 flux simultanés par IP.

**Paramètres de requête :**

| Paramètre | Description |
|---|---|
| `v` | URL CDN vidéo seule (encodée) |
| `a` | URL CDN audio seule (encodée) |

**Succès :** HTTP 200, `Content-Type: video/mp4` — MP4 fragmenté en streaming. La connexion reste ouverte pendant toute la lecture ; la fermeture tue le processus ffmpeg.

**Codes d'erreur :**

| HTTP | Code | Signification |
|---|---|---|
| 400 | `MISSING_PARAMS` | Paramètre `v` ou `a` manquant |
| 400 | `INVALID_URL` | L'une des URL est malformée ou non http/https |
| 400 | `PRIVATE_URL` | L'une des URL pointe vers une IP privée/loopback (protection SSRF) |
| 429 | `RATE_LIMITED` | Limite de 3 flux simultanés par IP atteinte |

> **Important :** charger toujours l'URL merge-stream via le proxy Next.js `/api/video-stream?url=…` (même origine) plutôt qu'en direct depuis le navigateur. Les requêtes cross-origin directes feront échouer `captureStream()` avec une `SecurityError`.

---

### `GET /api/video-stream` (proxy Next.js)

Proxy HTTP same-origin intégré à l'application Next.js. Il récupère côté serveur n'importe quelle URL `http`/`https` et renvoie la réponse (avec `Content-Type`, `Content-Length`, support des plages d'octets) au navigateur.

**But :** les URL CDN retournées par yt-dlp n'ont pas les en-têtes CORS `crossorigin` requis par `captureStream()`. Les charger via ce proxy same-origin permet à l'élément `<video>` d'être traité comme same-origin, évitant toute erreur CORS.

**Usage :**

```
/api/video-stream?url=<url-encodée>
```

**Supporte :** l'en-tête `Range` est transmis en amont pour permettre la navigation et la reprise dans `<video>`.

**Protection SSRF :** les plages IP privées/loopback sont bloquées en production. `localhost` n'est autorisé qu'en `NODE_ENV=development`.

---

### `POST /stream-orchestrator/sessions/:sessionId/video-push`

Endpoint existant, désormais étendu pour accepter les URL de plateformes. Lorsqu'une URL de plateforme est détectée, le backend la résout avec yt-dlp avant de lancer la boucle ffmpeg. La réponse et le comportement sont identiques à ceux d'une URL directe.

**Exemple avec une URL YouTube :**
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"videoUri":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \
  http://localhost:3000/stream-orchestrator/sessions/<sessionId>/video-push
```

Codes d'erreur supplémentaires (en plus des codes existants) :

| HTTP | Code | Signification |
|---|---|---|
| 422 | `VIDEO_UNAVAILABLE` | Vidéo privée, supprimée ou géo-bloquée |
| 422 | `RESOLVE_FAILED` | Impossible d'extraire une URL lisible |
| 503 | `YTDLP_NOT_INSTALLED` | yt-dlp n'est pas installé |
| 504 | `RESOLVE_TIMEOUT` | yt-dlp a expiré |

---

## Environnement et configuration

| Variable | Défaut (prod) | Description |
|---|---|---|
| `YTDLP_AUTO_UPDATE` | `true` | Exécute `yt-dlp -U` au démarrage du conteneur. Maintient les extracteurs à jour entre les rebuilds. Nécessite un accès Internet sortant. |
| `YTDLP_COOKIES_FILE` | _(vide)_ | Chemin absolu dans le conteneur vers un fichier de cookies YouTube format Netscape. Définir à `/app/youtube-cookies.txt` et monter le fichier pour contourner la détection bot sur IP datacenter. Activé automatiquement par le workflow de déploiement si `/opt/tiklivepro/youtube-cookies.txt` existe sur le serveur. |

La version du binaire `yt-dlp` est fixée à la construction de l'image via l'ARG `YTDLP_VERSION` dans `infra/docker/Dockerfile.stream-orchestrator`. Ce n'est pas une variable d'environnement — modifier l'ARG et reconstruire pour mettre à jour.

`ffmpeg` et `python3` doivent être disponibles dans le `PATH` (déjà inclus dans l'image Docker).

---

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| HTTP 503 `YTDLP_NOT_INSTALLED` | `yt-dlp` absent du `PATH` | Installer yt-dlp et s'assurer qu'il est accessible au processus Node.js |
| HTTP 504 `RESOLVE_TIMEOUT` | Limitation de débit par la plateforme ou réseau lent | Attendre une minute et réessayer ; mettre à jour yt-dlp (`yt-dlp -U`) |
| HTTP 422 `RESOLVE_FAILED` | Binaire yt-dlp obsolète | Exécuter `yt-dlp -U` ou bumper `YTDLP_VERSION` et rebuilder |
| HTTP 422 `RESOLVE_FAILED` (après une période de bon fonctionnement) | Cookies YouTube expirés | Ré-exporter et ré-uploader les cookies — voir [YouTube sur IP datacenter](#youtube-sur-ip-datacenter) |
| HTTP 422 `VIDEO_UNAVAILABLE` | Vidéo privée, supprimée ou géo-bloquée | Vérifier que l'URL est publiquement accessible depuis l'emplacement du serveur |
| `Sign in to confirm you're not a bot` dans les logs | IP datacenter bloquée par la détection bot YouTube | Uploader un fichier de cookies YouTube — voir [YouTube sur IP datacenter](#youtube-sur-ip-datacenter) |
| `env: can't execute 'python3'` dans les logs (code 127) | `python3` absent de l'image conteneur | Rebuilder depuis le dernier `Dockerfile.stream-orchestrator` (python3 ajouté dans l'apk runtime) |
| Avertissement `No supported JavaScript runtime` dans les logs | yt-dlp ne trouve pas deno/node | `--js-runtimes nodejs` est passé par défaut ; vérifier que Node.js est dans le `PATH` du conteneur |
| La vidéo se charge en prévisualisation mais est noire/muette | L'URL résolue a expiré (les liens CDN VOD sont limités dans le temps) | Coller à nouveau l'URL originale et résoudre de nouveau |
| `captureStream()` échoue avec SecurityError | URL chargée directement (pas via le proxy `/api/video-stream`) | Le navigateur doit charger l'URL via `/api/video-stream?url=…` ; c'est géré automatiquement par `VideoSourcePicker` |
| Vidéo noire + pas d'audio après résolution (YouTube HD) | Flux DASH : `audioUrl` présent mais non fusionné | L'endpoint merge-stream nécessite ffmpeg — vérifier `ffmpeg -version` sur le serveur |
| HTTP 429 sur merge-stream | Plus de 3 flux DASH simultanés depuis la même IP | Fermer les autres sessions live ou attendre la fin du flux en cours |
| HTTP 429 après quelques clics | Limite de débit atteinte | Attendre 60 s avant de résoudre à nouveau |
| La résolution fonctionne en dev mais pas en production | yt-dlp obsolète ou python3 absent | Rebuilder après avoir mis à jour `YTDLP_VERSION` ; vérifier que `python3` est dans l'apk runtime |

---

## Documents liés

- [`docs/architecture.md`](./architecture.md) — vue d'ensemble du système et catalogue des services
- [`docs/setup.md`](./setup.md) — prérequis, variables d'environnement et configuration locale
- [`docs/decisions/003-video-proxy-yt-dlp.md`](./decisions/003-video-proxy-yt-dlp.md) — fiche de décision architecturale
