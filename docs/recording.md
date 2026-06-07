# TikLivePro — Enregistrement vidéo

> **Dernière mise à jour :** 2026-06-06 (S3 key now includes live title slug for human-readable paths)

Ce guide explique comment enregistrer les streams en live et stocker les vidéos dans le cloud.

## Architecture

```
Broadcaster (WHIP/RTMP)
        │
        ▼
    MediaMTX ──── record ──► /recordings/live/<ingestKey>/<timestamp>.mp4
        │
        ▼                          ▼
HLS / WebRTC viewers     RecordingUploader (stream-orchestrator)
                                   │  slugify(session.title)
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
          DigitalOcean Spaces           Cloudflare R2
          recordings/<title-slug>/     recordings/<title-slug>/
          <ingestKey>/<timestamp>.mp4  <ingestKey>/<timestamp>.mp4
```

**Principe** :
1. MediaMTX enregistre chaque path actif dans un volume Docker partagé (fichier `.fmp4`)
2. Le `RecordingUploader` dans `stream-orchestrator` surveille ce dossier
3. Quand MediaMTX finalise un fichier (renommage `.fmp4.part` → `.fmp4`), l'uploader le pousse vers le stockage cloud, puis supprime le fichier local

---

## 1. Contrôle d'enregistrement — API MediaMTX

L'enregistrement est activé **par session** via l'API REST de MediaMTX, et non via un `record: yes` global dans le fichier de config. Cela permet de ne stocker que les streams pour lesquels l'utilisateur a déclenché l'enregistrement.

### Comment ça marche

`stream-orchestrator` appelle `PATCH /v3/config/paths/patch/{urlEncodedPath}` pour activer ou désactiver l'enregistrement sur un path MediaMTX :

```
# Activer
PATCH http://mediamtx:9997/v3/config/paths/patch/live%2F{ingestKey}
{ "record": true }

# Désactiver
PATCH http://mediamtx:9997/v3/config/paths/patch/live%2F{ingestKey}
{ "record": false }
```

Le chemin `live/{ingestKey}` contient un `/` qui doit être encodé en `%2F` dans l'URL. Si le path config n'existe pas encore (404), l'orchestrateur tombe en fallback sur `POST /v3/config/paths/add/live%2F{ingestKey}`.

### Paramètres de config MediaMTX requis (`infra/mediamtx/mediamtx.prod.yml`)

Même si `record` n'est pas activé globalement, MediaMTX a besoin de connaître le format et le dossier cible. Ces valeurs sont dans la config globale :

```yaml
# ── Record ───────────────────────────────────────────────────────────────────
recordPath: /recordings/%path/%Y-%m-%d_%H-%M-%S-%f
recordFormat: fmp4
recordSegmentDuration: 1h
recordDeleteAfter: 0
```

| Paramètre | Valeur | Pourquoi |
|-----------|--------|----------|
| `recordPath` | `/recordings/%path/%Y-…-%f` | `%path` = ingestKey, `%f` = sous-millisecondes (évite les collisions) |
| `recordFormat` | `fmp4` | Fragmented MP4 — format le plus compatible pour la lecture web et les CDN |
| `recordSegmentDuration` | `1h` | Coupe en segments d'1h max (évite les fichiers géants) |
| `recordDeleteAfter` | `0` | Désactive la suppression auto — l'uploader supprime après upload réussi |

### Routes HTTP exposées par stream-orchestrator

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/sessions/:sessionId/recording/start` | Active `record: true` via config API MediaMTX |
| `POST` | `/sessions/:sessionId/recording/stop` | Active `record: false` via config API MediaMTX |
| `GET` | `/recordings` | Liste les enregistrements actifs (proxy `GET /v3/recordings/list` de MediaMTX, enrichi avec les données de session) |
| `GET` | `/sessions/:sessionId/recordings` | Liste les enregistrements terminés pour une session (depuis la DB) |
| `GET` | `/recordings/:recordingId/download` | Proxy S3 avec `Content-Disposition: attachment` pour le téléchargement |

---

## 2. Volume Docker partagé

Le volume `mediamtx_recordings` est partagé entre `mediamtx` (écrit) et `stream-orchestrator` (lit + upload).

Dans `docker-compose.prod.managed.yml` :

```yaml
services:
  mediamtx:
    volumes:
      - ./infra/mediamtx/mediamtx.prod.yml:/mediamtx.yml:ro
      - mediamtx_recordings:/recordings          # ← ajouter

  stream-orchestrator:
    volumes:
      - mediamtx_recordings:/recordings          # ← ajouter (lecture + suppression après upload)

volumes:
  mediamtx_recordings:                           # ← ajouter en bas
```

> **Taille estimée :** un stream 720p30 encodé à ~2 Mbps = ~900 MB/heure. Le Droplet 4 GB a 80 GB SSD — soit ~88 heures de buffer avant saturation. L'uploader doit supprimer les fichiers locaux après upload pour éviter le remplissage disque.

---

## 3. Variables d'environnement

### Option A — DigitalOcean Spaces

```env
RECORDING_STORAGE_PROVIDER=do-spaces
RECORDING_STORAGE_BUCKET=tiklivepro-recordings
RECORDING_STORAGE_REGION=fra1
RECORDING_STORAGE_ENDPOINT=https://fra1.digitaloceanspaces.com
RECORDING_STORAGE_ACCESS_KEY_ID=<DO Spaces key>
RECORDING_STORAGE_SECRET_ACCESS_KEY=<DO Spaces secret>
RECORDING_STORAGE_CDN_URL=https://tiklivepro-recordings.fra1.cdn.digitaloceanspaces.com
```

### Option B — Cloudflare R2

```env
RECORDING_STORAGE_PROVIDER=r2
RECORDING_STORAGE_BUCKET=tiklivepro-recordings
RECORDING_STORAGE_REGION=auto
RECORDING_STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
RECORDING_STORAGE_ACCESS_KEY_ID=<R2 Access Key ID>
RECORDING_STORAGE_SECRET_ACCESS_KEY=<R2 Secret Access Key>
RECORDING_STORAGE_CDN_URL=https://recordings.tiklivepro.me  # domaine custom R2
```

---

## 4. Infrastructure — RecordingUploader et table recordings

### Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `services/stream-orchestrator/src/infrastructure/storage/recording-uploader.ts` | Surveille le dossier, upload vers S3, persiste en DB |
| `services/stream-orchestrator/src/infrastructure/db/recording.repo.impl.ts` | `DrizzleRecordingRepository` — `save`, `findBySessionId`, `findById` |
| `services/stream-orchestrator/src/infrastructure/db/schema.ts` | Table `recordings` |
| `services/stream-orchestrator/src/infrastructure/db/migrations/0001_recordings_table.sql` | Migration SQL |

### Table `recordings`

```sql
CREATE TABLE "recordings" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id"  uuid NOT NULL REFERENCES "stream_sessions"("session_id") ON DELETE cascade,
  "ingest_key"  text NOT NULL,
  "file_key"    text NOT NULL,      -- clé S3 (ex: recordings/mon-premier-live/abc123/2026-06-03_10-00-00.mp4)
  "public_url"  text NOT NULL,      -- URL CDN ou endpoint S3
  "file_name"   text NOT NULL,      -- basename du fichier
  "size_bytes"  bigint DEFAULT 0 NOT NULL,
  "created_at"  timestamp with time zone DEFAULT now() NOT NULL
);
```

### Flux RecordingUploader

1. Au démarrage + scan périodique toutes les **15 s** :
   - **Fichiers `.mp4`** (segment finalisé par MediaMTX) :
     1. Lookup session par `ingestKey` → slugification du titre → `slugify(session.title)` (ex. `mon-premier-live`)
     2. Construction de la clé S3 : `recordings/{title-slug}/{ingestKey}/{timestamp}.mp4`
     3. Upload S3 multipart (~8 MB/part)
     4. `IRecordingRepository.save()` → insère une ligne dans `recordings`
     5. `unlink` du fichier local
   - **Fichiers `.mp4.part`** (segment en cours ou orphelin) :
     - Si le `mtime` du fichier est **< 5 minutes** → fichier actif, ignoré
     - Si le `mtime` est **≥ 5 minutes** → fichier orphelin : MediaMTX n'a pas reçu de déconnexion propre (WHIP DELETE manquant, crash réseau, SIGKILL). L'uploader **renomme** le `.mp4.part` en `.mp4` ; le prochain scan l'uploade normalement.

### Pourquoi les `.mp4.part` peuvent rester orphelins

MediaMTX applique les changements de config de path (ex. `PATCH record: false`) **uniquement à la prochaine connexion du publisher**, pas au segment en cours. Le segment actif n'est finalisé que quand le publisher se déconnecte proprement (WHIP DELETE) ou que la durée max du segment est atteinte. Si la connexion WebRTC est coupée sans WHIP DELETE (onglet fermé brutalement, panne réseau, crash du processus), le `.mp4.part` reste sur disque indéfiniment — la logique de rescue ci-dessus s'en occupe.

### Dépendances à installer (déjà présentes)

```bash
pnpm --filter @tik-live-pro/stream-orchestrator add @aws-sdk/client-s3 @aws-sdk/lib-storage
```

---

## 5. Obtenir les credentials

### DigitalOcean Spaces

1. **Créer le bucket** : DigitalOcean console > **Spaces Object Storage** > **Create a Space**
   - Région : `fra1` (Frankfurt, la plus proche de votre Droplet)
   - Nom : `tiklivepro-recordings`
   - Accès : **Restricted** (les fichiers seront `public-read` individuellement à l'upload)
2. **Créer les clés API Spaces** : DigitalOcean > **API > Spaces Keys** > **Generate New Key**
3. Optionnel — **activer le CDN** : onglet **CDN** du bucket → `Enable CDN` → copiez l'URL CDN dans `RECORDING_STORAGE_CDN_URL`

> **Coût estimé :** $5/mois pour 250 GB de stockage + $0.01/GB de transfert sortant. Couvert par votre crédit $200 pendant ~8 mois.

### Cloudflare R2

1. **Créer le bucket** : Cloudflare Dashboard > **R2** > **Create bucket**
   - Nom : `tiklivepro-recordings`
2. **Créer les clés API** : R2 > **Manage R2 API Tokens** > **Create API Token** (permission : `Object Read & Write`)
3. **Domaine custom** (optionnel) — **contrainte importante** :

   > Cloudflare R2 n'accepte un domaine custom que si ce domaine est **géré par Cloudflare comme nameserver autoritaire**. Si votre DNS est chez Namecheap, vous obtiendrez l'erreur : *"That domain was not found on your account."* Deux chemins pour contourner :

   **Chemin A — Migrer le DNS vers Cloudflare (recommandé)**

   Cloudflare DNS est gratuit, plus rapide que Namecheap, et débloque les custom domains R2 + les features Cloudflare (proxy, WAF, etc.).

   1. Cloudflare Dashboard > **Add a Site** → entrez `tiklivepro.me` → choisissez le plan **Free**
   2. Cloudflare importe automatiquement tous vos enregistrements DNS existants (A, CNAME…) — vérifiez qu'ils sont tous présents
   3. Cloudflare vous donne deux nameservers (ex : `aria.ns.cloudflare.com`, `bob.ns.cloudflare.com`)
   4. **Namecheap > Domain List > Manage > Nameservers** → sélectionnez **Custom DNS** → remplacez les NS Namecheap par les deux NS Cloudflare
   5. Attendez la propagation (quelques minutes à 24 h) — Cloudflare vous notifie par email quand c'est actif
   6. Ensuite dans R2 : votre bucket > **Settings** > **Custom Domains** > **Connect Domain** → `recordings.tiklivepro.me` — Cloudflare crée l'enregistrement DNS automatiquement

   > **Vos autres enregistrements (`api`, `hls`, `webrtc`, `@`) continuent de fonctionner** — ils sont désormais gérés dans Cloudflare DNS au lieu de Namecheap.

   **Chemin B — URL publique R2 sans domaine custom**

   Si vous ne souhaitez pas migrer le DNS, activez l'accès public direct sur le bucket et utilisez l'URL `r2.dev` fournie par Cloudflare.

   1. R2 > votre bucket > **Settings** > **Public Access** > **Allow Access** → activez
   2. Cloudflare affiche une URL de type `https://pub-<hash>.r2.dev`
   3. Utilisez cette URL comme valeur de `RECORDING_STORAGE_CDN_URL`

   > L'URL `pub-<hash>.r2.dev` est permanente et fonctionnelle sans aucune configuration DNS supplémentaire. L'inconvénient est qu'elle est moins lisible qu'un domaine custom.

4. L'endpoint S3 (pour le SDK, pas pour les utilisateurs) est : `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

> **Coût estimé :** 10 GB/mois gratuit, puis $0.015/GB. **Aucun frais d'egress** même si vos utilisateurs regardent les replays depuis le monde entier.

---

## 6. Comparaison des deux options

| Critère | DigitalOcean Spaces | Cloudflare R2 |
|---------|--------------------|-----------------------|
| Coût stockage | $5/mois (250 GB) | Gratuit (10 GB), puis $0.015/GB |
| Frais d'egress | $0.01/GB sortant | **Aucun** |
| CDN intégré | Oui (en option) | Oui (via Workers / domaine custom) |
| Latence upload | Faible (même DC que le Droplet) | Légèrement plus élevée |
| Configuration | Identique à AWS S3 | Identique à AWS S3 |
| Démarrage | Immédiat (crédit $200) | Immédiat (compte gratuit) |

**Recommandation** : commencez avec **DigitalOcean Spaces** — tout est dans votre écosystème existant et couvert par le crédit $200. Si les coûts d'egress deviennent importants (beaucoup de replays), migrez vers **Cloudflare R2** en changeant seulement 3 variables d'environnement.

---

## 7. Accès aux enregistrements

Les enregistrements sont stockés sous la clé `recordings/<title-slug>/<ingestKey>/<date>.mp4`, où `<title-slug>` est le titre du live converti en minuscules avec les espaces remplacés par des tirets (ex : `"Mon Premier Live"` → `mon-premier-live`).

URL d'accès directe (stockage) :
- DO Spaces CDN : `https://tiklivepro-recordings.fra1.cdn.digitaloceanspaces.com/recordings/<title-slug>/<ingestKey>/<date>.mp4`
- R2 domaine custom : `https://recordings.tiklivepro.me/recordings/<title-slug>/<ingestKey>/<date>.mp4`

### API

Les routes sont exposées par `stream-orchestrator` et proxifiées par l'API Gateway sous `/stream-orchestrator/*`.

**Enregistrements actifs** (segments en cours, depuis MediaMTX) :
```
GET /stream-orchestrator/recordings
Authorization: Bearer <token>
→ { items: [{ name: "live/abc123", sessionId, hlsUrl, segments: [{ start }] }] }
```

**Enregistrements terminés d'une session** (depuis la DB) :
```
GET /stream-orchestrator/sessions/:sessionId/recordings
Authorization: Bearer <token>
→ { items: [{ id, sessionId, ingestKey, fileKey, publicUrl, fileName, sizeBytes, createdAt }] }
```

**Télécharger un enregistrement** :
```
GET /stream-orchestrator/recordings/:recordingId/download
Authorization: Bearer <token>
→ stream binaire avec Content-Disposition: attachment; filename="<fileName>"
```

L'endpoint de téléchargement est un proxy S3 — il lit le fichier depuis le stockage cloud via le SDK AWS et le retransmet au client. L'URL publique (`publicUrl`) peut aussi être utilisée directement si le bucket est accessible en lecture publique.
