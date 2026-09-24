const { pool } = require("../../config/db");

/**
 * Liste les notifications d'un utilisateur avec pagination.
 */
async function findAllByUser(utilisateurId, { page = 1, limite = 20 } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM notifications
     WHERE utilisateur_id = ?
     ORDER BY date_envoi DESC
     LIMIT ? OFFSET ?`,
    [utilisateurId, Number(limite), (Number(page) - 1) * Number(limite)]
  );

  const [countRows] = await pool.query(
    "SELECT COUNT(*) AS total FROM notifications WHERE utilisateur_id = ?",
    [utilisateurId]
  );

  return {
    notifications: rows,
    total: countRows[0].total,
    page: Number(page),
    limite: Number(limite),
  };
}

/**
 * Liste les notifications non lues d'un utilisateur.
 */
async function findNonLues(utilisateurId) {
  const [rows] = await pool.query(
    `SELECT * FROM notifications
     WHERE utilisateur_id = ? AND lue = 0
     ORDER BY date_envoi DESC`,
    [utilisateurId]
  );
  return rows;
}

/**
 * Compte les notifications non lues d'un utilisateur.
 */
async function compterNonLues(utilisateurId) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM notifications WHERE utilisateur_id = ? AND lue = 0",
    [utilisateurId]
  );
  return rows[0].total;
}

/**
 * Récupère une notification par son ID.
 */
async function findById(id) {
  const [rows] = await pool.query(
    "SELECT * FROM notifications WHERE id = ?",
    [id]
  );
  return rows[0] || null;
}

/**
 * Crée une notification.
 */
async function create(donnees) {
  const { utilisateur_id, titre, message, type } = donnees;
  const [result] = await pool.query(
    `INSERT INTO notifications (utilisateur_id, titre, message, type, lue)
     VALUES (?, ?, ?, ?, 0)`,
    [utilisateur_id, titre, message, type || "INFO"]
  );
  return findById(result.insertId);
}

/**
 * Crée plusieurs notifications en une seule requête.
 */
async function createMany(notifications) {
  if (notifications.length === 0) return { envoyees: 0 };

  const values = notifications.map((n) => [
    n.utilisateur_id,
    n.titre,
    n.message,
    n.type || "INFO",
    0,
  ]);

  const [result] = await pool.query(
    `INSERT INTO notifications (utilisateur_id, titre, message, type, lue)
     VALUES ?`,
    [values]
  );

  return { envoyees: result.affectedRows };
}

/**
 * Marque une notification comme lue.
 */
async function marquerLue(id) {
  await pool.query(
    "UPDATE notifications SET lue = 1 WHERE id = ?",
    [id]
  );
  return findById(id);
}

/**
 * Marque toutes les notifications d'un utilisateur comme lues.
 */
async function marquerToutesLues(utilisateurId) {
  const [result] = await pool.query(
    "UPDATE notifications SET lue = 1 WHERE utilisateur_id = ? AND lue = 0",
    [utilisateurId]
  );
  return result.affectedRows;
}

/**
 * Supprime une notification.
 */
async function delete_(id) {
  await pool.query("DELETE FROM notifications WHERE id = ?", [id]);
}

/**
 * Vérifie qu'un utilisateur existe.
 */
async function utilisateurExiste(id) {
  const [rows] = await pool.query(
    "SELECT id FROM utilisateurs WHERE id = ?",
    [id]
  );
  return rows.length > 0;
}

/**
 * Récupère tous les utilisateurs d'un rôle donné.
 */
async function trouverParRole(role) {
  const [rows] = await pool.query(
    "SELECT id FROM utilisateurs WHERE role = ? AND statut_compte = 'ACTIF'",
    [role]
  );
  return rows;
}

/**
 * Récupère tous les utilisateurs rattachés à un établissement.
 */
async function trouverParEtablissement(etablissementId) {
  const [rows] = await pool.query(
    `SELECT u.id
     FROM utilisateurs u
     LEFT JOIN personnels p ON p.id = u.id
     LEFT JOIN donneurs d ON d.id = u.id
     WHERE (p.etablissement_id = ? OR d.etablissement_id = ?)
       AND u.statut_compte = 'ACTIF'`,
    [etablissementId, etablissementId]
  );
  return rows;
}

module.exports = {
  findAllByUser,
  findNonLues,
  compterNonLues,
  findById,
  create,
  createMany,
  marquerLue,
  marquerToutesLues,
  delete: delete_,
  utilisateurExiste,
  trouverParRole,
  trouverParEtablissement,
};