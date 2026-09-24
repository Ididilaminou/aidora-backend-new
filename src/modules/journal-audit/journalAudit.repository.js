const { pool } = require("../../config/db");

/**
 * Liste les entrées d'audit avec filtres et pagination.
 */
async function findAll({
  utilisateur_id,
  action,
  date_debut,
  date_fin,
  page = 1,
  limite = 50,
} = {}) {
  let sql = `
    SELECT ja.id, ja.utilisateur_id, ja.action, ja.date_action,
           ja.ancienne_valeur, ja.nouvelle_valeur, ja.adresse_ip,
           u.nom, u.prenom, u.email, u.role
    FROM journal_audit ja
    LEFT JOIN utilisateurs u ON u.id = ja.utilisateur_id
    WHERE 1 = 1
  `;
  const params = [];

  if (utilisateur_id) { sql += " AND ja.utilisateur_id = ?"; params.push(utilisateur_id); }
  if (action) { sql += " AND ja.action LIKE ?"; params.push(`%${action}%`); }
  if (date_debut) { sql += " AND ja.date_action >= ?"; params.push(date_debut); }
  if (date_fin) { sql += " AND ja.date_action <= ?"; params.push(date_fin); }

  sql += " ORDER BY ja.date_action DESC LIMIT ? OFFSET ?";
  params.push(Number(limite), (Number(page) - 1) * Number(limite));

  const [rows] = await pool.query(sql, params);

  // Comptage total
  let countSql = "SELECT COUNT(*) AS total FROM journal_audit WHERE 1 = 1";
  const countParams = [];
  if (utilisateur_id) { countSql += " AND utilisateur_id = ?"; countParams.push(utilisateur_id); }
  if (action) { countSql += " AND action LIKE ?"; countParams.push(`%${action}%`); }
  if (date_debut) { countSql += " AND date_action >= ?"; countParams.push(date_debut); }
  if (date_fin) { countSql += " AND date_action <= ?"; countParams.push(date_fin); }

  const [countRows] = await pool.query(countSql, countParams);

  return {
    entrees: rows,
    total: countRows[0].total,
    page: Number(page),
    limite: Number(limite),
  };
}

/**
 * Récupère une entrée par ID.
 */
async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ja.*, u.nom, u.prenom, u.email, u.role
     FROM journal_audit ja
     LEFT JOIN utilisateurs u ON u.id = ja.utilisateur_id
     WHERE ja.id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Historique d'un utilisateur.
 */
async function findByUtilisateur(utilisateurId) {
  const [rows] = await pool.query(
    `SELECT id, action, date_action, ancienne_valeur, nouvelle_valeur, adresse_ip
     FROM journal_audit
     WHERE utilisateur_id = ?
     ORDER BY date_action DESC
     LIMIT 200`,
    [utilisateurId]
  );
  return rows;
}

/**
 * Crée une entrée d'audit.
 */
async function create({
  utilisateur_id,
  action,
  ancienne_valeur = null,
  nouvelle_valeur = null,
  adresse_ip = null,
}) {
  const [result] = await pool.query(
    `INSERT INTO journal_audit
     (utilisateur_id, action, ancienne_valeur, nouvelle_valeur, adresse_ip)
     VALUES (?, ?, ?, ?, ?)`,
    [utilisateur_id, action, ancienne_valeur, nouvelle_valeur, adresse_ip]
  );
  return findById(result.insertId);
}

/**
 * Statistiques des actions les plus fréquentes.
 */
async function statsParAction() {
  const [rows] = await pool.query(
    `SELECT action, COUNT(*) AS total
     FROM journal_audit
     GROUP BY action
     ORDER BY total DESC
     LIMIT 20`
  );
  return rows;
}

/**
 * Purge les entrées antérieures à une date.
 */
async function purgerAvant(date) {
  const [result] = await pool.query(
    "DELETE FROM journal_audit WHERE date_action < ?",
    [date]
  );
  return { supprimees: result.affectedRows };
}

module.exports = {
  findAll,
  findById,
  findByUtilisateur,
  create,
  statsParAction,
  purgerAvant,
};