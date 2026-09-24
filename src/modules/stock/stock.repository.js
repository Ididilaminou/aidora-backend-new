const { pool, withTransaction } = require("../../config/db");

/**
 * Liste les stocks avec filtres et pagination.
 */
async function findAll({
  etablissement_id,
  groupe_sanguin,
  rhesus,
  type_produit,
  en_alerte,
  page = 1,
  limite = 20,
} = {}) {
  let sql = `
    SELECT s.*, e.nom AS etablissement_nom
    FROM stocks s
    INNER JOIN etablissements e ON e.id = s.etablissement_id
    WHERE 1 = 1
  `;
  const params = [];

  if (etablissement_id) { sql += " AND s.etablissement_id = ?"; params.push(etablissement_id); }
  if (groupe_sanguin) { sql += " AND s.groupe_sanguin = ?"; params.push(groupe_sanguin); }
  if (rhesus) { sql += " AND s.rhesus = ?"; params.push(rhesus); }
  if (type_produit) { sql += " AND s.type_produit = ?"; params.push(type_produit); }
  if (en_alerte) { sql += " AND s.quantite <= s.seuil_alerte"; }

  sql += " ORDER BY s.quantite ASC LIMIT ? OFFSET ?";
  params.push(Number(limite), (Number(page) - 1) * Number(limite));

  const [rows] = await pool.query(sql, params);

  // Comptage total
  let countSql = "SELECT COUNT(*) AS total FROM stocks WHERE 1 = 1";
  const countParams = [];
  if (etablissement_id) { countSql += " AND etablissement_id = ?"; countParams.push(etablissement_id); }
  if (groupe_sanguin) { countSql += " AND groupe_sanguin = ?"; countParams.push(groupe_sanguin); }
  if (rhesus) { countSql += " AND rhesus = ?"; countParams.push(rhesus); }
  if (type_produit) { countSql += " AND type_produit = ?"; countParams.push(type_produit); }
  if (en_alerte) { countSql += " AND quantite <= seuil_alerte"; }

  const [countRows] = await pool.query(countSql, countParams);

  return {
    stocks: rows,
    total: countRows[0].total,
    page: Number(page),
    limite: Number(limite),
  };
}

/**
 * Récupère un stock par ID.
 */
async function findById(id) {
  const [rows] = await pool.query(
    `SELECT s.*, e.nom AS etablissement_nom
     FROM stocks s
     INNER JOIN etablissements e ON e.id = s.etablissement_id
     WHERE s.id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Récupère un stock par sa combinaison unique.
 */
async function findByCombinaison({ etablissement_id, groupe_sanguin, rhesus, type_produit }) {
  const [rows] = await pool.query(
    `SELECT * FROM stocks
     WHERE etablissement_id = ? AND groupe_sanguin = ?
       AND rhesus = ? AND type_produit = ?`,
    [etablissement_id, groupe_sanguin, rhesus, type_produit]
  );
  return rows[0] || null;
}

/**
 * Liste les stocks d'un établissement.
 */
async function findByEtablissement(etablissementId) {
  const [rows] = await pool.query(
    `SELECT * FROM stocks
     WHERE etablissement_id = ?
     ORDER BY type_produit, groupe_sanguin, rhesus`,
    [etablissementId]
  );
  return rows;
}

/**
 * Liste les stocks en alerte (sous le seuil).
 */
async function findEnAlerte(etablissementId = null) {
  let sql = `
    SELECT s.*, e.nom AS etablissement_nom
    FROM stocks s
    INNER JOIN etablissements e ON e.id = s.etablissement_id
    WHERE s.quantite <= s.seuil_alerte
  `;
  const params = [];

  if (etablissementId) {
    sql += " AND s.etablissement_id = ?";
    params.push(etablissementId);
  }

  sql += " ORDER BY (s.seuil_alerte - s.quantite) DESC";

  const [rows] = await pool.query(sql, params);
  return rows;
}

/**
 * Récupère les mouvements d'un stock.
 */
async function findMouvements(stockId) {
  const [rows] = await pool.query(
    `SELECT m.*, u.nom, u.prenom
     FROM mouvements_stock m
     LEFT JOIN utilisateurs u ON u.id = m.utilisateur_id
     WHERE m.stock_id = ?
     ORDER BY m.date_mouvement DESC`,
    [stockId]
  );
  return rows;
}

/**
 * Crée un nouveau stock.
 */
async function create(donnees) {
  const {
    etablissement_id,
    groupe_sanguin,
    rhesus,
    type_produit,
    quantite = 0,
    seuil_alerte = 5,
  } = donnees;

  const [result] = await pool.query(
    `INSERT INTO stocks
     (etablissement_id, groupe_sanguin, rhesus, type_produit, quantite, seuil_alerte)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [etablissement_id, groupe_sanguin, rhesus, type_produit, quantite, seuil_alerte]
  );

  return findById(result.insertId);
}

/**
 * Enregistre un mouvement (ENTREE ou SORTIE) + met à jour la quantité (transaction).
 */
async function mouvementTransactionnel(stockId, type, quantite, motif, utilisateurId) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      "SELECT quantite FROM stocks WHERE id = ? FOR UPDATE",
      [stockId]
    );

    const ancienneQuantite = rows[0].quantite;
    const nouvelleQuantite =
      type === "ENTREE" ? ancienneQuantite + quantite : ancienneQuantite - quantite;

    await conn.query(
      "UPDATE stocks SET quantite = ? WHERE id = ?",
      [nouvelleQuantite, stockId]
    );

    await conn.query(
      `INSERT INTO mouvements_stock
       (stock_id, type_mouvement, quantite, motif, utilisateur_id)
       VALUES (?, ?, ?, ?, ?)`,
      [stockId, type, quantite, motif, utilisateurId]
    );

    const [updated] = await conn.query("SELECT * FROM stocks WHERE id = ?", [stockId]);
    return updated[0];
  });
}

/**
 * Ajustement manuel (remplace la quantité).
 */
async function ajustementTransactionnel(stockId, nouvelleQuantite, motif, utilisateurId) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      "SELECT quantite FROM stocks WHERE id = ? FOR UPDATE",
      [stockId]
    );

    const ancienneQuantite = rows[0].quantite;
    const difference = nouvelleQuantite - ancienneQuantite;

    await conn.query(
      "UPDATE stocks SET quantite = ? WHERE id = ?",
      [nouvelleQuantite, stockId]
    );

    await conn.query(
      `INSERT INTO mouvements_stock
       (stock_id, type_mouvement, quantite, motif, utilisateur_id)
       VALUES (?, 'AJUSTEMENT', ?, ?, ?)`,
      [stockId, difference, motif, utilisateurId]
    );

    const [updated] = await conn.query("SELECT * FROM stocks WHERE id = ?", [stockId]);
    return updated[0];
  });
}

/**
 * Modifie le seuil d'alerte.
 */
async function updateSeuil(id, seuilAlerte) {
  await pool.query(
    "UPDATE stocks SET seuil_alerte = ? WHERE id = ?",
    [seuilAlerte, id]
  );
  return findById(id);
}

/**
 * Supprime un stock.
 */
async function delete_(id) {
  await pool.query("DELETE FROM stocks WHERE id = ?", [id]);
}

module.exports = {
  findAll,
  findById,
  findByCombinaison,
  findByEtablissement,
  findEnAlerte,
  findMouvements,
  create,
  mouvementTransactionnel,
  ajustementTransactionnel,
  updateSeuil,
  delete: delete_,
};