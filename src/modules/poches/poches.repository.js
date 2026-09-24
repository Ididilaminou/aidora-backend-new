const { pool, withTransaction } = require("../../config/db");

/**
 * Liste les poches avec filtres et pagination.
 */
async function findAll({
  statut,
  type_produit,
  groupe_sanguin,
  rhesus,
  etablissement_id,
  page = 1,
  limite = 20,
} = {}) {
  let sql = `
    SELECT p.*, e.nom AS etablissement_nom
    FROM poches p
    INNER JOIN etablissements e ON e.id = p.etablissement_id
    WHERE 1 = 1
  `;
  const params = [];

  if (statut) { sql += " AND p.statut = ?"; params.push(statut); }
  if (type_produit) { sql += " AND p.type_produit = ?"; params.push(type_produit); }
  if (groupe_sanguin) { sql += " AND p.groupe_sanguin = ?"; params.push(groupe_sanguin); }
  if (rhesus) { sql += " AND p.rhesus = ?"; params.push(rhesus); }
  if (etablissement_id) { sql += " AND p.etablissement_id = ?"; params.push(etablissement_id); }

  sql += " ORDER BY p.date_collecte DESC LIMIT ? OFFSET ?";
  params.push(Number(limite), (Number(page) - 1) * Number(limite));

  const [rows] = await pool.query(sql, params);

  // Comptage total
  let countSql = "SELECT COUNT(*) AS total FROM poches WHERE 1 = 1";
  const countParams = [];
  if (statut) { countSql += " AND statut = ?"; countParams.push(statut); }
  if (type_produit) { countSql += " AND type_produit = ?"; countParams.push(type_produit); }
  if (groupe_sanguin) { countSql += " AND groupe_sanguin = ?"; countParams.push(groupe_sanguin); }
  if (rhesus) { countSql += " AND rhesus = ?"; countParams.push(rhesus); }
  if (etablissement_id) { countSql += " AND etablissement_id = ?"; countParams.push(etablissement_id); }

  const [countRows] = await pool.query(countSql, countParams);

  return {
    poches: rows,
    total: countRows[0].total,
    page: Number(page),
    limite: Number(limite),
  };
}

/**
 * Récupère une poche par son ID.
 */
async function findById(id) {
  const [rows] = await pool.query(
    `SELECT p.*, e.nom AS etablissement_nom
     FROM poches p
     INNER JOIN etablissements e ON e.id = p.etablissement_id
     WHERE p.id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Recherche une poche par son code unique.
 */
async function findByCode(code) {
  const [rows] = await pool.query(
    "SELECT * FROM poches WHERE code_poche = ?",
    [code]
  );
  return rows[0] || null;
}

/**
 * Récupère l'historique complet d'une poche.
 */
async function findHistorique(pocheId) {
  const [rows] = await pool.query(
    `SELECT h.*, u.nom, u.prenom
     FROM historique_poches h
     LEFT JOIN utilisateurs u ON u.id = h.utilisateur_id
     WHERE h.poche_id = ?
     ORDER BY h.date_changement DESC`,
    [pocheId]
  );
  return rows;
}

/**
 * Crée une poche + son historique initial (transaction atomique).
 */
async function createAvecHistorique(donnees, utilisateurId) {
  return withTransaction(async (conn) => {
    const {
      don_id,
      code_poche,
      groupe_sanguin,
      rhesus,
      type_produit,
      volume,
      date_collecte,
      date_peremption,
      etablissement_id,
      personnel_responsable_id,
    } = donnees;

    const [result] = await conn.query(
      `INSERT INTO poches
       (don_id, code_poche, groupe_sanguin, rhesus, type_produit,
        volume, date_collecte, date_peremption, statut,
        etablissement_id, personnel_responsable_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EN_CONTROLE', ?, ?)`,
      [
        don_id, code_poche, groupe_sanguin, rhesus, type_produit,
        volume, date_collecte, date_peremption,
        etablissement_id, personnel_responsable_id || null,
      ]
    );

    const pocheId = result.insertId;

    // Historique initial
    await conn.query(
      `INSERT INTO historique_poches
       (poche_id, ancien_statut, nouveau_statut, commentaire, utilisateur_id)
       VALUES (?, NULL, 'EN_CONTROLE', 'Création de la poche', ?)`,
      [pocheId, utilisateurId]
    );

    // Récupérer la poche créée (via la même connexion pour cohérence)
    const [pocheRows] = await conn.query(
      "SELECT * FROM poches WHERE id = ?",
      [pocheId]
    );

    return pocheRows[0];
  });
}

/**
 * Change le statut d'une poche + enregistre l'historique.
 */
async function changerStatutAvecHistorique(pocheId, ancienStatut, nouveauStatut, commentaire, utilisateurId) {
  return withTransaction(async (conn) => {
    await conn.query(
      "UPDATE poches SET statut = ? WHERE id = ?",
      [nouveauStatut, pocheId]
    );

    await conn.query(
      `INSERT INTO historique_poches
       (poche_id, ancien_statut, nouveau_statut, commentaire, utilisateur_id)
       VALUES (?, ?, ?, ?, ?)`,
      [pocheId, ancienStatut, nouveauStatut, commentaire, utilisateurId]
    );

    const [rows] = await conn.query("SELECT * FROM poches WHERE id = ?", [pocheId]);
    return rows[0];
  });
}

/**
 * Marque une poche comme vendue + historique.
 */
async function vendreAvecHistorique(pocheId, prixVente, dateVente, utilisateurId) {
  return withTransaction(async (conn) => {
    const [pocheRows] = await conn.query(
      "SELECT statut FROM poches WHERE id = ?",
      [pocheId]
    );
    const ancienStatut = pocheRows[0]?.statut || "DISPONIBLE";

    await conn.query(
      `UPDATE poches
       SET statut = 'VENDUE', prix_vente = ?, date_vente = ?
       WHERE id = ?`,
      [prixVente, dateVente, pocheId]
    );

    await conn.query(
      `INSERT INTO historique_poches
       (poche_id, ancien_statut, nouveau_statut, commentaire, utilisateur_id)
       VALUES (?, ?, 'VENDUE', 'Poche vendue', ?)`,
      [pocheId, ancienStatut, utilisateurId]
    );

    const [rows] = await conn.query("SELECT * FROM poches WHERE id = ?", [pocheId]);
    return rows[0];
  });
}

/**
 * Supprime une poche (cascade sur l'historique).
 */
async function delete_(id) {
  await pool.query("DELETE FROM poches WHERE id = ?", [id]);
}

/**
 * Groupe les poches par "lot" (préfixe du code).
 * Le préfixe = code_poche sans le "-XXX" final.
 */
async function findLots({ etablissement_id, statut } = {}) {
  let sql = `
    SELECT
      SUBSTRING_INDEX(code_poche, '-', -1) AS numero_seq,
      SUBSTRING(code_poche, 1, CHAR_LENGTH(code_poche) - CHAR_LENGTH(SUBSTRING_INDEX(code_poche, '-', -1)) - 1) AS prefixe,
      p.*
    FROM poches p
    WHERE 1 = 1
  `;
  const params = [];

  if (etablissement_id) {
    sql += " AND p.etablissement_id = ?";
    params.push(etablissement_id);
  }

  const [rows] = await pool.query(sql, params);

  // Regroupement côté Node (plus simple que SQL)
  const lotsMap = new Map();

  for (const p of rows) {
    const cle = p.prefixe;
    if (!lotsMap.has(cle)) {
      lotsMap.set(cle, {
        prefixe: cle,
        total: 0,
        disponibles: 0,
        en_controle: 0,
        reservees: 0,
        vendues: 0,
        distribuees: 0,
        perimees: 0,
        rejetees: 0,
        groupe_sanguin: p.groupe_sanguin,
        rhesus: p.rhesus,
        type_produit: p.type_produit,
        volume_unitaire: p.volume,
        date_collecte_min: p.date_collecte,
        date_peremption_max: p.date_peremption,
        etablissement_id: p.etablissement_id,
        etablissement_nom: p.etablissement_nom,
        poches: [],
      });
    }

    const lot = lotsMap.get(cle);
    lot.total++;
    if (p.statut === "DISPONIBLE")  lot.disponibles++;
    if (p.statut === "EN_CONTROLE") lot.en_controle++;
    if (p.statut === "RESERVEE")    lot.reservees++;
    if (p.statut === "VENDUE")      lot.vendues++;
    if (p.statut === "DISTRIBUEE")  lot.distribuees++;
    if (p.statut === "PERIMEE")     lot.perimees++;
    if (p.statut === "REJETEE")     lot.rejetees++;

    // On garde les infos principales du lot
    if (new Date(p.date_collecte) < new Date(lot.date_collecte_min)) {
      lot.date_collecte_min = p.date_collecte;
    }
    if (new Date(p.date_peremption) > new Date(lot.date_peremption_max)) {
      lot.date_peremption_max = p.date_peremption;
    }

    lot.poches.push({
      id: p.id,
      code_poche: p.code_poche,
      statut: p.statut,
      don_id: p.don_id,
    });
  }

  let lots = Array.from(lotsMap.values());

  // Filtre par statut si demandé
  if (statut === "DISPONIBLE") {
    lots = lots.filter((l) => l.disponibles > 0);
  }

  // Tri par date de collecte (plus récent en premier)
  lots.sort(
    (a, b) => new Date(b.date_collecte_min) - new Date(a.date_collecte_min)
  );

  return lots;
}



module.exports = {
  findAll,
  findById,
  findByCode,
  findHistorique,
  createAvecHistorique,
  changerStatutAvecHistorique,
  vendreAvecHistorique,
  delete: delete_,
  findLots,
};