const { pool } = require("../../config/db");

async function findAll({ donneur_id, personnel_id, statut, limite = 50 } = {}) {
  let sql = `
    SELECT s.*,
           u.nom AS donneur_nom, u.prenom AS donneur_prenom, u.telephone AS donneur_telephone, u.email AS donneur_email,
           d.groupe_sanguin, d.rhesus, d.disponible,
           p.nom AS personnel_nom, p.prenom AS personnel_prenom,
           e.nom AS etablissement_nom
    FROM sollicitations s
    INNER JOIN donneurs d ON d.id = s.donneur_id
    INNER JOIN utilisateurs u ON u.id = d.id
    INNER JOIN personnels pe ON pe.id = s.personnel_id
    INNER JOIN utilisateurs p ON p.id = pe.id
    INNER JOIN etablissements e ON e.id = pe.etablissement_id
    WHERE 1 = 1
  `;
  const params = [];

  if (donneur_id) { sql += " AND s.donneur_id = ?"; params.push(donneur_id); }
  if (personnel_id) { sql += " AND s.personnel_id = ?"; params.push(personnel_id); }
  if (statut) { sql += " AND s.statut = ?"; params.push(statut); }

  sql += " ORDER BY s.date_sollicitation DESC LIMIT ?";
  params.push(Number(limite));

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT s.*, u.nom AS donneur_nom, u.prenom AS donneur_prenom,
            d.groupe_sanguin, d.rhesus
     FROM sollicitations s
     INNER JOIN donneurs d ON d.id = s.donneur_id
     INNER JOIN utilisateurs u ON u.id = d.id
     WHERE s.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function findDonneursCompatibles({ etablissement_id, groupe_sanguin, rhesus }) {
  const [rows] = await pool.query(
    `SELECT d.id AS donneur_id, u.nom, u.prenom, u.telephone, u.email,
            d.groupe_sanguin, d.rhesus, d.disponible
     FROM donneurs d
     INNER JOIN utilisateurs u ON u.id = d.id
     INNER JOIN rattachements_donneurs r ON r.donneur_id = d.id
     WHERE r.etablissement_id = ?
       AND r.statut = 'ACTIF'
       AND d.disponible = 1
       AND d.groupe_sanguin = ?
       AND d.rhesus = ?
       AND u.statut_compte = 'ACTIF'
     ORDER BY u.nom ASC`,
    [etablissement_id, groupe_sanguin, rhesus]
  );
  return rows;
}

async function create(data) {
  const [result] = await pool.query(
    `INSERT INTO sollicitations (donneur_id, personnel_id, message, motif, statut)
     VALUES (?, ?, ?, ?, 'ENVOYEE')`,
    [data.donneur_id, data.personnel_id, data.message, data.motif]
  );
  return findById(result.insertId);
}

async function changerStatut(id, statut) {
  await pool.query("UPDATE sollicitations SET statut = ? WHERE id = ?", [statut, id]);
  return findById(id);
}

module.exports = { findAll, findById, findDonneursCompatibles, create, changerStatut };