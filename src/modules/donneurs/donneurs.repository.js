const { pool } = require("../../config/db");

async function findUtilisateurByTelephoneOuEmail(telephone, email, conn = pool) {
  const [rows] = await conn.query(
    "SELECT id FROM utilisateurs WHERE telephone = ? OR (email IS NOT NULL AND email = ?) LIMIT 1",
    [telephone, email || null]
  );
  return rows[0] || null;
}

async function insertUtilisateur(data, conn = pool) {
  const { nom, prenom, telephone, email, adresse } = data;
  const [result] = await conn.query(
    `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, telephone, adresse, role, statut_compte)
     VALUES (?, ?, ?, '', ?, ?, 'DONNEUR', 'INACTIF')`,
    [nom, prenom, email || null, telephone, adresse || null]
  );
  return result.insertId;
}

async function insertDonneur(id, data, conn = pool) {
  const { groupeSanguin, rhesus, dateNaissance, sexe, etablissementId, latitude, longitude } = data;
  await conn.query(
    `INSERT INTO donneurs (id, groupe_sanguin, rhesus, date_naissance, sexe, etablissement_id, disponible, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, groupeSanguin, rhesus, dateNaissance, sexe, etablissementId, latitude ?? null, longitude ?? null]
  );
}

async function insertActivation(utilisateurId, code, conn = pool) {
  await conn.query(
    `INSERT INTO activations_compte (utilisateur_id, code, date_expiration, statut)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), 'EN_ATTENTE')`,
    [utilisateurId, code]
  );
}

async function findUtilisateurByTelephone(telephone, conn = pool) {
  const [rows] = await conn.query(
    "SELECT id, statut_compte FROM utilisateurs WHERE telephone = ? AND role = 'DONNEUR' LIMIT 1",
    [telephone]
  );
  return rows[0] || null;
}

async function findActivationEnAttente(utilisateurId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT id, code, date_expiration FROM activations_compte
     WHERE utilisateur_id = ? AND statut = 'EN_ATTENTE' ORDER BY date_generation DESC LIMIT 1`,
    [utilisateurId]
  );
  return rows[0] || null;
}

async function marquerActivationUtilisee(activationId, conn = pool) {
  await conn.query(
    "UPDATE activations_compte SET statut = 'UTILISE', date_activation = NOW() WHERE id = ?",
    [activationId]
  );
}

async function activerUtilisateur(id, motDePasseHash, conn = pool) {
  await conn.query(
    "UPDATE utilisateurs SET mot_de_passe = ?, statut_compte = 'ACTIF' WHERE id = ?",
    [motDePasseHash, id]
  );
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT u.id, u.nom, u.prenom, u.telephone, u.email, u.adresse, u.statut_compte,
            d.groupe_sanguin, d.rhesus, d.date_naissance, d.sexe, d.disponible,
            d.latitude, d.longitude, d.ville, d.quartier, d.etablissement_id
     FROM utilisateurs u JOIN donneurs d ON d.id = u.id
     WHERE u.id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Met à jour le profil complet du donneur.
 * Gère les champs de la table `utilisateurs` ET de la table `donneurs`.
 */
async function updateProfil(id, data) {
  const {
    // Champs utilisateurs
    nom, prenom, email, adresse, telephone,
    // Champs donneurs
    groupe_sanguin, rhesus, date_naissance, sexe,
    ville, quartier, latitude, longitude,
  } = data;

  // -------- 1. Table utilisateurs --------
  await pool.query(
    `UPDATE utilisateurs SET
       nom       = COALESCE(?, nom),
       prenom    = COALESCE(?, prenom),
       email     = COALESCE(?, email),
       adresse   = COALESCE(?, adresse),
       telephone = COALESCE(?, telephone)
     WHERE id = ?`,
    [
      nom ?? null,
      prenom ?? null,
      email ?? null,
      adresse ?? null,
      telephone ?? null,
      id,
    ]
  );

  // -------- 2. Table donneurs --------
  await pool.query(
    `UPDATE donneurs SET
       groupe_sanguin  = COALESCE(?, groupe_sanguin),
       rhesus          = COALESCE(?, rhesus),
       date_naissance  = COALESCE(?, date_naissance),
       sexe            = COALESCE(?, sexe),
       ville           = COALESCE(?, ville),
       quartier        = COALESCE(?, quartier),
       latitude        = COALESCE(?, latitude),
       longitude       = COALESCE(?, longitude)
     WHERE id = ?`,
    [
      groupe_sanguin ?? null,
      rhesus ?? null,
      date_naissance ?? null,
      sexe ?? null,
      ville ?? null,
      quartier ?? null,
      latitude ?? null,
      longitude ?? null,
      id,
    ]
  );
}

async function updateDisponibilite(id, disponible) {
  await pool.query("UPDATE donneurs SET disponible = ? WHERE id = ?", [disponible ? 1 : 0, id]);
}

async function updatePosition(id, latitude, longitude) {
  await pool.query("UPDATE donneurs SET latitude = ?, longitude = ? WHERE id = ?", [latitude, longitude, id]);
}

async function listByEtablissement(etablissementId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.nom, u.prenom, u.telephone, u.statut_compte, d.groupe_sanguin, d.rhesus, d.disponible
     FROM utilisateurs u JOIN donneurs d ON d.id = u.id
     WHERE d.etablissement_id = ? ORDER BY u.date_creation DESC`,
    [etablissementId]
  );
  return rows;
}

// Recherche géo : donneurs disponibles, groupe compatible, triés par distance (formule haversine)
async function rechercherDonneursProches({ groupeSanguin, rhesus, latitude, longitude, rayonKm = 15, limite = 20 }) {
  const [rows] = await pool.query(
    `SELECT u.id, u.nom, u.prenom, u.telephone, d.groupe_sanguin, d.rhesus,
       ( 6371 * ACOS(
           COS(RADIANS(?)) * COS(RADIANS(d.latitude)) * COS(RADIANS(d.longitude) - RADIANS(?))
           + SIN(RADIANS(?)) * SIN(RADIANS(d.latitude))
       ) ) AS distance_km
     FROM utilisateurs u JOIN donneurs d ON d.id = u.id
     WHERE d.disponible = 1 AND d.groupe_sanguin = ? AND d.rhesus = ?
       AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL
       AND u.statut_compte = 'ACTIF'
     HAVING distance_km <= ?
     ORDER BY distance_km ASC
     LIMIT ?`,
    [latitude, longitude, latitude, groupeSanguin, rhesus, rayonKm, limite]
  );
  return rows;
}

/**
 * Liste TOUS les donneurs (admin) avec ou sans coordonnées.
 */
async function listerTousLesDonneurs({ seulementGeo = false } = {}) {
  let sql = `
    SELECT 
      u.id, u.nom, u.prenom, u.telephone, u.statut_compte,
      d.groupe_sanguin, d.rhesus, d.disponible, d.ville, d.quartier,
      d.latitude, d.longitude, d.etablissement_id,
      e.nom AS etablissement_nom
    FROM donneurs d
    INNER JOIN utilisateurs u ON u.id = d.id
    LEFT JOIN etablissements e ON e.id = d.etablissement_id
    WHERE u.role = 'DONNEUR'
  `;

  if (seulementGeo) {
    sql += " AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL";
  }

  sql += " ORDER BY u.date_creation DESC";

  const [rows] = await pool.query(sql);
  return rows;
}

module.exports = {
  findUtilisateurByTelephoneOuEmail,
  insertUtilisateur,
  insertDonneur,
  insertActivation,
  findUtilisateurByTelephone,
  findActivationEnAttente,
  marquerActivationUtilisee,
  activerUtilisateur,
  findById,
  updateProfil,
  updateDisponibilite,
  updatePosition,
  listByEtablissement,
  rechercherDonneursProches,
  listerTousLesDonneurs,
};