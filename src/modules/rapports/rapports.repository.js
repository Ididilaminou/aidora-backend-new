const { pool } = require("../../config/db");

/**
 * Liste les rapports avec filtres et pagination.
 */
async function findAll({
  personnel_id,
  type,
  format_export,
  page = 1,
  limite = 20,
} = {}) {
  let sql = `
    SELECT r.id, r.personnel_id, r.type, r.date_generation, r.format_export,
           u.nom, u.prenom
    FROM rapports r
    INNER JOIN personnels p ON p.id = r.personnel_id
    INNER JOIN utilisateurs u ON u.id = p.id
    WHERE 1 = 1
  `;
  const params = [];

  if (personnel_id) { sql += " AND r.personnel_id = ?"; params.push(personnel_id); }
  if (type) { sql += " AND r.type = ?"; params.push(type); }
  if (format_export) { sql += " AND r.format_export = ?"; params.push(format_export); }

  sql += " ORDER BY r.date_generation DESC LIMIT ? OFFSET ?";
  params.push(Number(limite), (Number(page) - 1) * Number(limite));

  const [rows] = await pool.query(sql, params);

  // Comptage total
  let countSql = "SELECT COUNT(*) AS total FROM rapports WHERE 1 = 1";
  const countParams = [];
  if (personnel_id) { countSql += " AND personnel_id = ?"; countParams.push(personnel_id); }
  if (type) { countSql += " AND type = ?"; countParams.push(type); }
  if (format_export) { countSql += " AND format_export = ?"; countParams.push(format_export); }

  const [countRows] = await pool.query(countSql, countParams);

  return {
    rapports: rows,
    total: countRows[0].total,
    page: Number(page),
    limite: Number(limite),
  };
}

/**
 * Récupère un rapport par ID (avec le contenu).
 */
async function findById(id) {
  const [rows] = await pool.query(
    "SELECT * FROM rapports WHERE id = ?",
    [id]
  );
  return rows[0] || null;
}

/**
 * Crée un rapport.
 */
async function create(donnees) {
  const { personnel_id, type, format_export, contenu } = donnees;
  const [result] = await pool.query(
    `INSERT INTO rapports (personnel_id, type, format_export, contenu)
     VALUES (?, ?, ?, ?)`,
    [personnel_id, type, format_export, contenu]
  );
  return findById(result.insertId);
}

/**
 * Supprime un rapport.
 */
async function delete_(id) {
  await pool.query("DELETE FROM rapports WHERE id = ?", [id]);
}

// ============================================
// COLLECTE DES DONNÉES PAR TYPE DE RAPPORT
// ============================================

async function donneesDons(etablissementId, dateDebut, dateFin) {
  let sql = `
    SELECT d.id, d.date_don, d.type_don, d.quantite, d.statut,
           u.nom AS donneur_nom, u.prenom AS donneur_prenom,
           e.nom AS etablissement_nom
    FROM dons d
    INNER JOIN donneurs dn ON dn.id = d.donneur_id
    INNER JOIN utilisateurs u ON u.id = dn.id
    INNER JOIN etablissements e ON e.id = d.etablissement_id
    WHERE 1 = 1
  `;
  const params = [];

  if (etablissementId) { sql += " AND d.etablissement_id = ?"; params.push(etablissementId); }
  if (dateDebut) { sql += " AND d.date_don >= ?"; params.push(dateDebut); }
  if (dateFin) { sql += " AND d.date_don <= ?"; params.push(dateFin); }

  sql += " ORDER BY d.date_don DESC";

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function donneesDemandes(etablissementId, dateDebut, dateFin) {
  let sql = `
    SELECT ds.id, ds.date_demande, ds.groupe_sanguin, ds.rhesus,
           ds.type_produit, ds.quantite_demandee, ds.urgence, ds.statut,
           ed.nom AS demandeur_nom, es.nom AS destinataire_nom
    FROM demandes_sang ds
    INNER JOIN etablissements ed ON ed.id = ds.etablissement_demandeur_id
    LEFT JOIN etablissements es ON es.id = ds.etablissement_destinataire_id
    WHERE 1 = 1
  `;
  const params = [];

  if (etablissementId) {
    sql += " AND (ds.etablissement_demandeur_id = ? OR ds.etablissement_destinataire_id = ?)";
    params.push(etablissementId, etablissementId);
  }
  if (dateDebut) { sql += " AND ds.date_demande >= ?"; params.push(dateDebut); }
  if (dateFin) { sql += " AND ds.date_demande <= ?"; params.push(dateFin); }

  sql += " ORDER BY ds.date_demande DESC";

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function donneesStocks(etablissementId) {
  let sql = `
    SELECT s.id, s.groupe_sanguin, s.rhesus, s.type_produit,
           s.quantite, s.seuil_alerte, s.date_mise_a_jour,
           e.nom AS etablissement_nom
    FROM stocks s
    INNER JOIN etablissements e ON e.id = s.etablissement_id
    WHERE 1 = 1
  `;
  const params = [];

  if (etablissementId) { sql += " AND s.etablissement_id = ?"; params.push(etablissementId); }

  sql += " ORDER BY s.quantite ASC";

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function donneesPersonnels(etablissementId) {
  let sql = `
    SELECT u.id, u.nom, u.prenom, u.email, u.telephone, u.role, u.statut_compte,
           p.fonction, e.nom AS etablissement_nom
    FROM personnels p
    INNER JOIN utilisateurs u ON u.id = p.id
    LEFT JOIN etablissements e ON e.id = p.etablissement_id
    WHERE 1 = 1
  `;
  const params = [];

  if (etablissementId) { sql += " AND p.etablissement_id = ?"; params.push(etablissementId); }

  sql += " ORDER BY u.nom, u.prenom";

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function donneesEtablissements() {
  const [rows] = await pool.query(
    `SELECT id, nom, type, ville, region, telephone, email, statut, created_at
     FROM etablissements
     ORDER BY nom`
  );
  return rows;
}

async function donneesAudit(dateDebut, dateFin) {
  let sql = `
    SELECT ja.id, ja.action, ja.date_action, ja.adresse_ip,
           u.nom, u.prenom
    FROM journal_audit ja
    LEFT JOIN utilisateurs u ON u.id = ja.utilisateur_id
    WHERE 1 = 1
  `;
  const params = [];

  if (dateDebut) { sql += " AND ja.date_action >= ?"; params.push(dateDebut); }
  if (dateFin) { sql += " AND ja.date_action <= ?"; params.push(dateFin); }

  sql += " ORDER BY ja.date_action DESC";

  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = {
  findAll,
  findById,
  create,
  delete: delete_,
  donneesDons,
  donneesDemandes,
  donneesStocks,
  donneesPersonnels,
  donneesEtablissements,
  donneesAudit,
};