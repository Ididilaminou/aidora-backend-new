// ============================================
// AIDORA - REPOSITORY AUTH
// ============================================

const { pool, withTransaction } = require("../../config/db");
const AppError = require("../../utils/AppError");

// ============================================
// LECTURE UTILISATEUR
// ============================================

async function findUtilisateurByIdentifiant(identifiant) {
  const [rows] = await pool.query(
    `SELECT id, nom, prenom, email, telephone, mot_de_passe, role, statut_compte,
            doit_changer_mot_de_passe
     FROM utilisateurs
     WHERE email = ? OR telephone = ?
     LIMIT 1`,
    [identifiant, identifiant]
  );
  return rows[0] || null;
}

async function findUtilisateurByEmail(email) {
  const [rows] = await pool.query(
    `SELECT id, nom, prenom, email, telephone, role, statut_compte,
            doit_changer_mot_de_passe, date_creation
     FROM utilisateurs
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findUtilisateurByTelephone(telephone) {
  const [rows] = await pool.query(
    `SELECT id, nom, prenom, email, telephone, role, statut_compte,
            doit_changer_mot_de_passe, date_creation
     FROM utilisateurs
     WHERE telephone = ?
     LIMIT 1`,
    [telephone]
  );
  return rows[0] || null;
}

async function findUtilisateurById(id) {
  const [rows] = await pool.query(
    `SELECT id, nom, prenom, email, telephone, mot_de_passe, role, statut_compte,
            doit_changer_mot_de_passe, date_creation, date_modification
     FROM utilisateurs
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findUtilisateurParEmailOuTelephone(email, telephone) {
  const [rows] = await pool.query(
    `SELECT id, email, telephone
     FROM utilisateurs
     WHERE email = ? OR telephone = ?
     LIMIT 1`,
    [email, telephone]
  );
  return rows[0] || null;
}

// ============================================
// EXTRAS RÔLE
// ============================================

async function getDonneurExtras(id) {
  const [rows] = await pool.query(
    `SELECT 
        d.groupe_sanguin, d.rhesus, d.disponible,
        d.ville, d.quartier, d.latitude, d.longitude,
        COALESCE(
          (SELECT r.etablissement_id FROM rattachements_donneurs r
           WHERE r.donneur_id = d.id AND r.statut = 'ACTIF' AND r.est_principal = 1 LIMIT 1),
          (SELECT r.etablissement_id FROM rattachements_donneurs r
           WHERE r.donneur_id = d.id AND r.statut = 'ACTIF'
           ORDER BY r.date_rattachement DESC LIMIT 1),
          d.etablissement_id
        ) AS etablissement_id
     FROM donneurs d
     WHERE d.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function getPersonnelExtras(id) {
  const [rows] = await pool.query(
    `SELECT p.fonction, p.etablissement_id,
            e.nom AS etablissement_nom, e.type AS etablissement_type
     FROM personnels p
     LEFT JOIN etablissements e ON e.id = p.etablissement_id
     WHERE p.id = ?`,
    [id]
  );
  return rows[0] || null;
}

// ============================================
// INSCRIPTION
// ============================================

async function creerDonneurInscription(data) {
  return withTransaction(async (conn) => {
    const [existants] = await conn.query(
      `SELECT id, email, telephone FROM utilisateurs
       WHERE email = ? OR telephone = ? LIMIT 1`,
      [data.email, data.telephone]
    );

    if (existants.length > 0) {
      const conflit = existants[0];
      const champ = conflit.email === data.email ? "email" : "telephone";
      throw new AppError(
        `Un compte existe déjà avec cet ${champ}`,
        409,
        champ === "email" ? "EMAIL_DEJA_UTILISE" : "TELEPHONE_DEJA_UTILISE"
      );
    }

    const [userResult] = await conn.query(
      `INSERT INTO utilisateurs
        (nom, prenom, email, telephone, mot_de_passe, role, statut_compte)
       VALUES (?, ?, ?, ?, ?, 'DONNEUR', 'INACTIF')`,
      [data.nom, data.prenom, data.email, data.telephone, data.motDePasseHash]
    );

    const utilisateurId = userResult.insertId;

    await conn.query(
      `INSERT INTO donneurs
        (id, groupe_sanguin, rhesus, disponible, latitude, longitude, ville, quartier, etablissement_id)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, NULL)`,
      [
        utilisateurId,
        data.groupeSanguin,
        data.rhesus,
        data.latitude || null,
        data.longitude || null,
        data.ville || null,
        data.quartier || null,
      ]
    );

    const dateExpiration = new Date(Date.now() + 15 * 60 * 1000);
    await conn.query(
      `INSERT INTO activations_compte
        (utilisateur_id, code, date_expiration, statut)
       VALUES (?, ?, ?, 'EN_ATTENTE')`,
      [utilisateurId, data.codeHash, dateExpiration]
    );

    return {
      utilisateurId,
      codeActivation: data.codeActivation,
      dateExpiration,
    };
  });
}

async function creerDonneurParBanque(data) {
  return withTransaction(async (conn) => {
    const [existants] = await conn.query(
      `SELECT id FROM utilisateurs
       WHERE email = ? OR telephone = ? LIMIT 1`,
      [data.email, data.telephone]
    );

    if (existants.length > 0) {
      throw new AppError("Compte déjà existant", 409, "UTILISATEUR_DEJA_EXISTANT");
    }

    const [userResult] = await conn.query(
      `INSERT INTO utilisateurs
        (nom, prenom, email, telephone, mot_de_passe, role, statut_compte)
       VALUES (?, ?, ?, ?, ?, 'DONNEUR', 'INACTIF')`,
      [data.nom, data.prenom, data.email, data.telephone, data.motDePasseHash]
    );

    const utilisateurId = userResult.insertId;

    await conn.query(
      `INSERT INTO donneurs (id, groupe_sanguin, rhesus, etablissement_id)
       VALUES (?, ?, ?, ?)`,
      [utilisateurId, data.groupeSanguin, data.rhesus, data.etablissementId]
    );

    await conn.query(
      `INSERT INTO rattachements_donneurs
        (donneur_id, etablissement_id, statut, source)
       VALUES (?, ?, 'ACTIF', 'REGISTRE_MANUEL')`,
      [utilisateurId, data.etablissementId]
    );

    const dateExpiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await conn.query(
      `INSERT INTO activations_compte
        (utilisateur_id, code, date_expiration, statut)
       VALUES (?, ?, ?, 'EN_ATTENTE')`,
      [utilisateurId, data.codeHash, dateExpiration]
    );

    return { utilisateurId, dateExpiration };
  });
}

// ============================================
// INVITATIONS
// ============================================

async function creerInvitation(data) {
  const [result] = await pool.query(
    `INSERT INTO invitations_donneurs
      (etablissement_id, donneur_existant_id, prenom, nom, telephone, email,
       groupe_sanguin, rhesus, code_activation, source, date_expiration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.etablissementId,
      data.donneurExistantId || null,
      data.prenom,
      data.nom,
      data.telephone || null,
      data.email || null,
      data.groupeSanguin || null,
      data.rhesus || null,
      data.codeActivation,
      data.source || "MANUEL",
      data.dateExpiration,
    ]
  );
  return { invitationId: result.insertId };
}

async function trouverInvitationParCode(code) {
  const [rows] = await pool.query(
    `SELECT i.*, e.nom AS etablissement_nom, e.type AS etablissement_type
     FROM invitations_donneurs i
     INNER JOIN etablissements e ON e.id = i.etablissement_id
     WHERE i.code_activation = ?
       AND i.statut = 'EN_ATTENTE'
       AND i.date_expiration > NOW()
     LIMIT 1`,
    [code]
  );
  return rows[0] || null;
}

async function updateStatutInvitation(invitationId, statut) {
  await pool.query(
    `UPDATE invitations_donneurs SET statut = ?, date_reponse = NOW() WHERE id = ?`,
    [statut, invitationId]
  );
}

async function listerInvitationsEnAttente(etablissementId) {
  const [rows] = await pool.query(
    `SELECT id, prenom, nom, email, telephone, groupe_sanguin, rhesus,
            statut, source, date_expiration, created_at
     FROM invitations_donneurs
     WHERE etablissement_id = ? AND statut = 'EN_ATTENTE'
     ORDER BY created_at DESC`,
    [etablissementId]
  );
  return rows;
}

// ============================================
// ACTIVATION
// ============================================

async function findActivationValide(utilisateurId, codeHash) {
  const [rows] = await pool.query(
    `SELECT * FROM activations_compte
     WHERE utilisateur_id = ?
       AND code = ?
       AND statut = 'EN_ATTENTE'
       AND date_expiration > NOW()
     LIMIT 1`,
    [utilisateurId, codeHash]
  );
  return rows[0] || null;
}

async function activerCompteTransactionnel(utilisateurId, activationId) {
  return withTransaction(async (conn) => {
    await conn.query(
      "UPDATE utilisateurs SET statut_compte = 'ACTIF' WHERE id = ?",
      [utilisateurId]
    );
    await conn.query(
      `UPDATE activations_compte
       SET statut = 'UTILISE', date_activation = NOW()
       WHERE id = ?`,
      [activationId]
    );
  });
}

async function remplacerActivation(utilisateurId, codeHash, dateExpiration) {
  return withTransaction(async (conn) => {
    await conn.query(
      `UPDATE activations_compte SET statut = 'EXPIRE'
       WHERE utilisateur_id = ? AND statut = 'EN_ATTENTE'`,
      [utilisateurId]
    );
    await conn.query(
      `INSERT INTO activations_compte
        (utilisateur_id, code, date_expiration, statut)
       VALUES (?, ?, ?, 'EN_ATTENTE')`,
      [utilisateurId, codeHash, dateExpiration]
    );
  });
}

// ============================================
// MOT DE PASSE
// ============================================

async function changerMotDePasseTransactionnel(utilisateurId, hash, activationId) {
  return withTransaction(async (conn) => {
    await conn.query(
      `UPDATE utilisateurs
       SET mot_de_passe = ?, doit_changer_mot_de_passe = 0
       WHERE id = ?`,
      [hash, utilisateurId]
    );
    await conn.query(
      `UPDATE activations_compte
       SET statut = 'UTILISE', date_activation = NOW()
       WHERE id = ?`,
      [activationId]
    );
  });
}

async function updateMotDePasse(utilisateurId, hash) {
  await pool.query(
    "UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?",
    [hash, utilisateurId]
  );
}

// ============================================
// RATTACHEMENTS
// ============================================

async function creerRattachementInitial(donneurId, etablissementId, source = "INSCRIPTION") {
  await pool.query(
    `INSERT IGNORE INTO rattachements_donneurs
      (donneur_id, etablissement_id, statut, source)
     VALUES (?, ?, 'ACTIF', ?)`,
    [donneurId, etablissementId, source]
  );
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  findUtilisateurByIdentifiant,
  findUtilisateurByEmail,
  findUtilisateurByTelephone,
  findUtilisateurById,
  findUtilisateurParEmailOuTelephone,
  getDonneurExtras,
  getPersonnelExtras,
  creerDonneurInscription,
  creerDonneurParBanque,
  creerInvitation,
  trouverInvitationParCode,
  updateStatutInvitation,
  listerInvitationsEnAttente,
  findActivationValide,
  activerCompteTransactionnel,
  remplacerActivation,
  creerRattachementInitial,
  changerMotDePasseTransactionnel,
  updateMotDePasse,
};