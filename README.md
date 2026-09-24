
# Aidora — Backend

API REST pour la plateforme de gestion du don de sang Aidora.

## 🚀 Démarrage rapide

### Prérequis

- Node.js 20+
- MySQL 8.0+ ou MariaDB 10.4+
- npm

### Installation

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer l'environnement
cp .env.example .env
# Éditer .env avec vos identifiants MySQL et services

# 3. Créer la base de données
mysql -u root -p < sql/schema.sql

# 4. (Optionnel) Exécuter les migrations
mysql -u root -p aidora < sql/migration_01_multi_rattachement.sql

# 5. Créer le dossier uploads
mkdir uploads

# 6. Démarrer le serveur
npm run dev
```

**API disponible sur** : `http://localhost:4000/api`
**Health check** : `http://localhost:4000/api/health`

---

## 🏗️ Architecture

Le projet suit une architecture **MVC en couches** :
v
Routes → Controllers → Services → Repositories

| Couche | Responsabilité | Règle |
|--------|----------------|-------|

| **Routes** | Définit les endpoints, applique auth + rôle + validation | Une route = un middleware chain |
| **Controllers** | Reçoit `req`/`res`, appelle le service, formate la réponse | **Aucune logique métier** |
| **Services** | Règles métier, transactions, lève des `AppError` | Orchestre les appels repository |
| **Repositories** | Requêtes SQL pures | **Aucune règle métier** |
| **Validators** | Règles `express-validator` inline dans les routes | Une règle par champ |

### Structure des dossiers

src/
├── config/              # DB + Logger
├── middlewares/         # auth, errorHandler, rateLimiter, validate
├── utils/               # AppError, asyncHandler, generateCode, response
├── services/            # emailService, smsService
└── modules/             # Un dossier par domaine métier
    ├── auth/            # Inscription, login, activation, mot de passe
    ├── donneurs/        # Profil, disponibilité, géoloc
    ├── etablissements/  # CRUD banques + hôpitaux
    ├── personnels/      # Comptes du personnel
    ├── dons/            # Enregistrement et validation
    ├── poches/          # Traçabilité des produits sanguins
    ├── stock/           # Entrées/sorties + alertes seuil
    ├── demandes/        # Hôpital → Banque
    ├── notifications/   # Multicanal (interne + email + SMS)
    ├── statistiques/    # Globales + par personnel
    ├── rapports/        # Export PDF/Excel/CSV
    ├── journal-audit/   # Traçabilité des actions
    ├── rattachements/   # Multi-rattachement donneur ↔ établissement
    ├── rdv/             # Créneaux + prise de RDV
    └── registres/       # Import CSV + invitations

Chaque module contient :

- `<module>.routes.js` — Routes + validations `express-validator`
- `<module>.controller.js` — Reçoit req/res
- `<module>.service.js` — Logique métier
- `<module>.repository.js` — Requêtes SQL

---

## 🔒 Sécurité en place

| Mécanisme | Implémentation |
|-----------|----------------|

| **Helmet** | En-têtes HTTP sécurisés |
| **CORS** | Restreint via `CORS_ORIGINS` (`.env`) |
| **Rate limiting** | 10 tentatives login / 15 min, 300 req API / 15 min par IP |
| **bcrypt** | 12 rounds sur tous les mots de passe |
| **JWT** | Expiration + vérification via `authenticate` + contrôle de rôle `authorize(...)` |
| **Anti-énumération** | Message identique (email inconnu/mauvais mdp) + délai constant |
| **Validation stricte** | Regex téléphone CM, groupes sanguins, email, longueurs |
| **Transactions** | Opérations à risque de concurrence (création donneur, RDV, dons) |
| **Logs structurés** | Winston → `logs/error.log`, `logs/combined.log` |
| **Erreurs mappées** | Doublons, clés étrangères traduites en JSON propre |
| **Fail-fast** | Le serveur refuse de démarrer si la BDD est injoignable |

---

## 📡 Endpoints disponibles

### 🔐 Authentification (`/api/auth`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| POST | `/login` | Public | Connexion (email ou téléphone) |
| POST | `/logout` | Tous | Déconnexion (audit) |
| POST | `/inscription-donneur` | Public | Inscription publique d'un donneur |
| POST | `/activation` | Public | Activer un compte avec code |
| POST | `/renvoyer-activation` | Public | Renvoyer le code d'activation |
| POST | `/mot-de-passe-oublie` | Public | Demander une réinitialisation |
| POST | `/reinitialiser-mot-de-passe` | Public | Réinitialiser avec code |
| PUT | `/mot-de-passe` | Tous | Modifier son mot de passe |
| POST | `/inviter-donneur` | Banque/Admin | Inviter un donneur du registre |
| POST | `/accepter-invitation` | Public | Accepter une invitation banque |

### 👤 Donneurs (`/api/donneurs`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| GET | `/moi` | Donneur | Consulter son profil |
| PUT | `/moi` | Donneur | Modifier son profil |
| PATCH | `/moi/disponibilite` | Donneur | Basculer disponible/indisponible |
| GET | `/recherche` | Personnel/Admin | Rechercher des donneurs |
| POST | `/registre` | Banque | Enregistrer un donneur manuellement |

### 🏥 Établissements (`/api/etablissements`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| GET | `/` | Personnel/Admin | Lister les établissements |
| GET | `/:id` | Personnel/Admin | Consulter un établissement |
| POST | `/` | Public | Créer un établissement |
| PUT | `/:id` | Personnel/Admin | Modifier |
| GET | `/recherche-proximite` | Public | Établissements proches (GPS) |
| PATCH | `/:id/valider` | Admin | Valider |
| PATCH | `/:id/rejeter` | Admin | Rejeter |
| PATCH | `/:id/suspendre` | Admin | Suspendre |
| PATCH | `/:id/reactiver` | Admin | Réactiver |

### 👥 Personnels (`/api/personnels`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| GET | `/` | Admin | Lister |
| GET | `/moi` | Personnel | Mon profil |
| GET | `/:id` | Personnel/Admin | Consulter |
| POST | `/` | Admin | Créer un compte |
| PUT | `/:id` | Admin | Modifier |
| PATCH | `/:id/etablissement` | Admin | Rattacher |
| PATCH | `/:id/activer` | Admin | Activer |
| PATCH | `/:id/desactiver` | Admin | Désactiver |
| DELETE | `/:id` | Admin | Supprimer |

### 🩸 Dons (`/api/dons`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| GET | `/` | Tous | Lister les dons |
| GET | `/:id` | Tous | Consulter un don |
| GET | `/donneur/:donneurId` | Donneur/Personnel | Dons d'un donneur |
| POST | `/` | Banque | Enregistrer un don |
| PATCH | `/:id/valider` | Banque | Valider + générer poches |
| PATCH | `/:id/rejeter` | Banque | Rejeter |
| DELETE | `/:id` | Admin | Supprimer |

### 💉 Poches (`/api/poches`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| GET | `/` | Tous | Lister |
| GET | `/:id` | Tous | Consulter |
| GET | `/:id/historique` | Tous | Historique |
| POST | `/` | Banque | Créer une poche |
| PATCH | `/:id/statut` | Banque | Changer le statut |
| PATCH | `/:id/vendre` | Banque | Marquer comme vendue |
| DELETE | `/:id` | Admin | Supprimer |

### 📦 Stock (`/api/stock`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| GET | `/` | Tous | Lister les stocks |
| GET | `/alertes/seuils` | Tous | Stocks sous le seuil |
| GET | `/etablissement/:id` | Tous | Stocks d'un établissement |
| POST | `/` | Banque | Créer un stock |
| PATCH | `/:id/entree` | Banque | Ajouter une entrée |
| PATCH | `/:id/sortie` | Banque | Enregistrer une sortie |
| PATCH | `/:id/ajustement` | Admin | Ajuster manuellement |
| PATCH | `/:id/seuil` | Admin | Modifier le seuil |

### 🏥 Demandes de sang (`/api/demandes`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| GET | `/` | Tous | Lister (filtré par rôle) |
| GET | `/:id` | Tous | Consulter |
| GET | `/:id/historique` | Tous | Historique |
| POST | `/` | Hôpital | Créer une demande |
| PATCH | `/:id/accepter` | Banque | Accepter |
| PATCH | `/:id/rejeter` | Banque | Rejeter |
| PATCH | `/:id/livrer` | Banque | Livrer |
| PATCH | `/:id/confirmer-reception` | Hôpital | Confirmer réception |
| PATCH | `/:id/annuler` | Hôpital/Admin | Annuler |

### 📅 Rendez-vous (`/api/rdv`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| GET | `/creneaux` | Tous | Lister les créneaux |
| POST | `/creneaux` | Banque | Créer un créneau |
| PUT | `/creneaux/:id` | Banque | Modifier un créneau |
| DELETE | `/creneaux/:id` | Banque | Supprimer un créneau |
| GET | `/` | Tous | Lister les RDV |
| GET | `/moi` | Donneur | Mes RDV |
| POST | `/` | Donneur | Prendre un RDV |
| PATCH | `/:id/confirmer` | Banque | Confirmer |
| PATCH | `/:id/annuler` | Tous | Annuler |
| PATCH | `/:id/honore` | Banque | Marquer honoré |

### 🔗 Rattachements (`/api/rattachements`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| GET | `/` | Personnel/Admin | Lister |
| GET | `/moi` | Donneur | Mes rattachements |
| GET | `/etablissement/:id` | Personnel | Rattachements d'un établissement |
| POST | `/` | Banque | Créer un rattachement |
| PATCH | `/:id/desactiver` | Banque | Désactiver |
| PATCH | `/:id/reactiver` | Banque | Réactiver |
| PATCH | `/:id/principal` | Donneur | Définir comme principal |

### 📇 Registres (`/api/registres`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| POST | `/inviter` | Banque | Inviter un donneur |
| POST | `/importer` | Banque | Importer un CSV |
| GET | `/invitations` | Banque | Lister les invitations |
| GET | `/invitations/stats` | Banque | Statistiques |
| GET | `/invitations/:id` | Banque | Consulter |
| DELETE | `/invitations/:id` | Banque | Annuler |
| POST | `/accepter-invitation` | Public | Accepter |

### 🔔 Notifications (`/api/notifications`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| GET | `/` | Tous | Mes notifications |
| GET | `/non-lues` | Tous | Non lues |
| GET | `/compteur` | Tous | Compteur |
| GET | `/:id` | Tous | Consulter |
| PATCH | `/:id/lue` | Tous | Marquer comme lue |
| PATCH | `/toutes-lues` | Tous | Tout marquer |
| DELETE | `/:id` | Tous | Supprimer |
| POST | `/` | Admin | Créer |
| POST | `/diffusion` | Admin | Diffuser en masse |

### 📊 Statistiques (`/api/statistiques`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| GET | `/globales` | Admin | Statistiques globales |
| GET | `/etablissement/:id` | Personnel/Admin | Par établissement |
| GET | `/moi/journalier` | Personnel | Mes stats journalières |
| GET | `/moi/hebdomadaire` | Personnel | Mes stats hebdo |
| GET | `/moi/mensuel` | Personnel | Mes stats mensuelles |
| GET | `/moi/global` | Personnel | Mes stats globales |
| GET | `/personnel/:id` | Admin | Stats d'un personnel |
| GET | `/dons/evolution` | Admin/Banque | Évolution des dons |
| GET | `/demandes/par-statut` | Tous | Répartition par statut |
| GET | `/stocks/par-type` | Admin/Banque | Répartition des stocks |

### 📄 Rapports (`/api/rapports`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| GET | `/` | Personnel/Admin | Lister |
| GET | `/:id` | Personnel/Admin | Consulter |
| GET | `/:id/telecharger` | Personnel/Admin | Télécharger |
| POST | `/generer` | Personnel/Admin | Générer un rapport |
| DELETE | `/:id` | Personnel/Admin | Supprimer |

### 📜 Journal d'audit (`/api/journal-audit`)

| Méthode | URL | Accès | Description |
|---------|-----|-------|-------------|

| GET | `/` | Admin | Lister |
| GET | `/:id` | Admin | Consulter |
| GET | `/utilisateur/:id` | Admin | Historique utilisateur |
| GET | `/stats/actions` | Admin | Stats des actions |
| DELETE | `/purger` | Admin | Purger les anciennes entrées |

---

## 🌐 Variables d'environnement

### `.env` (obligatoires)

```env
# Serveur
PORT=4000
NODE_ENV=development

# Base de données
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=aidora

# JWT
JWT_SECRET=votre_cle_secrete_tres_longue_et_securisee
JWT_EXPIRES_IN=1d

# Frontend
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
```

### Services externes (optionnels)

```env
# ============================================
# EMAIL
# ============================================
EMAIL_PROVIDER=mock         # mock | gmail | smtp | sendgrid
EMAIL_ACTIF=true
EMAIL_FROM=Aidora <noreply@aidora.cm>

# Gmail / SMTP
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=465
# SMTP_SECURE=true
# SMTP_USER=votre.email@gmail.com
# SMTP_PASSWORD=mot_de_passe_application

# SendGrid
# SENDGRID_API_KEY=xxx

# ============================================
# SMS
# ============================================
SMS_PROVIDER=mock           # mock | orange | mtn | nexah | twilio
SMS_ACTIF=true

# Orange SMS Cameroun
# ORANGE_SMS_TOKEN=xxx
# ORANGE_SMS_SENDER=AIDORA

# MTN Cameroun
# MTN_SMS_API_KEY=xxx

# Nexah
# NEXAH_USER=xxx
# NEXAH_PASSWORD=xxx

# Twilio
# TWILIO_ACCOUNT_SID=xxx
# TWILIO_AUTH_TOKEN=xxx
# TWILIO_PHONE_NUMBER=+xxx
```

---

## 🗄️ Base de données

### Tables principales (20+)

- `utilisateurs` — Comptes (tous rôles)
- `donneurs` — Profils donneurs
- `personnels` — Profils personnel
- `administrateurs` — Profils admin
- `etablissements` — Banques + hôpitaux
- `activations_compte` — Codes d'activation
- `dons` — Dons enregistrés
- `poches` — Produits sanguins tracés
- `historique_poches` — Traçabilité
- `stocks` — Stocks agrégés
- `mouvements_stock` — Historique mouvements
- `demandes_sang` — Demandes hôpitaux
- `distributions` — Livraisons
- `notifications` — Notifications internes
- `journal_audit` — Audit
- `evaluations_ia` — Tests d'éligibilité IA
- `rattachements_donneurs` — Multi-rattachement
- `creneaux_rdv` — Créneaux disponibles
- `rendez_vous` — RDV pris
- `invitations_donneurs` — Invitations
- `traces_sms` / `traces_email` — Traçabilité envois
- `rapports` — Rapports générés
- `statistiques` / `statistiques_personnel` — Stats

---

## 🧪 Tests manuels (Flux complet)

1. Connexion admin → token
2. Créer établissement → ID
3. Valider établissement
4. Créer personnel banque
5. Connexion personnel → token
6. Inscription publique donneur
7. Activation donneur
8. Connexion donneur → token
9. Créer créneau (banque)
10. Prendre RDV (donneur)

---

## 🛠️ Scripts npm

```bash
npm run dev        # Démarrage avec nodemon
npm start          # Production
```

---

## 📦 Dépendances principales

| Package | Usage |
|---------|-------|

| `express` | Framework web |
| `mysql2` | Client MySQL (avec promises) |
| `bcryptjs` | Hash des mots de passe |
| `jsonwebtoken` | Génération/vérification JWT |
| `express-validator` | Validation des entrées |
| `helmet` | Sécurité HTTP |
| `cors` | Gestion CORS |
| `morgan` | Logs HTTP |
| `winston` | Logs structurés |
| `nodemailer` | Envoi d'emails |
| `node-fetch` | Requêtes HTTP (SMS) |
| `multer` | Upload de fichiers |
| `csv-parser` | Lecture CSV |

---

## 📊 État du projet

| Aspect | Complétion |
|--------|:----------:|

| Backend (modules) | ✅ 95% |
| Base de données | ✅ 100% |
| Services externes | ✅ 100% (mock) |
| Tests manuels | ✅ 60% |
| Déploiement | ⏳ 0% |

---

## 🚧 Roadmap

### Phase 1 — Backend ✅

- [x] Architecture MVC
- [x] 15 modules fonctionnels
- [x] Authentification JWT
- [x] Multi-rattachement
- [x] Notifications multicanal
- [x] Audit complet

### Phase 2 — Améliorations backend

- [ ] Génération réelle de PDF/Excel
- [ ] Tests automatisés (Jest + Supertest)
- [ ] Documentation Swagger
- [ ] Dockerisation
- [ ] WebSocket (notifications temps réel)

### Phase 3 — Frontend

- [ ] Connexion du React aux nouvelles routes
- [ ] Pages d'inscription publique
- [ ] Pages de créneaux et RDV
- [ ] Import CSV visuel

### Phase 4 — Déploiement

- [ ] Configuration production
- [ ] Nginx + PM2
- [ ] HTTPS
- [ ] Sauvegardes automatiques

---

## 📝 Licence

Projet académique — Aidora © 2026

## 👥 Contributeurs

- BRAYAN (Développeur principal)

---

**Pour toute question, consulter la documentation ou ouvrir une issue.**

---

## 📄 `.env.example` (à créer aussi)

```env
# ============================================
# SERVEUR
# ============================================
PORT=4000
NODE_ENV=development

# ============================================
# BASE DE DONNÉES
# ============================================
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=aidora

# ============================================
# JWT
# ============================================
JWT_SECRET=changez_cette_cle_par_une_longue_et_securisee
JWT_EXPIRES_IN=1d

# ============================================
# FRONTEND
# ============================================
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173

# ============================================
# EMAIL
# ============================================
EMAIL_PROVIDER=mock
EMAIL_ACTIF=true
EMAIL_FROM=Aidora <noreply@aidora.cm>

# Gmail / SMTP
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=465
# SMTP_SECURE=true
# SMTP_USER=
# SMTP_PASSWORD=

# SendGrid
# SENDGRID_API_KEY=

# ============================================
# SMS
# ============================================
SMS_PROVIDER=mock
SMS_ACTIF=true

# Orange SMS Cameroun
# ORANGE_SMS_TOKEN=
# ORANGE_SMS_SENDER=AIDORA

# MTN Cameroun
# MTN_SMS_API_KEY=

# Nexah
# NEXAH_USER=
# NEXAH_PASSWORD=

# Twilio
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_PHONE_NUMBER=
```

---

## 🚀 Comment utiliser

1. **Créez** `README.md` à la racine du backend
2. **Copiez** le premier bloc de code
3. **Créez** `.env.example` à la racine du backend
4. **Copiez** le second bloc de code
5. **Sauvegardez**
