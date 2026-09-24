const { pool } = require("../../config/db");

// ============================================
// INVITATIONS
// ============================================

async function creerInvitation(data) {
  const [result] = await pool.query(
    `INSERT INTO invitations_donneurs
      (etablissement_id, donneur_existant_id, prenom, nom, telephone, email,
       groupe_sanguin, rhesus, code_activation, source, date_expiration, statut)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE')`,
    [
      data.etablissement_id,
      data.donneur_existant_id || null,
      data.prenom,
      data.nom,
      data.telephone || null,
      data.email || null,
      data.groupe_sanguin || null,
      data.rhesus || null,
      data.code_activation,
      data.source || "MANUEL",
      data.date_expiration,
    ]
  );
  return { id: result.insertId };
}

async function findInvitationById(id) {
  const [rows] = await pool.query(
    `SELECT i.*, e.nom AS etablissement_nom, e.type AS etablissement_type
     FROM invitations_donneurs i
     INNER JOIN etablissements e ON e.id = i.etablissement_id
     WHERE i.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function findInvitationEnAttenteParContact(etablissementId, email, telephone) {
  let sql = `SELECT * FROM invitations_donneurs
             WHERE etablissement_id = ?
               AND statut = 'EN_ATTENTE'`;
  const params = [etablissementId];

  if (email && telephone) {
    sql += " AND (email = ? OR telephone = ?)";
    params.push(email, telephone);
  } else if (email) {
    sql += " AND email = ?";
    params.push(email);
  } else if (telephone) {
    sql += " AND telephone = ?";
    params.push(telephone);
  } else {
    return null;
  }

  sql += " LIMIT 1";

  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
}

async function findAllInvitations({ etablissement_id, statut, source, page = 1, limite = 50 } = {}) {
  let sql = `
    SELECT i.*, e.nom AS etablissement_nom
    FROM invitations_donneurs i
    INNER JOIN etablissements e ON e.id = i.etablissement_id
    WHERE 1 = 1
  `;
  const params = [];

  if (etablissement_id) { sql += " AND i.etablissement_id = ?"; params.push(etablissement_id); }
  if (statut) { sql += " AND i.statut = ?"; params.push(statut); }
  if (source) { sql += " AND i.source = ?"; params.push(source); }

  sql += " ORDER BY i.created_at DESC LIMIT ? OFFSET ?";
  params.push(Number(limite), (Number(page) - 1) * Number(limite));

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function updateStatutInvitation(id, statut) {
  await pool.query(
    `UPDATE invitations_donneurs
     SET statut = ?, date_reponse = NOW()
     WHERE id = ?`,
    [statut, id]
  );
  return findInvitationById(id);
}

async function statsInvitations(etablissementId) {
  const [rows] = await pool.query(
    `SELECT statut, COUNT(*) AS total
     FROM invitations_donneurs
     WHERE etablissement_id = ?
     GROUP BY statut`,
    [etablissementId]
  );
  return rows;
}

module.exports = {
  creerInvitation,
  findInvitationById,
  findInvitationEnAttenteParContact,
  findAllInvitations,
  updateStatutInvitation,
  statsInvitations,
};