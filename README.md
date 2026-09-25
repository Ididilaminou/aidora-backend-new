
# 🩸 Aidora — Backend

API REST de la plateforme **Aidora** : gestion du don de sang, des banques de sang et des hôpitaux au **Cameroun**.

![Version](https://img.shields.io/badge/version-1.0.0-red)
![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![Express](https://img.shields.io/badge/Express-5-black)
![MySQL](https://img.shields.io/badge/MySQL-8-blue)
![License](https://img.shields.io/badge/license-Academic-green)

---

## 📖 À propos

Le backend Aidora expose une **API REST sécurisée** qui alimente :

- 🩸 Les **donneurs** (inscription, profil, RDV, dons)
- 🏥 Les **banques de sang** (stocks, poches, dons)
- 🏨 Les **hôpitaux** (demandes, réceptions)
- 👑 Les **administrateurs** (gestion globale)

---

## 🚀 Stack technique

| Catégorie | Technologie |
|---|---|
| **Runtime** | Node.js 20+ |
| **Framework** | Express 5 |
| **Base de données** | MySQL 8 (TiDB Cloud en prod) |
| **Authentification** | JWT (jsonwebtoken) |
| **Hashage** | Bcrypt (bcryptjs) |
| **Validation** | express-validator |
| **Email** | Nodemailer + Brevo |
| **SMS** | Mode mock (Orange/Twilio prêt) |
| **Sécurité** | Helmet, CORS, Rate Limiting |
| **Logs** | Winston |
| **Config** | dotenv |

---

## 📋 Prérequis

- **Node.js** ≥ 20
- **npm** ≥ 10
- **MySQL** 8 (local) **ou** compte TiDB Cloud (production)

---

## ⚙️ Installation

```bash
# 1. Cloner le repo
git clone https://github.com/Ididilaminou/aidora-backend-new.git
cd aidora-backend-new

# 2. Installer les dépendances
npm install

# 3. Créer le fichier d'environnement
cp .env.example .env
```

### Fichier `.env`

```env
# ============================================
# SERVEUR
# ============================================
NODE_ENV=development
PORT=4000
CORS_ORIGINS=http://localhost:5173

# ============================================
# BASE DE DONNÉES — LOCAL (développement)
# ============================================
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=aidora

# ============================================
# BASE DE DONNÉES — TiDB CLOUD (production)
# ============================================
# DB_HOST=gateway01.xxx.prod.aws.tidbcloud.com
# DB_PORT=4000
# DB_USER=xxxxx.root
# DB_PASSWORD=ton_mot_de_passe
# DB_NAME=aidora
# TIDB_ENABLE_SSL=true
# TIDB_CA_PEM=-----BEGIN CERTIFICATE-----...

# ============================================
# JWT
# ============================================
JWT_SECRET=change_moi_par_une_longue_chaine_aleatoire
JWT_EXPIRES_IN=7d

# ============================================
# EMAIL — BREVO
# ============================================
EMAIL_PROVIDER=brevo
EMAIL_ACTIF=true
EMAIL_FROM_NAME=Aidora
EMAIL_FROM_EMAIL=noreply@aidora.cm
BREVO_API_KEY=xkeysib-xxxxx

# ============================================
# SMS — MODE MOCK (développement)
# ============================================
SMS_PROVIDER=mock
SMS_ACTIF=true
SMS_SENDER=AIDORA

# ============================================
# FRONTEND
# ============================================
FRONTEND_URL=http://localhost:5173
```

### Créer la base de données

```bash
mysql -u root -p < schema.sql
```

Puis **peupler** avec les données de test :

```bash
node src/scripts/seed.js
```

### Lancer le serveur

```bash
# Développement (avec nodemon)
npm run dev

# Production
npm start
```

➡️ API disponible sur **http://localhost:4000/api**

---

## 📜 Scripts npm

| Commande | Description |
|---|---|
| `npm run dev` | Serveur de développement (nodemon) |
| `npm start` | Serveur de production |
| `npm run seed` | Peupler la base avec des données de test |
| `npm run sync` | Synchroniser local → TiDB Cloud |
| `npm test` | Tests (à venir) |

---

## 📁 Structure du projet

```
src/
├── config/                    # Configuration
│   ├── db.js                  # Pool MySQL + transactions
│   └── logger.js              # Winston logger
├── middlewares/               # Middlewares Express
│   ├── auth.middleware.js     # authenticate, authorize
│   ├── errorHandler.js        # Gestion centralisée des erreurs
│   ├── rateLimiter.js         # Rate limiting (login, API)
│   └── validate.js            # Validation express-validator
├── modules/                   # Modules métier (feature-based)
│   ├── auth/                  # Authentification
│   │   ├── auth.controller.js
│   │   ├── auth.repository.js
│   │   ├── auth.routes.js
│   │   └── auth.service.js
│   ├── donneurs/              # Gestion des donneurs
│   ├── personnels/            # Gestion du personnel
│   ├── etablissements/        # Établissements (banques + hôpitaux)
│   ├── dons/                  # Enregistrement des dons
│   ├── poches/                # Poches de sang
│   ├── stock/                 # Stocks par établissement
│   ├── demandes/              # Demandes inter-établissements
│   ├── rdv/                   # Rendez-vous
│   ├── notifications/         # Notifications
│   ├── statistiques/          # Statistiques
│   ├── rapports/              # Rapports
│   ├── journal-audit/         # Journal d'audit
│   ├── rattachements/         # Rattachements donneur ↔ établissement
│   ├── sollicitations/        # Sollicitations donneurs
│   ├── evaluations-ia/        # Pré-évaluation IA
│   └── registres/             # Registres papier
├── services/                  # Services externes
│   ├── emailService.js        # Envoi email (Brevo, SMTP, mock)
│   └── smsService.js          # Envoi SMS (Orange, mock)
├── scripts/                   # Scripts utilitaires
│   ├── seed.js                # Données de test
│   ├── sync-vers-tidb.js      # Sync local → TiDB
│   └── ...
├── utils/                     # Utilitaires
│   ├── AppError.js            # Classe d'erreur opérationnelle
│   ├── asyncHandler.js        # Wrapper try/catch
│   ├── generateCode.js        # Génération de codes d'activation
│   └── response.js            # Format de réponse standard
├── app.js                     # Configuration Express
└── server.js                  # Point d'entrée
```

---

## 🔐 Authentification

### Format du token JWT

```json
{
  "id": 1,
  "role": "ADMINISTRATEUR",
  "iat": 1790327434,
  "exp": 1790932234
}
```

### Utilisation

```http
Authorization: Bearer <token>
```

### Rôles disponibles

| Rôle | Code |
|---|---|
| Administrateur | `ADMINISTRATEUR` |
| Personnel de banque | `PERSONNEL_BANQUE` |
| Personnel d'hôpital | `PERSONNEL_HOPITAL` |
| Donneur | `DONNEUR` |

---

## 📡 Endpoints principaux

### 🔓 Routes publiques

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Connexion |
| `POST` | `/api/auth/inscription-donneur` | Inscription donneur |
| `POST` | `/api/auth/activation` | Activation par code |
| `POST` | `/api/auth/renvoyer-activation` | Renvoyer le code |
| `POST` | `/api/auth/mot-de-passe-oublie` | Demander réinitialisation |
| `POST` | `/api/auth/reinitialiser-mot-de-passe` | Réinitialiser |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/statistiques/publiques` | Stats publiques (landing) |

### 🔒 Routes protégées

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/donneurs/moi` | Donneur |
| `PUT` | `/api/donneurs/moi` | Donneur |
| `PATCH` | `/api/donneurs/moi/disponibilite` | Donneur |
| `GET` | `/api/etablissements` | Tous |
| `POST` | `/api/etablissements` | Public (inscription) |
| `PUT` | `/api/etablissements/:id` | Admin |
| `GET` | `/api/poches` | Banque/Hôpital |
| `GET` | `/api/stocks` | Banque |
| `GET` | `/api/demandes` | Banque/Hôpital |
| `POST` | `/api/demandes` | Hôpital |
| `GET` | `/api/notifications` | Tous |
| `GET` | `/api/personnels` | Admin |
| `POST` | `/api/personnels` | Admin |
| `GET` | `/api/statistiques/globales` | Admin |
| `GET` | `/api/statistiques/publiques` | Public |

---

## 🗄️ Base de données

### Tables principales (20 tables)

```
utilisateurs          → Table centrale (héritage)
├── donneurs          → Profil donneur
├── personnels        → Profil personnel
└── administrateurs   → Profil admin

etablissements        → Banques + Hôpitaux
├── stocks            → Stocks par groupe sanguin
├── poches            → Poches de sang
├── demandes_sang     → Demandes inter-établissements
└── rattachements_donneurs → Donneur ↔ Établissement

dons                  → Dons enregistrés
rdv                   → Rendez-vous
notifications         → Notifications utilisateur
journal_audit         → Journal d'audit
activations_compte    → Codes d'activation
traces_email          → Traces d'envoi email
```

### Schéma complet

Voir `schema.sql` à la racine du projet.

---

## 📧 Envoi d'emails (Brevo)

### Configuration

```env
EMAIL_PROVIDER=brevo
EMAIL_ACTIF=true
EMAIL_FROM_NAME=Aidora
EMAIL_FROM_EMAIL=noreply@aidora.cm
BREVO_API_KEY=xkeysib-xxxxx
```

### Templates disponibles

- `envoyerCodeActivationDonneur` — Code d'activation
- `envoyerInvitationRegistre` — Invitation (registre papier)
- `envoyerConfirmationRdv` — Confirmation RDV
- `envoyerBienvenueDonneur` — Bienvenue après activation
- `envoyerCodeReinitialisation` — Réinitialisation MDP
- `envoyerIdentifiantsPersonnel` — Identifiants personnel

### Modes supportés

- `mock` → Log dans la console (dev)
- `brevo` → API HTTP Brevo (recommandé prod)
- `gmail` / `smtp` / `sendgrid` → SMTP

---

## 📱 Envoi de SMS

### Mode actuel : **mock** (console)

```env
SMS_PROVIDER=mock
SMS_ACTIF=true
```

Les SMS sont **logués** dans la console, pas envoyés réellement.

### Providers supportés (à venir)

- `orange` — Orange SMS Cameroun
- `mtn` — MTN Cameroun
- `nexah` — Nexah
- `twilio` — Twilio

---

## 🛡️ Sécurité

| Mesure | Détail |
|---|---|
| **JWT** | Tokens signés avec `JWT_SECRET` |
| **Bcrypt** | Hashage des mots de passe (12 rounds) |
| **Helmet** | Sécurité HTTP headers |
| **CORS** | Origines whitelistées |
| **Rate Limiting** | 3000 req/15min, 10 tentatives login/15min |
| **Validation** | express-validator sur toutes les entrées |
| **Error handling** | Pas de fuite d'info en production |
| **Audit** | Journal d'audit pour les actions sensibles |

---

## 🚀 Déploiement

### Backend — Render

| Environnement | URL |
|---|---|
| **Production** | https://aidora-backend-voj6.onrender.com |
| **Health check** | https://aidora-backend-voj6.onrender.com/api/health |

### Variables d'environnement (Render)

```env
NODE_ENV=production
PORT=10000

DB_HOST=gateway01.xxx.prod.aws.tidbcloud.com
DB_PORT=4000
DB_USER=xxxxx.root
DB_PASSWORD=xxx
DB_NAME=aidora
TIDB_ENABLE_SSL=true
TIDB_CA_PEM=-----BEGIN CERTIFICATE-----...

JWT_SECRET=xxx
JWT_EXPIRES_IN=7d

EMAIL_PROVIDER=brevo
BREVO_API_KEY=xkeysib-xxx
EMAIL_FROM_NAME=Aidora
EMAIL_FROM_EMAIL=noreply@aidora.cm

SMS_PROVIDER=mock
SMS_ACTIF=true

FRONTEND_URL=https://aidora-health.vercel.app
```

### Déployer

```bash
git add .
git commit -m "feat: nouvelle fonctionnalité"
git push origin main
```

→ Render redéploie automatiquement en ~1 minute.

---

## 🌱 Scripts utilitaires

### `seed.js` — Peupler la base de test

```bash
node src/scripts/seed.js
```

Insère :
- 1 admin
- 6 personnels (3 banques + 3 hôpitaux)
- 30 donneurs
- 60 dons
- ~90 poches
- 20 RDV
- 15 demandes

### `sync-vers-tidb.js` — Sync local → TiDB

```bash
node src/scripts/sync-vers-tidb.js
```

Copie **toutes** les tables du MySQL local vers TiDB Cloud.

---

## 🔑 Comptes de test

> **⚠️ Ces comptes sont fournis pour le développement et les démos. À supprimer avant la mise en production réelle.**

### Mot de passe commun : `Test1234!`

| Rôle | Email | Mot de passe |
|---|---|---|
| **ADMINISTRATEUR** | `admin@aidora.cm` | `Test1234!` |
| **PERSONNEL_BANQUE** | `paul.kamga@aidora.cm` | `Test1234!` |
| **PERSONNEL_BANQUE** | `sarah.nkemi@aidora.cm` | `Test1234!` |
| **PERSONNEL_BANQUE** | `eric.tchoua@aidora.cm` | `Test1234!` |
| **PERSONNEL_HOPITAL** | `jean.fotso@aidora.cm` | `Test1234!` |
| **PERSONNEL_HOPITAL** | `marie.tabi@aidora.cm` | `Test1234!` |
| **PERSONNEL_HOPITAL** | `andre.mballa@aidora.cm` | `Test1234!` |
| **DONNEUR** | `jean.mbarga0@test.cm` | `Test1234!` |
| **DONNEUR** | `marie.ngo1@test.cm` | `Test1234!` |
| **DONNEUR** | `paul.fonkou2@test.cm` | `Test1234!` |

**30 donneurs supplémentaires** : voir `src/scripts/seed.js`.

---

## 🧪 Tests avec curl

### Health check

```bash
curl http://localhost:4000/api/health
```

### Login

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifiant":"admin@aidora.cm","motDePasse":"Test1234!"}'
```

### Requête authentifiée

```bash
curl http://localhost:4000/api/donneurs/moi \
  -H "Authorization: Bearer <token>"
```

### Stats publiques

```bash
curl http://localhost:4000/api/statistiques/publiques
```

---

## 📝 Conventions de code

- **Modules** : 1 dossier par feature avec 4 fichiers
  - `*.controller.js` — Reçoit la requête HTTP
  - `*.service.js` — Logique métier
  - `*.repository.js` — Accès base de données
  - `*.routes.js` — Définition des routes
- **Erreurs** : toujours `AppError` (jamais `Error`)
- **Réponses** : via `success(res, data, message)`
- **Async** : wrapper avec `asyncHandler`
- **Validation** : `express-validator` + middleware `validate`
- **Logs** : `logger.info/warn/error` (jamais `console.log`)

---

## 🐛 Résolution de problèmes

### Erreur `Access denied for user`

Vérifier les identifiants dans `.env`.

### Erreur `Connections using insecure transport are prohibited`

Ajouter dans `.env` :

```env
TIDB_ENABLE_SSL=true
TIDB_CA_PEM=-----BEGIN CERTIFICATE-----...
```

### Erreur `Cannot find module 'X'`

Réinstaller :

```bash
rm -rf node_modules package-lock.json
npm install
```

### Le serveur crash au démarrage

Vérifier les logs et que MySQL/TiDB est accessible.

---

## 📄 Licence

Projet académique — **Aidora © 2026**

Tous droits réservés.

---

## 👥 Auteurs

- **Souleymane Laminou** — Développeur Full-Stack
- **Encadreur académique** — [Nom à compléter]
- **Encadreur professionnel** — [Nom à compléter]

---

## 📞 Contact

- 📧 Email : `contact@aidora.cm`
- 🌐 Frontend : https://aidora-health.vercel.app
- 🔌 API : https://aidora-backend-voj6.onrender.com

---

## 🙏 Remerciements

- L'équipe **Express** pour le framework
- **TiDB Cloud** pour la base MySQL serverless
- **Render** pour l'hébergement gratuit
- **Brevo** pour l'envoi d'emails transactionnels
- **Nodemailer** pour la compatibilité SMTP

---

<p align="center">
  <strong>🩸 Aidora — Chaque goutte sauve une vie.</strong>
</p>
```

