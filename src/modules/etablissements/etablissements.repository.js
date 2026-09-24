// ============================================================
// AIDORA — REPOSITORY ÉTABLISSEMENTS
// ============================================================

const { pool } = require("../../config/db");

// ============================================
// UNICITÉ
// ============================================
async function findByEmailOuTelephone(email, telephone, conn = pool) {
  const [rows] = await conn.query(
    "SELECT id FROM etablissements WHERE email = ? OR telephone = ? LIMIT 1",
    [email, telephone]
  );
  return rows[0] || null;
}

// ============================================
// CRÉATION
// ============================================
async function insert(data, conn = pool) {
  const {
    nom,
    type,
    adresse,
    ville,
    region,
    telephone,
    email,
    latitude,
    longitude,
    possede_banque_de_sang,
  } = data;

  // Normalise possede_banque_de_sang → 0 ou 1
  let possede = possede_banque_de_sang ? 1 : 0;
  // Une banque de sang pure possède forcément une banque de sang
  if (type === "BANQUE_DE_SANG") possede = 1;

  const [result] = await conn.query(
    `INSERT INTO etablissements
       (nom, type, possede_banque_de_sang, adresse, ville, region,
        telephone, email, latitude, longitude, statut)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE_VERIFICATION')`,
    [
      nom,
      type,
      possede,
      adresse || null,
      ville || null,
      region || null,
      telephone || null,
      email || null,
      latitude ?? null,
      longitude ?? null,
    ]
  );
  return result.insertId;
}

// ============================================
// LECTURE
// ============================================
async function findById(id) {
  const [rows] = await pool.query(
    "SELECT * FROM etablissements WHERE id = ?",
    [id]
  );
  return rows[0] || null;
}

async function list({ statut, type } = {}) {
  const conditions = [];
  const params = [];

  if (statut) {
    conditions.push("statut = ?");
    params.push(statut);
  }
  if (type) {
    conditions.push("type = ?");
    params.push(type);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT * FROM etablissements ${where} ORDER BY created_at DESC`,
    params
  );
  return rows;
}

// ============================================
// MISE À JOUR DU STATUT
// ============================================
async function updateStatut(id, statut) {
  const [result] = await pool.query(
    "UPDATE etablissements SET statut = ? WHERE id = ?",
    [statut, id]
  );
  return result.affectedRows > 0;
}

// ============================================
// MISE À JOUR DES INFOS (tous les champs)
// ============================================
// ⚠️  On utilise la whitelist ci-dessous pour éviter l'injection SQL
// via les noms de colonnes. Seuls ces champs peuvent être modifiés.
// ============================================================
async function updateInfos(id, data) {
  const CHAMPS_AUTORISES = [
    "nom",
    "type",
    "possede_banque_de_sang",
    "adresse",
    "ville",
    "region",
    "telephone",
    "email",
    "latitude",
    "longitude",
  ];

  const updates = [];
  const valeurs = [];

  for (const champ of CHAMPS_AUTORISES) {
    if (data[champ] !== undefined) {
      updates.push(`${champ} = ?`);
      valeurs.push(data[champ]);
    }
  }

  if (updates.length === 0) return;

  valeurs.push(id);

  await pool.query(
    `UPDATE etablissements SET ${updates.join(", ")} WHERE id = ?`,
    valeurs
  );
}

// ============================================
// RECHERCHE GÉOGRAPHIQUE
// ============================================
async function rechercherProches({
  latitude,
  longitude,
  rayonKm = 30,
  type = "BANQUE_DE_SANG",
  limite = 20,
}) {
  const [rows] = await pool.query(
    `SELECT id, nom, type, possede_banque_de_sang, ville, adresse, telephone, latitude, longitude,
       ( 6371 * ACOS(
           COS(RADIANS(?)) * COS(RADIANS(latitude)) * COS(RADIANS(longitude) - RADIANS(?))
           + SIN(RADIANS(?)) * SIN(RADIANS(latitude))
       ) ) AS distance_km
     FROM etablissements
     WHERE statut = 'ACTIF'
       AND type = ?
       AND latitude IS NOT NULL
       AND longitude IS NOT NULL
     HAVING distance_km <= ?
     ORDER BY distance_km ASC
     LIMIT ?`,
    [latitude, longitude, latitude, type, rayonKm, limite]
  );
  return rows;
}

module.exports = {
  findByEmailOuTelephone,
  insert,
  findById,
  list,
  updateStatut,
  updateInfos,
  rechercherProches,
};