const { pool } = require("../../config/db");

async function findByEmailOuTelephone(email, telephone, conn = pool) {
  const [rows] = await conn.query(
    "SELECT id FROM etablissements WHERE email = ? OR telephone = ? LIMIT 1",
    [email, telephone]
  );
  return rows[0] || null;
}

async function insert(data, conn = pool) {
  const { nom, type, adresse, ville, region, telephone, email, latitude, longitude } = data;
  const [result] = await conn.query(
    `INSERT INTO etablissements (nom, type, adresse, ville, region, telephone, email, latitude, longitude, statut)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE_VERIFICATION')`,
    [nom, type, adresse || null, ville || null, region || null, telephone, email, latitude ?? null, longitude ?? null]
  );
  return result.insertId;
}

async function findById(id) {
  const [rows] = await pool.query("SELECT * FROM etablissements WHERE id = ?", [id]);
  return rows[0] || null;
}

async function list({ statut, type } = {}) {
  const conditions = [];
  const params = [];
  if (statut) { conditions.push("statut = ?"); params.push(statut); }
  if (type) { conditions.push("type = ?"); params.push(type); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(`SELECT * FROM etablissements ${where} ORDER BY created_at DESC`, params);
  return rows;
}

async function updateStatut(id, statut) {
  const [result] = await pool.query("UPDATE etablissements SET statut = ? WHERE id = ?", [statut, id]);
  return result.affectedRows > 0;
}

async function updateInfos(id, { nom, adresse, ville, region, telephone, email }) {
  await pool.query(
    `UPDATE etablissements SET
       nom = COALESCE(?, nom), adresse = COALESCE(?, adresse), ville = COALESCE(?, ville),
       region = COALESCE(?, region), telephone = COALESCE(?, telephone), email = COALESCE(?, email)
     WHERE id = ?`,
    [nom ?? null, adresse ?? null, ville ?? null, region ?? null, telephone ?? null, email ?? null, id]
  );
}

// Banques de sang actives à proximité (pour qu'un donneur en cherche une — "consulterBanques")
async function rechercherProches({ latitude, longitude, rayonKm = 30, type = "BANQUE_DE_SANG", limite = 20 }) {
  const [rows] = await pool.query(
    `SELECT id, nom, type, ville, adresse, telephone,
       ( 6371 * ACOS(
           COS(RADIANS(?)) * COS(RADIANS(latitude)) * COS(RADIANS(longitude) - RADIANS(?))
           + SIN(RADIANS(?)) * SIN(RADIANS(latitude))
       ) ) AS distance_km
     FROM etablissements
     WHERE statut = 'ACTIF' AND type = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
     HAVING distance_km <= ?
     ORDER BY distance_km ASC
     LIMIT ?`,
    [latitude, longitude, latitude, type, rayonKm, limite]
  );
  return rows;
}

module.exports = { findByEmailOuTelephone, insert, findById, list, updateStatut, updateInfos, rechercherProches };