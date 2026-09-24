const { pool, withTransaction } = require("../../config/db");

/**
 * Liste les dons avec filtres et pagination.
 */
async function findAll({
  statut,
  type_don,
  etablissement_id,
  date_debut,
  date_fin,
  page = 1,
  limite = 20,
} = {}) {
  let sql = `
    SELECT d.*,
        u.nom AS donneur_nom, u.prenom AS donneur_prenom,
        e.nom AS etablissement_nom,
        p.nom AS personnel_nom, p.prenom AS personnel_prenom,
        (SELECT COUNT(*) FROM poches WHERE don_id = d.id) AS nombre_poches
    FROM dons d
    INNER JOIN donneurs dn ON dn.id = d.donneur_id
    INNER JOIN utilisateurs u ON u.id = dn.id
    INNER JOIN etablissements e ON e.id = d.etablissement_id
    INNER JOIN personnels pe ON pe.id = d.personnel_id
    INNER JOIN utilisateurs p ON p.id = pe.id
    WHERE 1 = 1
  `;
  const params = [];

  if (statut) { sql += " AND d.statut = ?"; params.push(statut); }
  if (type_don) { sql += " AND d.type_don = ?"; params.push(type_don); }
  if (etablissement_id) { sql += " AND d.etablissement_id = ?"; params.push(etablissement_id); }
  if (date_debut) { sql += " AND d.date_don >= ?"; params.push(date_debut); }
  if (date_fin) { sql += " AND d.date_don <= ?"; params.push(date_fin); }

  sql += " ORDER BY d.date_don DESC LIMIT ? OFFSET ?";
  params.push(Number(limite), (Number(page) - 1) * Number(limite));

  const [rows] = await pool.query(sql, params);

  // Comptage total
  let countSql = "SELECT COUNT(*) AS total FROM dons WHERE 1 = 1";
  const countParams = [];
  if (statut) { countSql += " AND statut = ?"; countParams.push(statut); }
  if (type_don) { countSql += " AND type_don = ?"; countParams.push(type_don); }
  if (etablissement_id) { countSql += " AND etablissement_id = ?"; countParams.push(etablissement_id); }
  if (date_debut) { countSql += " AND date_don >= ?"; countParams.push(date_debut); }
  if (date_fin) { countSql += " AND date_don <= ?"; countParams.push(date_fin); }

  const [countRows] = await pool.query(countSql, countParams);

  return {
    dons: rows,
    total: countRows[0].total,
    page: Number(page),
    limite: Number(limite),
  };
}

/**
 * Récupère un don par son ID.
 */
async function findById(id) {
  const [rows] = await pool.query(
    `SELECT d.*, e.nom AS etablissement_nom,
            (SELECT COUNT(*) FROM poches WHERE don_id = d.id) AS nombre_poches
     FROM dons d
     INNER JOIN etablissements e ON e.id = d.etablissement_id
     WHERE d.id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Liste les dons d'un donneur.
 */
async function findByDonneurId(donneurId) {
  const [rows] = await pool.query(
    `SELECT d.*, e.nom AS etablissement_nom
     FROM dons d
     INNER JOIN etablissements e ON e.id = d.etablissement_id
     WHERE d.donneur_id = ?
     ORDER BY d.date_don DESC`,
    [donneurId]
  );
  return rows;
}

/**
 * Récupère le dernier don d'un donneur (pour vérifier le délai).
 */
async function findDernierDon(donneurId) {
  const [rows] = await pool.query(
    `SELECT * FROM dons
     WHERE donneur_id = ? AND statut IN ('ENREGISTRE', 'VALIDE')
     ORDER BY date_don DESC LIMIT 1`,
    [donneurId]
  );
  return rows[0] || null;
}

/**
 * Crée un nouveau don.
 */
async function create(donnees) {
  const {
    donneur_id,
    personnel_id,
    etablissement_id,
    date_don,
    type_don = "SANG_TOTAL",
    quantite,
  } = donnees;

  const [result] = await pool.query(
    `INSERT INTO dons
     (donneur_id, personnel_id, etablissement_id, date_don, type_don, quantite, statut)
     VALUES (?, ?, ?, ?, ?, ?, 'ENREGISTRE')`,
    [donneur_id, personnel_id, etablissement_id, date_don, type_don, quantite]
  );

  return findById(result.insertId);
}

/**
 * Valide un don et génère les poches associées (transaction).
 */
/**
 * Valide un don et génère les poches associées (transaction).
 */
async function validerEtGenererPoches(donId, don, utilisateurId) {
  return withTransaction(async (conn) => {
    // 1. Récupérer les infos du donneur (groupe sanguin + rhésus)
    const [donneurRows] = await conn.query(
      `SELECT groupe_sanguin, rhesus FROM donneurs WHERE id = ?`,
      [don.donneur_id]
    );

    if (donneurRows.length === 0) {
      const err = new Error("Donneur introuvable pour ce don");
      err.status = 404;
      err.code = "DONNEUR_INTROUVABLE";
      throw err;
    }

    const { groupe_sanguin, rhesus } = donneurRows[0];

    // 2. Passer le don au statut VALIDE
    await conn.query(
      "UPDATE dons SET statut = 'VALIDE' WHERE id = ?",
      [donId]
    );

    // 3. Générer les poches (1 poche par 250 ml)
    const volumeParPoche = 250;
    const nbPoches = Math.max(1, Math.ceil(don.quantite / volumeParPoche));

    // Date de péremption : +42 jours
    const dateCollecte = new Date(don.date_don);
    const datePeremption = new Date(dateCollecte);
    datePeremption.setDate(datePeremption.getDate() + 42);

    const pochesCreees = [];

    for (let i = 0; i < nbPoches; i++) {
      const codePoche = `PCH-${don.id}-${String(i + 1).padStart(3, "0")}-${Date.now()}`;

      const [insertResult] = await conn.query(
        `INSERT INTO poches
         (don_id, code_poche, groupe_sanguin, rhesus, type_produit,
          volume, date_collecte, date_peremption, statut,
          etablissement_id, personnel_responsable_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EN_CONTROLE', ?, ?)`,
        [
          donId,
          codePoche,
          groupe_sanguin,                 // ✅ Depuis la table donneurs
          rhesus,                          // ✅ Depuis la table donneurs
          don.type_don || "SANG_TOTAL",
          volumeParPoche,
          don.date_don,
          datePeremption.toISOString().slice(0, 10),
          don.etablissement_id,
          utilisateurId,
        ]
      );

      // Historique initial
      await conn.query(
        `INSERT INTO historique_poches
         (poche_id, ancien_statut, nouveau_statut, commentaire, utilisateur_id)
         VALUES (?, NULL, 'EN_CONTROLE', 'Poche générée par validation du don', ?)`,
        [insertResult.insertId, utilisateurId]
      );

      pochesCreees.push({ id: insertResult.insertId, code: codePoche });
    }

    return pochesCreees;
  });
}

/**
 * Rejette un don.
 */
async function rejeter(donId, motif) {
  await pool.query(
    "UPDATE dons SET statut = 'REJETE' WHERE id = ?",
    [donId]
  );
  return findById(donId);
}

/**
 * Supprime un don.
 */
async function delete_(id) {
  await pool.query("DELETE FROM dons WHERE id = ?", [id]);
}

/**
 * Liste les poches générées par un don.
 */
async function findPochesParDon(donId) {
  const [rows] = await pool.query(
    `SELECT id, code_poche, groupe_sanguin, rhesus, type_produit,
            volume, statut, date_collecte, date_peremption
     FROM poches
     WHERE don_id = ?
     ORDER BY id ASC`,
    [donId]
  );
  return rows;
}

module.exports = {
  findAll,
  findById,
  findByDonneurId,
  findDernierDon,
  create,
  validerEtGenererPoches,
  rejeter,
  delete: delete_,
  findPochesParDon,
};