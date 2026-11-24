# Kimai ↔ Trello (Chrome extension)

Extension Chrome Manifest V3 pour démarrer / arrêter un timer Kimai depuis une carte Trello.

- **Description Kimai** = titre de la carte + URL de la carte (éditable)
- **Projet** et **activité** obligatoires (derniers choix mémorisés)
- Si un timer tourne déjà → **confirmation** puis arrêt puis démarrage du nouveau

## Prérequis

Créez un fichier `.env` local (non versionné) à partir de `.env.example` :

```env
API_KEY=your_api_token
BASE_URL=https://your-kimai.example/api
USER_NAME=optional.login
```

Le token API se génère dans Kimai : profil utilisateur → API.

## Installation (mode développeur)

1. Ouvrir `chrome://extensions`
2. Activer **Mode développeur**
3. **Charger l’extension non empaquetée** → sélectionner le dossier `extension`
4. Ouvrir **Options** de l’extension et coller :
   - `BASE_URL` → URL de votre API Kimai (HTTPS recommandé), ex. `https://your-kimai.example/api`
   - `API_KEY` → token API Kimai
   - `USER_NAME` → optionnel (fallback legacy)
5. Cliquer **Tester la connexion**

## Utilisation

1. Ouvrir un board Trello
2. Sur chaque carte, un bouton vert **K** apparaît juste devant les avatars assignés
3. Cliquer → choisir projet + activité → éditer la description → **Démarrer**
4. **Arrêter** / **Enregistrer** depuis le panneau, ou via l’icône de l’extension (popup)

## Auth API

```http
Authorization: Bearer <API_KEY>
```

Si `USER_NAME` est renseigné, les headers legacy `X-AUTH-USER` / `X-AUTH-TOKEN` sont aussi envoyés.

## Sécurité

- Ne committez **jamais** `.env` (déjà dans `.gitignore`)
- Ne publiez pas de token API ni d’URL privée dans le code
- En cas d’exposition accidentelle : révoquez le token immédiatement dans Kimai

## Fichiers

- `manifest.json` — MV3
- `background.js` — proxy API
- `lib/kimai-api.js` / `lib/storage.js`
- `content/` — bouton + panneau Trello
- `options/` — configuration
- `popup/` — même formulaire start/stop
