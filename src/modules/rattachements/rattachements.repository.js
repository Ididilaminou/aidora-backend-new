const { pool, withTransaction } = require("../../config/db");

// ============================================
// LECTURE
// ============================================

async function findAll({
  donneur_id,
  etablissement_id,
  statut,
  disponible,
  page = 1,
  limite = 20,
} = {}) {
  let sql = `
    SELECT r.*,
           u.nom AS donneur_nom, u.prenom AS donneur_prenom, u.email AS donneur_email,
           u.telephone AS donneur_telephone,
           d.groupe_sanguin, d.rhesus, d.disponible AS donneur_disponible,
           d.latitude AS donneur_latitude, d.longitude AS donneur_longitude,
           d.ville AS donneur_ville, d.quartier AS donneur_quartier,
           e.nom AS etablissement_nom, e.type AS etablissement_type
    FROM rattachements_donneurs r
    INNER JOIN donneurs d ON d.id = r.donneur_id
    INNER JOIN utilisateurs u ON u.id = d.id
    INNER JOIN etablissements e ON e.id = r.etablissement_id
    WHERE 1 = 1
  `;
  const params = [];

  if (donneur_id) { sql += " AND r.donneur_id = ?"; params.push(donneur_id); }
  if (etablissement_id) { sql += " AND r.etablissement_id = ?"; params.push(etablissement_id); }
  if (statut) { sql += " AND r.statut = ?"; params.push(statut); }

  if (disponible !== undefined && disponible !== null && disponible !== "") {
    const valeur = String(disponible) === "true" || String(disponible) === "1" ? 1 : 0;
    sql += " AND d.disponible = ?";
    params.push(valeur);
  }

  sql += " ORDER BY r.date_rattachement DESC LIMIT ? OFFSET ?";
  params.push(Number(limite), (Number(page) - 1) * Number(limite));

  const [rows] = await pool.query(sql, params);

  return { rattachements: rows };
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT r.*,
            d.disponible AS donneur_disponible,
            d.latitude AS donneur_latitude, d.longitude AS donneur_longitude,
            d.ville AS donneur_ville, d.quartier AS donneur_quartier,
            e.nom AS etablissement_nom
     FROM rattachements_donneurs r
     INNER JOIN donneurs d ON d.id = r.donneur_id
     INNER JOIN etablissements e ON e.id = r.etablissement_id
     WHERE r.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function findRattachement(donneurId, etablissementId) {
  const [rows] = await pool.query(
    `SELECT * FROM rattachements_donneurs
     WHERE donneur_id = ? AND etablissement_id = ?
     LIMIT 1`,
    [donneurId, etablissementId]
  );
  return rows[0] || null;
}

async function findByDonneur(donneurId) {
  const [rows] = await pool.query(
    `SELECT r.*, e.nom AS etablissement_nom, e.ville AS etablissement_ville
     FROM rattachements_donneurs r
     INNER JOIN etablissements e ON e.id = r.etablissement_id
     WHERE r.donneur_id = ?
     ORDER BY r.est_principal DESC, r.date_rattachement DESC`,
    [donneurId]
  );
  return rows;
}

async function findByEtablissement(etablissementId, statut = "ACTIF") {
  const [rows] = await pool.query(
    `SELECT r.*,
            u.nom, u.prenom, u.email, u.telephone,
            d.groupe_sanguin, d.rhesus, d.disponible AS donneur_disponible,
            d.latitude AS donneur_latitude, d.longitude AS donneur_longitude,
            d.ville AS donneur_ville, d.quartier AS donneur_quartier
     FROM rattachements_donneurs r
     INNER JOIN donneurs d ON d.id = r.donneur_id
     INNER JOIN utilisateurs u ON u.id = d.id
     WHERE r.etablissement_id = ? AND r.statut = ?
     ORDER BY r.date_rattachement DESC`,
    [etablissementId, statut]
  );
  return rows;
}

// ============================================
// ÉCRITURE
// ============================================

async function create(data) {
  const [result] = await pool.query(
    `INSERT INTO rattachements_donneurs
      (donneur_id, etablissement_id, statut, source, est_principal)
     VALUES (?, ?, ?, ?, ?)`,
    [
      data.donneur_id,
      data.etablissement_id,
      data.statut || "ACTIF",
      data.source || "INSCRIPTION",
      data.est_principal || false,
    ]
  );
  return findById(result.insertId);
}

async function updateStatut(id, statut) {
  await pool.query(
    "UPDATE rattachements_donneurs SET statut = ? WHERE id = ?",
    [statut, id]
  );
  return findById(id);
}

async function setPrincipal(donneurId, rattachementId) {
  return withTransaction(async (conn) => {
    await conn.query(
      "UPDATE rattachements_donneurs SET est_principal = FALSE WHERE donneur_id = ?",
      [donneurId]
    );
    await conn.query(
      "UPDATE rattachements_donneurs SET est_principal = TRUE WHERE id = ? AND donneur_id = ?",
      [rattachementId, donneurId]
    );
  });
}

async function delete_(id) {
  await pool.query("DELETE FROM rattachements_donneurs WHERE id = ?", [id]);
}

module.exports = {
  findAll,
  findById,
  findRattachement,
  findByDonneur,
  findByEtablissement,
  create,
  updateStatut,
  setPrincipal,
  delete: delete_,
};