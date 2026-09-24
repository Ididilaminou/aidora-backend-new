const { pool, withTransaction } = require("../../config/db");

/**
 * Liste les personnels avec filtres et pagination.
 */
async function findAll({
  role,
  etablissement_id,
  statut_compte,
  page = 1,
  limite = 20,
} = {}) {
  let sql = `
    SELECT u.id, u.nom, u.prenom, u.email, u.telephone,
           u.role, u.statut_compte, u.date_creation,
           p.fonction, p.etablissement_id,
           e.nom AS etablissement_nom
    FROM utilisateurs u
    INNER JOIN personnels p ON p.id = u.id
    LEFT JOIN etablissements e ON e.id = p.etablissement_id
    WHERE u.role IN ('PERSONNEL_BANQUE', 'PERSONNEL_HOPITAL', 'ADMINISTRATEUR')
  `;
  const params = [];

  if (role) { sql += " AND u.role = ?"; params.push(role); }
  if (etablissement_id) { sql += " AND p.etablissement_id = ?"; params.push(etablissement_id); }
  if (statut_compte) { sql += " AND u.statut_compte = ?"; params.push(statut_compte); }

  sql += " ORDER BY u.date_creation DESC LIMIT ? OFFSET ?";
  params.push(Number(limite), (Number(page) - 1) * Number(limite));

  const [rows] = await pool.query(sql, params);

  // Comptage total
  let countSql = `
    SELECT COUNT(*) AS total
    FROM utilisateurs u
    INNER JOIN personnels p ON p.id = u.id
    WHERE u.role IN ('PERSONNEL_BANQUE', 'PERSONNEL_HOPITAL', 'ADMINISTRATEUR')
  `;
  const countParams = [];
  if (role) { countSql += " AND u.role = ?"; countParams.push(role); }
  if (etablissement_id) { countSql += " AND p.etablissement_id = ?"; countParams.push(etablissement_id); }
  if (statut_compte) { countSql += " AND u.statut_compte = ?"; countParams.push(statut_compte); }

  const [countRows] = await pool.query(countSql, countParams);

  return {
    personnels: rows,
    total: countRows[0].total,
    page: Number(page),
    limite: Number(limite),
  };
}

/**
 * Récupère un personnel par ID utilisateur.
 */
async function findById(id) {
  const [rows] = await pool.query(
    `SELECT u.id, u.nom, u.prenom, u.email, u.telephone,
            u.role, u.statut_compte, u.date_creation,
            p.fonction, p.etablissement_id,
            e.nom AS etablissement_nom
     FROM utilisateurs u
     INNER JOIN personnels p ON p.id = u.id
     LEFT JOIN etablissements e ON e.id = p.etablissement_id
     WHERE u.id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Récupère un personnel par son ID utilisateur (pour "moi").
 */
async function findByUserId(id) {
  return findById(id);
}

/**
 * Vérifie si un courriel existe déjà.
 */
async function emailExiste(courriel) {
  const [rows] = await pool.query(
    "SELECT id FROM utilisateurs WHERE email = ?",
    [courriel]
  );
  return rows.length > 0;
}

/**
 * Vérifie si un téléphone existe déjà.
 */
async function telephoneExiste(telephone) {
  const [rows] = await pool.query(
    "SELECT id FROM utilisateurs WHERE telephone = ?",
    [telephone]
  );
  return rows.length > 0;
}

/**
 * Crée un utilisateur + un personnel + un administrateur (si applicable) en transaction.
 */
async function creerUtilisateurEtPersonnel(donnees) {
  return withTransaction(async (conn) => {
    const {
      courriel,
      motDePasseHash,
      prenom,
      nom,
      telephone,
      role,
      etablissement_id,
      fonction,
    } = donnees;

    // 1. Créer l'utilisateur
    const [userResult] = await conn.query(
      `INSERT INTO utilisateurs
       (nom, prenom, email, mot_de_passe, telephone, role, statut_compte)
       VALUES (?, ?, ?, ?, ?, ?, 'INACTIF')`,
      [nom, prenom, courriel, motDePasseHash, telephone, role]
    );

    const userId = userResult.insertId;

    // 2. Créer le personnel ou l'administrateur
    if (role === "ADMINISTRATEUR") {
      await conn.query(
        `INSERT INTO administrateurs (id, niveau_acces) VALUES (?, 'STANDARD')`,
        [userId]
      );
    } else {
      await conn.query(
        `INSERT INTO personnels (id, fonction, etablissement_id) VALUES (?, ?, ?)`,
        [userId, fonction || null, etablissement_id || null]
      );
    }

    // 3. Retourner l'utilisateur créé (sans mot de passe)
    const [rows] = await conn.query(
      `SELECT id, nom, prenom, email, telephone, role, statut_compte, date_creation
       FROM utilisateurs WHERE id = ?`,
      [userId]
    );

    return rows[0];
  });
}

/**
 * Met à jour un personnel.
 */
async function update(id, donnees) {
  const { prenom, nom, telephone, fonction } = donnees;

  // Mettre à jour utilisateurs + personnels en transaction
  return withTransaction(async (conn) => {
    const userUpdates = [];
    const userParams = [];

    if (prenom !== undefined) { userUpdates.push("prenom = ?"); userParams.push(prenom); }
    if (nom !== undefined) { userUpdates.push("nom = ?"); userParams.push(nom); }
    if (telephone !== undefined) { userUpdates.push("telephone = ?"); userParams.push(telephone); }

    if (userUpdates.length > 0) {
      userParams.push(id);
      await conn.query(
        `UPDATE utilisateurs SET ${userUpdates.join(", ")} WHERE id = ?`,
        userParams
      );
    }

    if (fonction !== undefined) {
      await conn.query(
        "UPDATE personnels SET fonction = ? WHERE id = ?",
        [fonction, id]
      );
    }

    const [rows] = await conn.query(
      `SELECT u.id, u.nom, u.prenom, u.email, u.telephone,
              u.role, u.statut_compte, p.fonction, p.etablissement_id
       FROM utilisateurs u
       LEFT JOIN personnels p ON p.id = u.id
       WHERE u.id = ?`,
      [id]
    );

    return rows[0];
  });
}

/**
 * Met à jour l'établissement d'un personnel.
 */
async function updateEtablissement(id, etablissementId) {
  await pool.query(
    "UPDATE personnels SET etablissement_id = ? WHERE id = ?",
    [etablissementId, id]
  );
  return findById(id);
}

/**
 * Met à jour le statut d'un compte.
 */
async function updateStatut(id, statut) {
  await pool.query(
    "UPDATE utilisateurs SET statut_compte = ? WHERE id = ?",
    [statut, id]
  );
  return findById(id);
}

/**
 * Supprime un personnel (cascade sur utilisateurs → personnels).
 */
async function delete_(id) {
  await pool.query("DELETE FROM utilisateurs WHERE id = ?", [id]);
}

module.exports = {
  findAll,
  findById,
  findByUserId,
  emailExiste,
  telephoneExiste,
  creerUtilisateurEtPersonnel,
  update,
  updateEtablissement,
  updateStatut,
  delete: delete_,
};