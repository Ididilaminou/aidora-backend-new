-- ============================================
-- AIDORA - Script de création de la base
-- Moteur : InnoDB | Charset : utf8mb4
-- ============================================

DROP DATABASE IF EXISTS aidora;
CREATE DATABASE aidora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aidora;

-- ==================== UTILISATEURS (héritage table-per-hierarchy) ====================
CREATE TABLE utilisateurs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE,
  mot_de_passe VARCHAR(255) NOT NULL,
  telephone VARCHAR(20) UNIQUE NOT NULL,
  adresse VARCHAR(255),
  role ENUM('DONNEUR','PERSONNEL_BANQUE','PERSONNEL_HOPITAL','ADMINISTRATEUR') NOT NULL,
  statut_compte ENUM('ACTIF','INACTIF','BLOQUE') DEFAULT 'INACTIF',
  superviseur_id INT NULL,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_modification DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_utilisateurs_email (email),
  INDEX idx_utilisateurs_role (role),
  CONSTRAINT fk_utilisateurs_superviseur
    FOREIGN KEY (superviseur_id) REFERENCES utilisateurs(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== ÉTABLISSEMENTS ====================
CREATE TABLE etablissements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(150) NOT NULL,
  type ENUM('HOPITAL','BANQUE_DE_SANG') NOT NULL,
  adresse VARCHAR(255),
  ville VARCHAR(100),
  region VARCHAR(100),
  telephone VARCHAR(20),
  email VARCHAR(150),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  statut ENUM('EN_ATTENTE_VERIFICATION','ACTIF','REJETE','SUSPENDU') DEFAULT 'EN_ATTENTE_VERIFICATION',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_etablissements_geo (latitude, longitude),
  INDEX idx_etablissements_statut (statut)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== SOUS-TYPES D'UTILISATEUR ====================
CREATE TABLE donneurs (
  id INT PRIMARY KEY,
  groupe_sanguin ENUM('A','B','AB','O') NOT NULL,
  rhesus ENUM('POSITIF','NEGATIF') NOT NULL,
  date_naissance DATE,
  sexe ENUM('M','F'),
  disponible BOOLEAN DEFAULT 0,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  etablissement_id INT NOT NULL,
  CONSTRAINT fk_donneurs_user
    FOREIGN KEY (id) REFERENCES utilisateurs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_donneurs_etablissement
    FOREIGN KEY (etablissement_id) REFERENCES etablissements(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_donneurs_dispo (etablissement_id, disponible, groupe_sanguin, rhesus)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE personnels (
  id INT PRIMARY KEY,
  fonction VARCHAR(100),
  etablissement_id INT NOT NULL,
  CONSTRAINT fk_personnels_user
    FOREIGN KEY (id) REFERENCES utilisateurs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personnels_etablissement
    FOREIGN KEY (etablissement_id) REFERENCES etablissements(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE administrateurs (
  id INT PRIMARY KEY,
  niveau_acces VARCHAR(50) DEFAULT 'STANDARD',
  date_derniere_connexion DATETIME NULL,
  CONSTRAINT fk_administrateurs_user
    FOREIGN KEY (id) REFERENCES utilisateurs(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== ACTIVATION & AUDIT ====================
CREATE TABLE activations_compte (
  id INT AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT NOT NULL,
  code VARCHAR(10) NOT NULL,
  date_generation DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_expiration DATETIME NOT NULL,
  date_activation DATETIME NULL,
  statut ENUM('EN_ATTENTE','UTILISE','EXPIRE') DEFAULT 'EN_ATTENTE',
  CONSTRAINT fk_activations_user
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_activations_user (utilisateur_id, statut)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE journal_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT NULL,
  action VARCHAR(150) NOT NULL,
  date_action DATETIME DEFAULT CURRENT_TIMESTAMP,
  ancienne_valeur TEXT,
  nouvelle_valeur TEXT,
  adresse_ip VARCHAR(45),
  CONSTRAINT fk_audit_user
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_audit_user_date (utilisateur_id, date_action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT NOT NULL,
  titre VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50),
  date_envoi DATETIME DEFAULT CURRENT_TIMESTAMP,
  lue BOOLEAN DEFAULT 0,
  CONSTRAINT fk_notifications_user
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_notifications_user_lue (utilisateur_id, lue)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== PARCOURS DU DONNEUR ====================
CREATE TABLE rendez_vous (
  id INT AUTO_INCREMENT PRIMARY KEY,
  donneur_id INT NOT NULL,
  etablissement_id INT NOT NULL,
  date_rendez_vous DATE NOT NULL,
  heure_rendez_vous TIME NOT NULL,
  statut ENUM('PLANIFIE','CONFIRME','ANNULE','HONORE') DEFAULT 'PLANIFIE',
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rdv_donneur
    FOREIGN KEY (donneur_id) REFERENCES donneurs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rdv_etablissement
    FOREIGN KEY (etablissement_id) REFERENCES etablissements(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_rdv_donneur_statut (donneur_id, statut)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sollicitations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  donneur_id INT NOT NULL,
  personnel_id INT NOT NULL,
  date_sollicitation DATETIME DEFAULT CURRENT_TIMESTAMP,
  message TEXT,
  motif VARCHAR(255),
  statut ENUM('ENVOYEE','ACCEPTEE','REFUSEE','EXPIREE') DEFAULT 'ENVOYEE',
  CONSTRAINT fk_sollicitations_donneur
    FOREIGN KEY (donneur_id) REFERENCES donneurs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sollicitations_personnel
    FOREIGN KEY (personnel_id) REFERENCES personnels(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_sollicitations_donneur_statut (donneur_id, statut)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE evaluations_ia (
  id INT AUTO_INCREMENT PRIMARY KEY,
  donneur_id INT NOT NULL,
  date_evaluation DATETIME DEFAULT CURRENT_TIMESTAMP,
  reponses JSON NOT NULL,
  resultat ENUM('ELIGIBLE','NON_ELIGIBLE','A_VERIFIER') NOT NULL,
  analyse TEXT,
  CONSTRAINT fk_evaluations_donneur
    FOREIGN KEY (donneur_id) REFERENCES donneurs(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_evaluations_donneur_date (donneur_id, date_evaluation)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== DONS, POCHES, TRAÇABILITÉ ====================
CREATE TABLE dons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  donneur_id INT NOT NULL,
  personnel_id INT NOT NULL,
  etablissement_id INT NOT NULL,
  date_don DATE NOT NULL,
  type_don VARCHAR(50) DEFAULT 'SANG_TOTAL',
  quantite DECIMAL(6,2) NOT NULL,
  statut ENUM('ENREGISTRE','VALIDE','REJETE') DEFAULT 'ENREGISTRE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dons_donneur
    FOREIGN KEY (donneur_id) REFERENCES donneurs(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_dons_personnel
    FOREIGN KEY (personnel_id) REFERENCES personnels(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_dons_etablissement
    FOREIGN KEY (etablissement_id) REFERENCES etablissements(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_dons_donneur_date (donneur_id, date_don)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE poches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  don_id INT NOT NULL,
  code_poche VARCHAR(50) UNIQUE NOT NULL,
  groupe_sanguin ENUM('A','B','AB','O') NOT NULL,
  rhesus ENUM('POSITIF','NEGATIF') NOT NULL,
  type_produit ENUM('SANG_TOTAL','GLOBULES_ROUGES','PLAQUETTES','PLASMA') NOT NULL,
  volume DECIMAL(6,2) NOT NULL,
  date_collecte DATE NOT NULL,
  date_peremption DATE NOT NULL,
  date_vente DATE NULL,
  prix_vente DECIMAL(10,2) NULL,
  statut ENUM('EN_CONTROLE','DISPONIBLE','RESERVEE','VENDUE','DISTRIBUEE','PERIMEE','REJETEE') DEFAULT 'EN_CONTROLE',
  etablissement_id INT NOT NULL,
  personnel_responsable_id INT NULL,
  CONSTRAINT fk_poches_don
    FOREIGN KEY (don_id) REFERENCES dons(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_poches_etablissement
    FOREIGN KEY (etablissement_id) REFERENCES etablissements(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_poches_personnel
    FOREIGN KEY (personnel_responsable_id) REFERENCES personnels(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_poches_dispo (etablissement_id, statut, groupe_sanguin, rhesus, type_produit),
  INDEX idx_poches_peremption (date_peremption)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE historique_poches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  poche_id INT NOT NULL,
  ancien_statut VARCHAR(30),
  nouveau_statut VARCHAR(30) NOT NULL,
  date_changement DATETIME DEFAULT CURRENT_TIMESTAMP,
  commentaire VARCHAR(255),
  utilisateur_id INT NULL,
  CONSTRAINT fk_historique_poche
    FOREIGN KEY (poche_id) REFERENCES poches(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_historique_user
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_historique_poche_date (poche_id, date_changement)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== STOCKS ====================
CREATE TABLE stocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  etablissement_id INT NOT NULL,
  groupe_sanguin ENUM('A','B','AB','O') NOT NULL,
  rhesus ENUM('POSITIF','NEGATIF') NOT NULL,
  type_produit ENUM('SANG_TOTAL','GLOBULES_ROUGES','PLAQUETTES','PLASMA') NOT NULL,
  quantite INT DEFAULT 0,
  seuil_alerte INT DEFAULT 5,
  date_mise_a_jour DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_stocks_etablissement
    FOREIGN KEY (etablissement_id) REFERENCES etablissements(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uniq_stock (etablissement_id, groupe_sanguin, rhesus, type_produit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE mouvements_stock (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stock_id INT NOT NULL,
  type_mouvement ENUM('ENTREE','SORTIE','AJUSTEMENT') NOT NULL,
  quantite INT NOT NULL,
  date_mouvement DATETIME DEFAULT CURRENT_TIMESTAMP,
  motif VARCHAR(255),
  utilisateur_id INT NULL,
  CONSTRAINT fk_mouvements_stock
    FOREIGN KEY (stock_id) REFERENCES stocks(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_mouvements_user
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_mouvements_stock_date (stock_id, date_mouvement)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== DEMANDES INTER-ÉTABLISSEMENTS ====================
CREATE TABLE demandes_sang (
  id INT AUTO_INCREMENT PRIMARY KEY,
  etablissement_demandeur_id INT NOT NULL,
  etablissement_destinataire_id INT NULL,
  groupe_sanguin ENUM('A','B','AB','O') NOT NULL,
  rhesus ENUM('POSITIF','NEGATIF') NOT NULL,
  type_produit ENUM('SANG_TOTAL','GLOBULES_ROUGES','PLAQUETTES','PLASMA') NOT NULL,
  quantite_demandee INT NOT NULL,
  urgence BOOLEAN DEFAULT 0,
  motif VARCHAR(255),
  statut ENUM('EN_ATTENTE','EN_COURS','ACCEPTEE','REJETEE','LIVREE','ANNULEE') DEFAULT 'EN_ATTENTE',
  personnel_traitant_id INT NULL,
  date_demande DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_traitement DATETIME NULL,
  CONSTRAINT fk_demandes_demandeur
    FOREIGN KEY (etablissement_demandeur_id) REFERENCES etablissements(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_demandes_destinataire
    FOREIGN KEY (etablissement_destinataire_id) REFERENCES etablissements(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_demandes_personnel
    FOREIGN KEY (personnel_traitant_id) REFERENCES personnels(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_demandes_statut_urgence (statut, urgence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE distributions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  demande_id INT NOT NULL,
  quantite INT NOT NULL,
  date_distribution DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_reception DATETIME NULL,
  statut ENUM('EN_TRANSIT','LIVREE','CONFIRMEE','ANNULEE') DEFAULT 'EN_TRANSIT',
  personnel_distributeur_id INT NULL,
  CONSTRAINT fk_distributions_demande
    FOREIGN KEY (demande_id) REFERENCES demandes_sang(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_distributions_personnel
    FOREIGN KEY (personnel_distributeur_id) REFERENCES personnels(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== STATISTIQUES & RAPPORTS ====================
CREATE TABLE statistiques (
  id INT AUTO_INCREMENT PRIMARY KEY,
  etablissement_id INT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  nombre_dons INT DEFAULT 0,
  nombre_donneurs INT DEFAULT 0,
  nombre_poches INT DEFAULT 0,
  nombre_demandes INT DEFAULT 0,
  taux_satisfaction DECIMAL(5,2),
  CONSTRAINT fk_statistiques_etablissement
    FOREIGN KEY (etablissement_id) REFERENCES etablissements(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_statistiques_periode (date_debut, date_fin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE statistiques_personnel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  personnel_id INT NOT NULL,
  etablissement_id INT NOT NULL,
  periode ENUM('JOURNALIER','HEBDOMADAIRE','MENSUEL','GLOBAL') NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  nombre_dons_enregistres INT DEFAULT 0,
  nombre_donneurs_enregistres INT DEFAULT 0,
  nombre_poches_generees INT DEFAULT 0,
  nombre_poches_vendues INT DEFAULT 0,
  nombre_poches_distribuees INT DEFAULT 0,
  nombre_poches_perimees INT DEFAULT 0,
  nombre_demandes_traitees INT DEFAULT 0,
  nombre_sollicitations_envoyees INT DEFAULT 0,
  volume_sanguin_collecte DECIMAL(8,2) DEFAULT 0,
  CONSTRAINT fk_stats_personnel
    FOREIGN KEY (personnel_id) REFERENCES personnels(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_stats_personnel_etablissement
    FOREIGN KEY (etablissement_id) REFERENCES etablissements(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_stats_personnel_periode (personnel_id, periode, date_debut)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rapports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  personnel_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  date_generation DATETIME DEFAULT CURRENT_TIMESTAMP,
  contenu LONGTEXT,
  format_export ENUM('PDF','EXCEL','CSV') DEFAULT 'PDF',
  CONSTRAINT fk_rapports_personnel
    FOREIGN KEY (personnel_id) REFERENCES personnels(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- FIN DU SCRIPT
-- ============================================
SELECT 'Base de données Aidora créée avec succès !' AS Message;