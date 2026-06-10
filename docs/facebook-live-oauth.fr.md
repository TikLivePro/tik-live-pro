> Dernière mise à jour : 2026-06-09

# Configuration Facebook OAuth — Live Video (guide complet)

Ce guide couvre la configuration complète de l'application Facebook pour le service `integrations` de TikLivePro, qui gère la diffusion en direct vers des Pages Facebook. Il est distinct du guide d'authentification (`facebook-credentials.md`) qui concerne uniquement la connexion utilisateur.

---

## Pourquoi cette erreur ?

### 1. "Invalid Scopes: publish_video, pages_manage_posts, pages_read_engagement, pages_show_list"
Cette erreur signifie que les permissions demandées n'ont **pas encore été déclarées** dans votre tableau de bord Meta. Facebook exige que chaque permission soit explicitement ajoutée à votre application avant de pouvoir la demander dans le flux OAuth — même en mode développement. Ce n'est pas une question d'App Review : c'est une étape de configuration préalable obligatoire.

### 2. "Pourquoi je ne trouve que `user_birthday`, `user_hometown`, etc., mais pas `pages_show_list` ou d'autres permissions de Page ?"
Si vous accédez à votre tableau de bord Meta Developer et que vous ne voyez que des permissions liées à l'utilisateur ou de type "grand public" (telles que `user_birthday`, `user_friends`, `user_posts`, `user_photos`, `user_videos`, `email`, `openid`, etc.) mais que vous ne trouvez pas les permissions de Page (`pages_show_list`, `pages_manage_posts`, etc.), cela signifie que **vous avez créé une application de type « Consumer » (ou que vous avez sélectionné le cas d'usage par défaut « Authentifier et demander des données aux utilisateurs avec Facebook Login » lors de la création).**

Meta restreint l'accès aux permissions liées aux Pages et aux entreprises uniquement aux applications de type **Business**. Pour corriger cela :
- **Il n'est pas possible de convertir une application Consumer existante en application Business.**
- Vous **devez** créer une nouvelle application à partir de zéro.
- Lors de la création, sélectionnez le cas d'usage **Autres** (en bas de la liste), puis choisissez le type **Business** (voir l'étape [Étape 1](#etape-1--creer-une-application-meta-de-type-business)).

---

## Vue d'ensemble du flux OAuth Live Video

```
1. Utilisateur clique « Connecter Facebook »
        ↓
2. GET /integrations/oauth/facebook/start
   → génère un state CSRF, stocké en base
   → construit l'URL d'autorisation Facebook
        ↓
3. Redirection vers Facebook Consent Screen
   (l'utilisateur autorise les permissions)
        ↓
4. Facebook rappelle → GET /integrations/oauth/facebook/callback?code=…&state=…
   → vérifie le state CSRF
   → échange le code contre un access token (Graph API)
   → récupère le profil utilisateur + la liste de ses Pages
   → stocke le token chiffré en base (AES-256-GCM)
   → publie l'événement NATS integration.account.connected
        ↓
5. Redirection vers /settings?connected=facebook
   → le frontend invalide la query social-accounts
   → la liste des comptes connectés se rafraîchit
```

---

## Étape 1 — Créer une application Meta de type « Business »

> Si vous avez déjà une app existante (utilisée pour la connexion), **ne la réutilisez pas** pour le Live Video. Les cas d'usage sont différents et Facebook les gère séparément. Créez une deuxième app.

1. Allez sur [developers.facebook.com](https://developers.facebook.com) et connectez-vous.
2. Cliquez **Mes apps → Créer une app**.
3. Sélectionnez le cas d'usage **Autres** (en bas de la liste), puis cliquez **Suivant**.
4. Choisissez le type **Business**, puis **Suivant**.
5. Remplissez le formulaire :

   | Champ | Valeur |
   |---|---|
   | **Nom de l'app** | `TikLivePro Live` (ou tout autre nom) |
   | **E-mail de contact** | Votre adresse développeur |
   | **Business account** | Optionnel en développement |

6. Cliquez **Créer une app**. L'app est créée en mode **Développement**.

---

## Étape 2 — Ajouter le produit « Facebook Login »

1. Dans le panneau gauche, cliquez **Ajouter un produit**.
2. Trouvez **Facebook Login** et cliquez **Configurer**.
3. Choisissez **Web** comme plateforme.
4. Renseignez l'URL de votre site :
   - Développement : `http://localhost:3005`
   - Production : `https://tiklivepro.me`
5. Cliquez **Enregistrer** puis **Continuer**.

---

## Étape 3 — Configurer les URI de redirection OAuth

1. Dans le panneau gauche, allez dans **Facebook Login → Paramètres**.
2. Dans le champ **URI de redirection OAuth valides**, ajoutez :

   **Développement local :**
   ```
   http://localhost:3005/integrations/oauth/facebook/callback
   ```

   **Production :**
   ```
   https://tiklivepro.me/integrations/oauth/facebook/callback
   ```

   > ⚠️ L'URI doit correspondre **exactement** à la valeur de `OAUTH_REDIRECT_BASE_URL` dans votre `.env`, suivie de `/integrations/oauth/facebook/callback`. Toute différence (protocole, port, chemin) provoque une erreur `redirect_uri_mismatch`.

3. Désactivez **Connexion OAuth client** si elle est activée (non nécessaire pour un flux serveur).
4. Cliquez **Enregistrer les modifications**.

---

## Étape 4 — Déclarer les permissions requises

C'est l'étape qui corrige l'erreur `Invalid Scopes`. Les permissions doivent être **déclarées dans l'app** avant de pouvoir être demandées dans le flux OAuth.

1. Dans le panneau gauche, allez dans **Révision de l'app → Autorisations et fonctionnalités**.
2. Recherchez et ajoutez chacune des permissions suivantes en cliquant **Ajouter** :

   | Permission | Pourquoi TikLivePro en a besoin | Niveau |
   |---|---|---|
   | `pages_show_list` | Lister les Pages que l'utilisateur administre (pour le sélecteur de Page) | Standard |
   | `pages_manage_posts` | Créer un live video sur une Page | Avancée |
   | `pages_read_engagement` | Lire les commentaires en temps réel pendant la diffusion | Avancée |

   > `publish_video` n'est **pas** nécessaire pour diffuser sur une Page Facebook. Cette permission s'applique au fil d'actualité personnel d'un utilisateur. Pour les Pages (le cas d'usage professionnel), utilisez `pages_manage_posts` avec un **token de Page**.

3. Après avoir ajouté chaque permission, son statut passe à **En attente de révision** (en production) ou **Disponible pour les tests** (en mode développement).

---

## Étape 5 — Ajouter des utilisateurs de test

En mode **Développement**, seuls les comptes ayant un rôle sur l'app peuvent terminer le flux OAuth.

1. Dans le panneau gauche, allez dans **Rôles → Utilisateurs de test**.
2. Cliquez **Ajouter des utilisateurs de test**.
3. Créez un utilisateur de test **ou** ajoutez un compte Facebook existant par son nom d'utilisateur.
4. Cet utilisateur peut maintenant :
   - Connecter son compte Facebook via TikLivePro
   - Autoriser les permissions en mode développement
   - Diffuser en direct vers ses Pages (si des Pages sont associées à ce compte test)

> Pour ajouter votre propre compte Facebook comme administrateur (accès complet) : **Rôles → Rôles → Ajouter des administrateurs**.

---

## Étape 6 — Récupérer les credentials

1. Dans le panneau gauche, allez dans **Paramètres de l'app → Général**.
2. Copiez les deux valeurs en haut de la page :

   | Libellé dans le portail | Variable d'environnement |
   |---|---|
   | **Identifiant de l'app** | `FACEBOOK_APP_ID` |
   | **Clé secrète de l'app** | `FACEBOOK_APP_SECRET` |

   La clé secrète est masquée par défaut — cliquez **Afficher** et ressaisissez votre mot de passe Facebook pour la révéler.

---

## Étape 7 — Configurer les variables d'environnement

### Service integrations (`services/integrations/.env`)

```env
# Credentials Facebook Live Video
FACEBOOK_APP_ID=123456789012345
FACEBOOK_APP_SECRET=abcdef1234567890abcdef1234567890

# URL de base du service integrations (pour le callback OAuth)
OAUTH_REDIRECT_BASE_URL=http://localhost:3005

# URL du frontend (redirection après le callback OAuth)
FRONTEND_URL=http://localhost:3010
```

> `OAUTH_REDIRECT_BASE_URL` doit pointer vers le service `integrations` (port 3005 en local), **pas** vers le frontend. C'est l'URL que Facebook appelle pour le callback.

### Vérification rapide

```bash
# Tester que le endpoint /start répond bien avec une authUrl Facebook
curl -s -H "Authorization: Bearer <votre_jwt>" \
  http://localhost:3005/integrations/oauth/facebook/start | jq .

# Réponse attendue :
# {
#   "data": {
#     "authUrl": "https://www.facebook.com/v21.0/dialog/oauth?client_id=..."
#   }
# }
```

---

## Étape 8 — Tester le flux complet en développement

### Prérequis

- Le service `integrations` est démarré (`pnpm dev` ou `pnpm --filter integrations dev`)
- L'infrastructure locale est active (`pnpm docker:dev`)
- Le compte Facebook testé a un rôle sur l'app Meta

### Procédure

1. Connectez-vous à TikLivePro avec votre compte.
2. Allez dans **Paramètres → Comptes connectés**.
3. Cliquez **Connecter Facebook**.
4. Vous êtes redirigé vers la page de consentement Facebook.
5. Acceptez les permissions demandées.
6. Facebook vous renvoie sur `http://localhost:3005/integrations/oauth/facebook/callback?code=…&state=…`.
7. Le service échange le code, chiffre le token, sauvegarde le compte en base.
8. Vous êtes redirigé sur `http://localhost:3010/settings?connected=facebook`.
9. Un toast « Facebook account connected » apparaît et la liste des comptes se rafraîchit.

---

## Passage en production (App Review)

Les permissions `pages_manage_posts` et `pages_read_engagement` sont des **permissions avancées** qui nécessitent une révision par Meta avant d'être utilisables par tous vos utilisateurs.

### Ce que Meta évalue

- Votre app explique clairement pourquoi elle a besoin de chaque permission
- Vous fournissez une vidéo de démonstration du flux complet
- Votre politique de confidentialité est accessible publiquement
- Votre domaine est vérifié dans le Business Manager Meta

### Étapes de soumission

1. Dans **Révision de l'app → Autorisations et fonctionnalités**, cliquez **Demander un accès avancé** pour `pages_manage_posts` et `pages_read_engagement`.
2. Pour chaque permission, remplissez :
   - **Description de l'utilisation** : expliquez précisément comment TikLivePro utilise cette permission
   - **Capture d'écran ou vidéo** : montrez le flux OAuth et la création du live
3. Renseignez votre **Politique de confidentialité** et votre **URL des conditions d'utilisation** dans **Paramètres de l'app → Général**.
4. Vérifiez votre domaine dans **Business Settings → Brand Safety → Domains**.
5. Soumettez. Meta répond généralement en 5–10 jours ouvrables.

### Basculer en mode Live

1. Dans la barre supérieure du portail, basculez le mode **Développement → Live**.
2. ⚠️ En mode Live, **tous les utilisateurs Facebook** peuvent utiliser l'app (pas seulement les testeurs). N'activez le mode Live qu'après que Meta a approuvé vos permissions avancées.

---

## Permissions — récapitulatif

| Permission | Usage dans TikLivePro | Flux OAuth | App Review requis |
|---|---|---|---|
| `pages_show_list` | Lister les Pages de l'utilisateur pour le sélecteur | Standard | Non |
| `pages_manage_posts` | Créer un live video via `POST /{page_id}/live_videos` | Avancée | Oui (production) |
| `pages_read_engagement` | Lire les commentaires via `GET /{live_video_id}/comments` | Avancée | Oui (production) |
| `publish_video` | ~~Diffuser sur le profil personnel~~ | — | Non utilisé |

> TikLivePro diffuse **exclusivement vers des Pages** (usage professionnel). `publish_video` n'est pas demandé car il cible les fils personnels.

---

## Token de Page vs token d'utilisateur

La Graph API Facebook distingue deux types de tokens pour les opérations sur les Pages :

| Token | Portée | Quand l'utiliser |
|---|---|---|
| **User access token** | Opérations sur le compte personnel de l'utilisateur | Pas adapté aux Pages |
| **Page access token** | Opérations sur une Page spécifique | ✅ Création de live videos, lecture de commentaires |

### Obtenir un Page access token

Après avoir récupéré le user access token lors du callback OAuth :

```
GET /me/accounts?access_token={user_token}
```

Réponse :
```json
{
  "data": [
    {
      "id": "123456789",
      "name": "Ma Page",
      "access_token": "<page_access_token>",
      "category": "Brand",
      "tasks": ["ADVERTISE", "ANALYZE", "CREATE_CONTENT", "MODERATE"]
    }
  ]
}
```

Le `page_access_token` est ensuite utilisé pour :
```
POST /{page_id}/live_videos
Authorization: {page_access_token}
```

> **Note architecture** : l'implémentation actuelle de `FacebookAdapter.createLiveStream` utilise le user token et l'ID `/me`. Pour les Pages, il faudra étendre l'adaptateur pour stocker et utiliser le Page access token. Voir la section [Évolutions futures](#évolutions-futures).

---

## Troubleshooting

| Erreur | Cause | Solution |
|---|---|---|
| `Invalid Scopes: pages_manage_posts, …` | Permissions non déclarées dans le portail Meta | Ajouter chaque permission dans **Révision de l'app → Autorisations et fonctionnalités** |
| `redirect_uri_mismatch` | L'URI de callback ne correspond pas à ce qui est enregistré | Vérifier que `OAUTH_REDIRECT_BASE_URL` + `/integrations/oauth/facebook/callback` est bien dans **Facebook Login → Paramètres → URI valides** |
| `App Not Set Up` | L'app est en mode Développement et l'utilisateur n'a pas de rôle | Ajouter l'utilisateur dans **Rôles → Utilisateurs de test** |
| `(#200) The user hasn't authorized the application` | Token de Page absent ou expiré (60 jours) | Redemander l'autorisation OAuth |
| `(#10) Application does not have permission for this action` | Permission non approuvée par Meta en mode Live | Soumettre la permission pour App Review |
| `Invalid OAuth access token` | Token expiré ou révoqué | Le token Facebook (sans refresh) expire après 60 jours — l'utilisateur doit se reconnecter |
| `state mismatch` (côté serveur) | State CSRF expiré (> 15 min) ou déjà utilisé | Recommencer le flux depuis le début |
| Toast d'erreur mais pas de redirection | Exception dans le callback — voir les logs du service integrations | `pnpm --filter integrations dev` et observer les logs JSON |

---

## Évolutions futures

- **Sélecteur de Page** : après le callback, proposer à l'utilisateur de choisir quelle Page utiliser pour la diffusion (via `GET /me/accounts`), puis stocker le Page access token séparément.
- **Refresh automatique** : les tokens Facebook expirent après 60 jours. Implémenter `GET /oauth/access_token?grant_type=fb_exchange_token` pour échanger un short-lived token contre un long-lived token (valable 60 jours) puis rappeler l'utilisateur avant expiration.
- **Webhook commentaires** : remplacer le polling (`FacebookAdapter.pollComments`) par un webhook sur `live_videos` → champ `comments`, plus efficace à grande échelle.

---

## Références

- [Permissions Facebook Login](https://developers.facebook.com/docs/facebook-login/permissions)
- [Live Video API](https://developers.facebook.com/docs/live-video-api)
- [Page Access Tokens](https://developers.facebook.com/docs/pages/access-tokens)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/) — pour tester les appels API manuellement
- [App Review](https://developers.facebook.com/docs/app-review)
