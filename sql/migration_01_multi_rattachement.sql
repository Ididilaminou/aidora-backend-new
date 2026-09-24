-- ============================================
-- MIGRATION 01 : Multi-rattachement + Géoloc
-- Date : 2026-09-17
-- Adaptée au schéma réel d'Aidora
-- ============================================

USE aidora;

-- ============================================
-- 1. Rendre etablissement_id NULLABLE sur donneurs
--    FK réelle : fk_donneurs_etablissement (ON UPDATE CASCADE)
-- ============================================

-- Étape 1.1 : Supprimer l'index qui dépend de la FK
ALTER TABLE donneurs DROP INDEX idx_donneurs_dispo;

-- Étape 1.2 : Supprimer la contrainte FK existante
ALTER TABLE donneurs DROP FOREIGN KEY fk_donneurs_etablissement;

-- Étape 1.3 : Rendre la colonne NULLABLE
ALTER TABLE donneurs
  MODIFY COLUMN etablissement_id INT(11) NULL;

-- Étape 1.4 : Recréer la FK avec ON DELETE SET NULL
ALTER TABLE donneurs
  ADD CONSTRAINT fk_donneurs_etablissement
    FOREIGN KEY (etablissement_id) REFERENCES etablissements(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Étape 1.5 : Recréer l'index (sans etablissement_id qui peut être NULL)
ALTER TABLE donneurs
  ADD INDEX idx_donneurs_dispo (etablissement_id, disponible, groupe_sanguin, rhesus);

-- ============================================
-- 2. Ajouter ville + quartier (fallback géoloc)
-- ============================================

ALTER TABLE donneurs
  ADD COLUMN ville VARCHAR(100) NULL AFTER longitude,
  ADD COLUMN quartier VARCHAR(100) NULL AFTER ville;

-- ============================================
-- 3. Ajouter les dates d'éligibilité
-- ============================================

ALTER TABLE donneurs
  ADD COLUMN date_derniere_evaluation DATE NULL AFTER quartier,
  ADD COLUMN date_expiration_eligibilite DATE NULL AFTER date_derniere_evaluation;

-- ============================================
-- 4. Créer la table rattachements_donneurs
-- ============================================

CREATE TABLE IF NOT EXISTS rattachements_donneurs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  donneur_id INT NOT NULL,
  etablissement_id INT NOT NULL,
  statut ENUM('ACTIF', 'INACTIF') DEFAULT 'ACTIF',
  source ENUM('INSCRIPTION', 'REGISTRE_MANUEL', 'REGISTRE_CSV', 'REGISTRE_OCR', 'DON')
    NOT NULL DEFAULT 'INSCRIPTION',
  date_rattachement DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_detachement DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_rattachements_donneur
    FOREIGN KEY (donneur_id) REFERENCES donneurs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rattachements_etablissement
    FOREIGN KEY (etablissement_id) REFERENCES etablissements(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  UNIQUE KEY uniq_rattachement (donneur_id, etablissement_id),
  INDEX idx_rattachements_donneur_statut (donneur_id, statut),
  INDEX idx_rattachements_etablissement_statut (etablissement_id, statut)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 5. Créer la table creneaux_rdv
-- ============================================

CREATE TABLE IF NOT EXISTS creneaux_rdv (
  id INT AUTO_INCREMENT PRIMARY KEY,
  etablissement_id INT NOT NULL,
  date_creneau DATE NOT NULL,
  heure_debut TIME NOT NULL,
  heure_fin TIME NOT NULL,
  capacite_max INT NOT NULL DEFAULT 5,
  places_restantes INT NOT NULL DEFAULT 5,
  est_actif BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_creneaux_etablissement
    FOREIGN KEY (etablissement_id) REFERENCES etablissements(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  INDEX idx_creneaux_etab_date (etablissement_id, date_creneau, est_actif),
  UNIQUE KEY uniq_creneau (etablissement_id, date_creneau, heure_debut)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 6. Modifier la table rendez_vous
-- ============================================

-- Vérifiez d'abord la structure de votre table rendez_vous
-- (le nom de la FK sur etablissement_id peut varier)

ALTER TABLE rendez_vous
  ADD COLUMN creneau_id INT NULL AFTER etablissement_id,
  ADD COLUMN motif_annulation VARCHAR(500) NULL,
  ADD COLUMN commentaire TEXT NULL;

ALTER TABLE rendez_vous
  ADD CONSTRAINT fk_rdv_creneau
    FOREIGN KEY (creneau_id) REFERENCES creneaux_rdv(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE rendez_vous
  ADD INDEX idx_rdv_creneau (creneau_id);

-- ============================================
-- 7. Créer la table invitations_donneurs
-- ============================================

CREATE TABLE IF NOT EXISTS invitations_donneurs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  etablissement_id INT NOT NULL,
  donneur_existant_id INT NULL,
  prenom VARCHAR(100) NOT NULL,
  nom VARCHAR(100) NOT NULL,
  telephone VARCHAR(20) NULL,
  email VARCHAR(150) NULL,
  groupe_sanguin ENUM('A', 'B', 'AB', 'O') NULL,
  rhesus ENUM('POSITIF', 'NEGATIF') NULL,
  code_activation VARCHAR(20) NOT NULL,
  statut ENUM('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE', 'EXPIREE') DEFAULT 'EN_ATTENTE',
  source ENUM('MANUEL', 'CSV', 'OCR') DEFAULT 'MANUEL',
  date_expiration DATETIME NOT NULL,
  date_reponse DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_invitations_etablissement
    FOREIGN KEY (etablissement_id) REFERENCES etablissements(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_invitations_donneur
    FOREIGN KEY (donneur_existant_id) REFERENCES donneurs(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  INDEX idx_invitations_statut (etablissement_id, statut),
  INDEX idx_invitations_code (code_activation),
  INDEX idx_invitations_contact (email, telephone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 8. Créer la table traces_sms
-- ============================================

CREATE TABLE IF NOT EXISTS traces_sms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT NULL,
  telephone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  statut ENUM('ENVOYE', 'ECHOUE', 'EN_ATTENTE') DEFAULT 'EN_ATTENTE',
  provider VARCHAR(50) NULL,
  provider_message_id VARCHAR(100) NULL,
  erreur TEXT NULL,
  date_envoi DATETIME DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_traces_sms_user
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  INDEX idx_sms_user (utilisateur_id),
  INDEX idx_sms_tel (telephone),
  INDEX idx_sms_statut (statut)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 9. Ajouter les colonnes de validité sur evaluations_ia
-- ============================================

-- Vérifiez la structure avant, puis :
ALTER TABLE evaluations_ia
  ADD COLUMN date_expiration DATETIME NULL AFTER date_evaluation,
  ADD COLUMN valide BOOLEAN DEFAULT TRUE AFTER date_expiration,
  ADD COLUMN motif_invalidation VARCHAR(500) NULL AFTER valide;

-- ============================================
-- FIN DE LA MIGRATION
-- ============================================

SELECT 'Migration 01 exécutée avec succès !' AS Message;