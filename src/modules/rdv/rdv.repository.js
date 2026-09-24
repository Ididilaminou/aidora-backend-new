const { pool, withTransaction } = require("../../config/db");

// ============================================
// CRÉNEAUX
// ============================================

async function findAllCreneaux({ etablissement_id, date_debut, date_fin, est_actif = true } = {}) {
  let sql = `
    SELECT c.*, e.nom AS etablissement_nom, e.ville AS etablissement_ville
    FROM creneaux_rdv c
    INNER JOIN etablissements e ON e.id = c.etablissement_id
    WHERE 1 = 1
  `;
  const params = [];

  if (etablissement_id) { sql += " AND c.etablissement_id = ?"; params.push(etablissement_id); }
  if (date_debut) { sql += " AND c.date_creneau >= ?"; params.push(date_debut); }
  if (date_fin) { sql += " AND c.date_creneau <= ?"; params.push(date_fin); }
  if (est_actif !== undefined) { sql += " AND c.est_actif = ?"; params.push(est_actif ? 1 : 0); }

  sql += " ORDER BY c.date_creneau ASC, c.heure_debut ASC";

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function findCreneauById(id) {
  const [rows] = await pool.query(
    `SELECT c.*, e.nom AS etablissement_nom
     FROM creneaux_rdv c
     INNER JOIN etablissements e ON e.id = c.etablissement_id
     WHERE c.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function createCreneau(data) {
  const [result] = await pool.query(
    `INSERT INTO creneaux_rdv
      (etablissement_id, date_creneau, heure_debut, heure_fin, capacite_max, places_restantes, est_actif)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.etablissement_id,
      data.date_creneau,
      data.heure_debut,
      data.heure_fin,
      data.capacite_max,
      data.capacite_max,
      data.est_actif !== false ? 1 : 0,
    ]
  );
  return findCreneauById(result.insertId);
}

async function updateCreneau(id, data) {
  const fields = [];
  const params = [];

  if (data.date_creneau !== undefined) { fields.push("date_creneau = ?"); params.push(data.date_creneau); }
  if (data.heure_debut !== undefined) { fields.push("heure_debut = ?"); params.push(data.heure_debut); }
  if (data.heure_fin !== undefined) { fields.push("heure_fin = ?"); params.push(data.heure_fin); }
  if (data.capacite_max !== undefined) { fields.push("capacite_max = ?"); params.push(data.capacite_max); }
  if (data.est_actif !== undefined) { fields.push("est_actif = ?"); params.push(data.est_actif ? 1 : 0); }

  if (fields.length === 0) return findCreneauById(id);

  params.push(id);
  await pool.query(
    `UPDATE creneaux_rdv SET ${fields.join(", ")} WHERE id = ?`,
    params
  );
  return findCreneauById(id);
}

async function deleteCreneau(id) {
  await pool.query("DELETE FROM creneaux_rdv WHERE id = ?", [id]);
}

// ============================================
// RENDEZ-VOUS
// ============================================

async function findAllRdv({ donneur_id, etablissement_id, statut, date_debut, date_fin, page = 1, limite = 20 } = {}) {
  let sql = `
    SELECT r.*,
           u.nom AS donneur_nom, u.prenom AS donneur_prenom,
           u.email AS donneur_email, u.telephone AS donneur_telephone,
           e.nom AS etablissement_nom, e.ville AS etablissement_ville
    FROM rendez_vous r
    INNER JOIN donneurs d ON d.id = r.donneur_id
    INNER JOIN utilisateurs u ON u.id = d.id
    INNER JOIN etablissements e ON e.id = r.etablissement_id
    WHERE 1 = 1
  `;
  const params = [];

  if (donneur_id) { sql += " AND r.donneur_id = ?"; params.push(donneur_id); }
  if (etablissement_id) { sql += " AND r.etablissement_id = ?"; params.push(etablissement_id); }
  if (statut) { sql += " AND r.statut = ?"; params.push(statut); }
  if (date_debut) { sql += " AND r.date_rendez_vous >= ?"; params.push(date_debut); }
  if (date_fin) { sql += " AND r.date_rendez_vous <= ?"; params.push(date_fin); }

  sql += " ORDER BY r.date_rendez_vous DESC, r.heure_rendez_vous DESC LIMIT ? OFFSET ?";
  params.push(Number(limite), (Number(page) - 1) * Number(limite));

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function findRdvById(id) {
  const [rows] = await pool.query(
    `SELECT r.*,
            u.nom AS donneur_nom, u.prenom AS donneur_prenom,
            u.email AS donneur_email, u.telephone AS donneur_telephone,
            e.nom AS etablissement_nom
     FROM rendez_vous r
     INNER JOIN donneurs d ON d.id = r.donneur_id
     INNER JOIN utilisateurs u ON u.id = d.id
     INNER JOIN etablissements e ON e.id = r.etablissement_id
     WHERE r.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function findRdvActifDonneur(donneurId) {
  const [rows] = await pool.query(
    `SELECT * FROM rendez_vous
     WHERE donneur_id = ?
       AND statut IN ('PLANIFIE', 'CONFIRME')
     ORDER BY date_rendez_vous ASC
     LIMIT 1`,
    [donneurId]
  );
  return rows[0] || null;
}

async function createRdvTransactionnel(data) {
  return withTransaction(async (conn) => {
    // Verrouiller le créneau
    const [creneaux] = await conn.query(
      "SELECT * FROM creneaux_rdv WHERE id = ? FOR UPDATE",
      [data.creneau_id]
    );

    if (creneaux.length === 0) {
      const err = new Error("Créneau introuvable");
      err.status = 404;
      err.code = "CRENEAU_INTROUVABLE";
      throw err;
    }

    const creneau = creneaux[0];

    if (!creneau.est_actif) {
      const err = new Error("Ce créneau n'est plus disponible");
      err.status = 400;
      err.code = "CRENEAU_INACTIF";
      throw err;
    }

    if (creneau.places_restantes <= 0) {
      const err = new Error("Ce créneau est complet");
      err.status = 400;
      err.code = "CRENEAU_COMPLET";
      throw err;
    }

    // Vérifier qu'il n'y a pas déjà un RDV à ce créneau pour ce donneur
    const [existants] = await conn.query(
      `SELECT id FROM rendez_vous
       WHERE donneur_id = ? AND creneau_id = ?
         AND statut IN ('PLANIFIE', 'CONFIRME')`,
      [data.donneur_id, data.creneau_id]
    );

    if (existants.length > 0) {
      const err = new Error("Vous avez déjà un rendez-vous à ce créneau");
      err.status = 409;
      err.code = "RDV_DEJA_EXISTANT";
      throw err;
    }

    // Créer le RDV
    const [result] = await conn.query(
      `INSERT INTO rendez_vous
        (donneur_id, etablissement_id, creneau_id,
         date_rendez_vous, heure_rendez_vous, statut, commentaire)
       VALUES (?, ?, ?, ?, ?, 'PLANIFIE', ?)`,
      [
        data.donneur_id,
        creneau.etablissement_id,
        data.creneau_id,
        creneau.date_creneau,
        creneau.heure_debut,
        data.commentaire || null,
      ]
    );

    // Décrémenter les places
    await conn.query(
      "UPDATE creneaux_rdv SET places_restantes = places_restantes - 1 WHERE id = ?",
      [data.creneau_id]
    );

    const [rows] = await conn.query(
      "SELECT * FROM rendez_vous WHERE id = ?",
      [result.insertId]
    );
    return rows[0];
  });
}

async function updateStatutRdv(id, statut, motifAnnulation = null) {
  await pool.query(
    `UPDATE rendez_vous
     SET statut = ?, motif_annulation = ?
     WHERE id = ?`,
    [statut, motifAnnulation, id]
  );
  return findRdvById(id);
}

async function libererPlace(creneauId) {
  await pool.query(
    "UPDATE creneaux_rdv SET places_restantes = places_restantes + 1 WHERE id = ? AND places_restantes < capacite_max",
    [creneauId]
  );
}

module.exports = {
  // Créneaux
  findAllCreneaux,
  findCreneauById,
  createCreneau,
  updateCreneau,
  deleteCreneau,
  // RDV
  findAllRdv,
  findRdvById,
  findRdvActifDonneur,
  createRdvTransactionnel,
  updateStatutRdv,
  libererPlace,
};