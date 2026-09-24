const { pool } = require("../../config/db");

// ============================================
// LECTURE
// ============================================

async function findAll({ donneur_id, limite = 20 } = {}) {
  let sql = `
    SELECT e.*, u.nom AS donneur_nom, u.prenom AS donneur_prenom
    FROM evaluations_ia e
    INNER JOIN donneurs d ON d.id = e.donneur_id
    INNER JOIN utilisateurs u ON u.id = d.id
    WHERE 1 = 1
  `;
  const params = [];

  if (donneur_id) {
    sql += " AND e.donneur_id = ?";
    params.push(donneur_id);
  }

  sql += " ORDER BY e.date_evaluation DESC LIMIT ?";
  params.push(Number(limite));

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT e.*, u.nom AS donneur_nom, u.prenom AS donneur_prenom
     FROM evaluations_ia e
     INNER JOIN donneurs d ON d.id = e.donneur_id
     INNER JOIN utilisateurs u ON u.id = d.id
     WHERE e.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function findDerniere(donneurId) {
  const [rows] = await pool.query(
    `SELECT * FROM evaluations_ia
     WHERE donneur_id = ? AND valide = TRUE
     ORDER BY date_evaluation DESC
     LIMIT 1`,
    [donneurId]
  );
  return rows[0] || null;
}

async function findDonneurContexte(donneurId) {
  const [rows] = await pool.query(
    `SELECT d.date_naissance, d.sexe, d.groupe_sanguin, d.rhesus,
            d.date_derniere_evaluation, d.date_expiration_eligibilite
     FROM donneurs d
     WHERE d.id = ?`,
    [donneurId]
  );
  return rows[0] || null;
}

async function findDernierDon(donneurId) {
  const [rows] = await pool.query(
    `SELECT date_don, statut
     FROM dons
     WHERE donneur_id = ? AND statut = 'VALIDE'
     ORDER BY date_don DESC
     LIMIT 1`,
    [donneurId]
  );
  return rows[0] || null;
}

// ============================================
// ÉCRITURE
// ============================================

async function create(data) {
  const [result] = await pool.query(
    `INSERT INTO evaluations_ia
      (donneur_id, reponses, resultat, analyse, date_expiration, valide)
     VALUES (?, ?, ?, ?, ?, TRUE)`,
    [
      data.donneur_id,
      JSON.stringify(data.reponses),
      data.resultat,
      data.analyse,
      data.date_expiration,
    ]
  );
  return findById(result.insertId);
}

async function invalider(id, motif) {
  await pool.query(
    `UPDATE evaluations_ia
     SET valide = FALSE, motif_invalidation = ?
     WHERE id = ?`,
    [motif, id]
  );
}

module.exports = {
  findAll,
  findById,
  findDerniere,
  findDonneurContexte,
  findDernierDon,
  create,
  invalider,
};