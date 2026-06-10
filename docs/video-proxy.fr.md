> Dernière mise à jour : 2026-06-09 (initial — fonctionnalité proxy vidéo : résolution d'URL via yt-dlp, bouton « Résoudre via le serveur », prise en charge des plateformes dans video-push)

# Proxy Vidéo — Résolution d'URL de plateforme

Ce guide explique comment TikLivePro résout des liens de plateformes de streaming (YouTube, Twitch, Vimeo, Dailymotion) en URL directement lisibles, afin de les utiliser comme source vidéo pendant une session live.

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Fonctionnement](#fonctionnement)
3. [Modèle de sécurité](#modèle-de-sécurité)
4. [Plateformes prises en charge](#plateformes-prises-en-charge)
5. [Prérequis — installer yt-dlp](#prérequis--installer-yt-dlp)
6. [Utilisation via l'interface](#utilisation-via-linterface)
7. [Référence API](#référence-api)
8. [Environnement et configuration](#environnement-et-configuration)
9. [Dépannage](#dépannage)

---

## Vue d'ensemble

L'élément `<video>` du navigateur ne peut charger que des **URL de médias directs** — un `.mp4` brut, un `.webm`, ou un manifeste HLS (`.m3u8`). Coller un lien YouTube ou Twitch dans le champ URL échoue, car ces plateformes servent leur contenu via des lecteurs propriétaires et appliquent des restrictions CORS qui empêchent la capture du flux.

Le Proxy Vidéo résout ce problème grâce à deux mécanismes complémentaires :

| Mécanisme | Où il s'exécute | Ce qu'il fait |
|---|---|---|
| **Résoudre via le serveur** (bouton frontend) | Backend `stream-orchestrator` | Extrait une URL CDN directe via `yt-dlp`, la renvoie au navigateur qui la charge dans `<video>` et l'envoie via WHIP |
| **video-push avec URL de plateforme** (API / mobile) | Backend `stream-orchestrator` | Détecte les URL de plateformes dans `POST /sessions/:id/video-push`, les résout avec `yt-dlp`, puis passe le résultat directement à `ffmpeg` — sans passer par le navigateur |

---

## Fonctionnement

### Chemin navigateur (Résoudre via le serveur)

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
  args : ['--no-playlist', '-f', 'best[...]', '--get-title', '--get-url', '--', url]
        │
        ▼
yt-dlp contacte la plateforme et extrait l'URL CDN directe
(généralement un manifeste HLS pour les live, un mp4 signé pour les VOD)
        │
        ▼
Réponse : { resolvedUrl, title }
        │
        ▼
Le navigateur charge resolvedUrl dans <video crossorigin="anonymous">
        │
        ▼
captureStream() capture la vidéo en tant que MediaStream
        │
        ▼
WebRTC / WHIP → MediaMTX → ffmpeg → TikTok + Facebook
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

## Prérequis — installer yt-dlp

`yt-dlp` doit être installé et disponible dans le `PATH` de la machine qui exécute `stream-orchestrator`. Il n'est **pas** fourni avec l'application.

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

Ajouter dans le Dockerfile de `stream-orchestrator` :

```dockerfile
RUN pip install --no-cache-dir yt-dlp
# ou
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp
```

### Vérifier l'installation

```bash
yt-dlp --version
# Résultat attendu : 2024.XX.XX ou plus récent
```

Si `yt-dlp` est introuvable lors d'une requête de résolution, l'endpoint renvoie HTTP **503 YTDLP_NOT_INSTALLED**.

### Maintenir yt-dlp à jour

Les plateformes mettent fréquemment à jour leurs protocoles internes. Exécuter `yt-dlp -U` chaque semaine en production (ou `pip install --upgrade yt-dlp`). Un binaire yt-dlp obsolète est la cause la plus fréquente des erreurs `RESOLVE_FAILED`.

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

Aucune nouvelle variable d'environnement n'est requise. `yt-dlp` est découvert via `PATH` au démarrage.

Optionnel : pour fixer un chemin yt-dlp spécifique, définir `PATH` dans l'environnement du processus `stream-orchestrator` ou dans l'entrypoint de l'image Docker avant `node`.

---

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| HTTP 503 `YTDLP_NOT_INSTALLED` | `yt-dlp` absent du `PATH` | Installer yt-dlp et s'assurer qu'il est accessible au processus Node.js |
| HTTP 504 `RESOLVE_TIMEOUT` | Limitation de débit par la plateforme ou réseau lent | Attendre une minute et réessayer ; mettre à jour yt-dlp (`yt-dlp -U`) |
| HTTP 422 `RESOLVE_FAILED` | Binaire yt-dlp obsolète | Exécuter `yt-dlp -U` pour mettre à jour vers la dernière version |
| HTTP 422 `VIDEO_UNAVAILABLE` | Vidéo privée, supprimée ou géo-bloquée | Vérifier que l'URL est publiquement accessible depuis l'emplacement du serveur |
| La vidéo se charge en prévisualisation mais est noire/muette | L'URL résolue a expiré (les liens CDN VOD sont limités dans le temps) | Coller à nouveau l'URL originale et résoudre de nouveau |
| `captureStream()` échoue avec SecurityError | L'URL résolue a des en-têtes CORS restrictifs | Utiliser `video-push` (chemin serveur) plutôt que le chemin WHIP navigateur |
| HTTP 429 après quelques clics | Limite de débit atteinte | Attendre 60 s avant de résoudre à nouveau |
| La résolution fonctionne en dev mais pas en production | Image Docker sans yt-dlp | Ajouter `pip install yt-dlp` dans le Dockerfile de stream-orchestrator |

---

## Documents liés

- [`docs/architecture.md`](./architecture.md) — vue d'ensemble du système et catalogue des services
- [`docs/setup.md`](./setup.md) — prérequis, variables d'environnement et configuration locale
- [`docs/decisions/003-video-proxy-yt-dlp.md`](./decisions/003-video-proxy-yt-dlp.md) — fiche de décision architecturale
