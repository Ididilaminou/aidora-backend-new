const { pool, withTransaction } = require("../../config/db");

/**
 * Liste les demandes avec filtres et pagination.
 */
async function findAll({
  statut,
  urgence,
  type_produit,
  groupe_sanguin,
  rhesus,
  etablissement_demandeur_id,
  etablissement_destinataire_id,
  page = 1,
  limite = 20,
} = {}) {
  let sql = `
    SELECT d.*,
           ed.nom AS demandeur_nom, ed.ville AS demandeur_ville,
           es.nom AS destinataire_nom,
           p.nom AS traitant_nom, p.prenom AS traitant_prenom
    FROM demandes_sang d
    INNER JOIN etablissements ed ON ed.id = d.etablissement_demandeur_id
    LEFT JOIN etablissements es ON es.id = d.etablissement_destinataire_id
    LEFT JOIN personnels pe ON pe.id = d.personnel_traitant_id
    LEFT JOIN utilisateurs p ON p.id = pe.id
    WHERE 1 = 1
  `;
  const params = [];

  if (statut) { sql += " AND d.statut = ?"; params.push(statut); }
  if (urgence !== undefined) { sql += " AND d.urgence = ?"; params.push(urgence); }
  if (type_produit) { sql += " AND d.type_produit = ?"; params.push(type_produit); }
  if (groupe_sanguin) { sql += " AND d.groupe_sanguin = ?"; params.push(groupe_sanguin); }
  if (rhesus) { sql += " AND d.rhesus = ?"; params.push(rhesus); }
  if (etablissement_demandeur_id) {
    sql += " AND d.etablissement_demandeur_id = ?";
    params.push(etablissement_demandeur_id);
  }
  if (etablissement_destinataire_id) {
    sql += " AND (d.etablissement_destinataire_id = ? OR d.etablissement_destinataire_id IS NULL)";
    params.push(etablissement_destinataire_id);
  }

  sql += " ORDER BY d.urgence DESC, d.date_demande DESC LIMIT ? OFFSET ?";
  params.push(Number(limite), (Number(page) - 1) * Number(limite));

  const [rows] = await pool.query(sql, params);

  // Comptage total
  let countSql = "SELECT COUNT(*) AS total FROM demandes_sang WHERE 1 = 1";
  const countParams = [];
  if (statut) { countSql += " AND statut = ?"; countParams.push(statut); }
  if (urgence !== undefined) { countSql += " AND urgence = ?"; countParams.push(urgence); }
  if (type_produit) { countSql += " AND type_produit = ?"; countParams.push(type_produit); }
  if (groupe_sanguin) { countSql += " AND groupe_sanguin = ?"; countParams.push(groupe_sanguin); }
  if (rhesus) { countSql += " AND rhesus = ?"; countParams.push(rhesus); }
  if (etablissement_demandeur_id) {
    countSql += " AND etablissement_demandeur_id = ?";
    countParams.push(etablissement_demandeur_id);
  }
  if (etablissement_destinataire_id) {
    countSql += " AND (etablissement_destinataire_id = ? OR etablissement_destinataire_id IS NULL)";
    countParams.push(etablissement_destinataire_id);
  }

  const [countRows] = await pool.query(countSql, countParams);

  return {
    demandes: rows,
    total: countRows[0].total,
    page: Number(page),
    limite: Number(limite),
  };
}

/**
 * Récupère une demande par ID.
 */
async function findById(id) {
  const [rows] = await pool.query(
    `SELECT d.*,
            ed.nom AS demandeur_nom,
            es.nom AS destinataire_nom
     FROM demandes_sang d
     INNER JOIN etablissements ed ON ed.id = d.etablissement_demandeur_id
     LEFT JOIN etablissements es ON es.id = d.etablissement_destinataire_id
     WHERE d.id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Historique d'une demande.
 */
async function findHistorique(demandeId) {
  const [rows] = await pool.query(
    `SELECT h.*, u.nom, u.prenom
     FROM historique_demandes_sang h
     LEFT JOIN utilisateurs u ON u.id = h.utilisateur_id
     WHERE h.demande_sang_id = ?
     ORDER BY h.date_changement DESC`,
    [demandeId]
  );
  return rows;
}

/**
 * Vérifie qu'un établissement existe.
 */
async function etablissementExiste(id) {
  const [rows] = await pool.query(
    "SELECT id FROM etablissements WHERE id = ?",
    [id]
  );
  return rows.length > 0;
}

/**
 * Crée une demande + historique initial (transaction).
 */
async function createAvecHistorique(donnees, utilisateurId) {
  return withTransaction(async (conn) => {
    const {
      etablissement_demandeur_id,
      etablissement_destinataire_id = null,
      groupe_sanguin,
      rhesus,
      type_produit,
      quantite_demandee,
      urgence = false,
      motif,
    } = donnees;

    const [result] = await conn.query(
      `INSERT INTO demandes_sang
       (etablissement_demandeur_id, etablissement_destinataire_id,
        groupe_sanguin, rhesus, type_produit,
        quantite_demandee, urgence, motif, statut)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE')`,
      [
        etablissement_demandeur_id,
        etablissement_destinataire_id,
        groupe_sanguin,
        rhesus,
        type_produit,
        quantite_demandee,
        urgence ? 1 : 0,
        motif,
      ]
    );

    const demandeId = result.insertId;

    // Historique initial
    await conn.query(
      `INSERT INTO historique_demandes_sang
       (demande_sang_id, utilisateur_id, ancien_statut, nouveau_statut, commentaire)
       VALUES (?, ?, 'EN_ATTENTE', 'EN_ATTENTE', 'Création de la demande')`,
      [demandeId, utilisateurId]
    );

    const [rows] = await conn.query(
      "SELECT * FROM demandes_sang WHERE id = ?",
      [demandeId]
    );

    return rows[0];
  });
}

/**
 * Change le statut d'une demande + historique.
 */
async function changerStatutAvecHistorique(
  demandeId,
  ancienStatut,
  nouveauStatut,
  commentaire,
  utilisateurId,
  extras = {}
) {
  return withTransaction(async (conn) => {
    const setClauses = ["statut = ?"];
    const params = [nouveauStatut];

    if (nouveauStatut !== "EN_ATTENTE" && nouveauStatut !== "EN_COURS") {
      setClauses.push("date_traitement = NOW()");
    }

    if (extras.etablissement_destinataire_id !== undefined) {
      setClauses.push("etablissement_destinataire_id = ?");
      params.push(extras.etablissement_destinataire_id);
    }

    if (extras.personnel_traitant_id !== undefined) {
      setClauses.push("personnel_traitant_id = ?");
      params.push(extras.personnel_traitant_id);
    }

    params.push(demandeId);

    await conn.query(
      `UPDATE demandes_sang SET ${setClauses.join(", ")} WHERE id = ?`,
      params
    );

    await conn.query(
      `INSERT INTO historique_demandes_sang
       (demande_sang_id, utilisateur_id, ancien_statut, nouveau_statut, commentaire)
       VALUES (?, ?, ?, ?, ?)`,
      [demandeId, utilisateurId, ancienStatut, nouveauStatut, commentaire || null]
    );

    const [rows] = await conn.query(
      "SELECT * FROM demandes_sang WHERE id = ?",
      [demandeId]
    );
    return rows[0];
  });
}

/**
 * Livraison transactionnelle : déduit du stock + crée distribution + change statut.
 */
async function livrerTransactionnel(demandeId, demande, utilisateurId, etablissementId) {
  return withTransaction(async (conn) => {
    // 1. Récupérer et verrouiller le stock
    const [stockRows] = await conn.query(
      `SELECT * FROM stocks
       WHERE etablissement_id = ?
         AND groupe_sanguin = ?
         AND rhesus = ?
         AND type_produit = ?
       FOR UPDATE`,
      [
        etablissementId,
        demande.groupe_sanguin,
        demande.rhesus,
        demande.type_produit,
      ]
    );

    if (stockRows.length === 0) {
      throw new Error("STOCK_INTROUVABLE");
    }

    const stock = stockRows[0];

    if (stock.quantite < demande.quantite_demandee) {
      throw new Error("STOCK_INSUFFISANT");
    }

    // 2. Déduire la quantité
    await conn.query(
      "UPDATE stocks SET quantite = quantite - ? WHERE id = ?",
      [demande.quantite_demandee, stock.id]
    );

    // 3. Enregistrer le mouvement
    await conn.query(
      `INSERT INTO mouvements_stock
       (stock_id, type_mouvement, quantite, motif, utilisateur_id)
       VALUES (?, 'SORTIE', ?, ?, ?)`,
      [stock.id, demande.quantite_demandee, `Livraison demande #${demandeId}`, utilisateurId]
    );

    // 4. Mettre à jour la demande
    await conn.query(
      `UPDATE demandes_sang
       SET statut = 'LIVREE',
           date_traitement = NOW(),
           etablissement_destinataire_id = ?,
           personnel_traitant_id = ?
       WHERE id = ?`,
      [etablissementId, utilisateurId, demandeId]
    );

    // 5. Historique
    await conn.query(
      `INSERT INTO historique_demandes_sang
       (demande_sang_id, utilisateur_id, ancien_statut, nouveau_statut, commentaire)
       VALUES (?, ?, 'ACCEPTEE', 'LIVREE', 'Demande livrée')`,
      [demandeId, utilisateurId]
    );

    // 6. Créer une distribution
    const [distResult] = await conn.query(
      `INSERT INTO distributions
       (demande_id, quantite, statut, personnel_distributeur_id)
       VALUES (?, ?, 'EN_TRANSIT', ?)`,
      [demandeId, demande.quantite_demandee, utilisateurId]
    );

    const [updatedRows] = await conn.query(
      "SELECT * FROM demandes_sang WHERE id = ?",
      [demandeId]
    );

    return {
      demande: updatedRows[0],
      distribution_id: distResult.insertId,
    };
  });
}

module.exports = {
  findAll,
  findById,
  findHistorique,
  etablissementExiste,
  createAvecHistorique,
  changerStatutAvecHistorique,
  livrerTransactionnel,
};