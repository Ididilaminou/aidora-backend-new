const { pool } = require("../../config/db");

// ============================================
// COMPTEURS GLOBAUX
// ============================================

async function compterDonneurs() {
  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM donneurs");
  return rows[0].total;
}

async function compterDons() {
  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM dons");
  return rows[0].total;
}

async function compterEtablissements() {
  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM etablissements");
  return rows[0].total;
}

async function compterPersonnels() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM personnels"
  );
  return rows[0].total;
}

async function compterDemandes() {
  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM demandes_sang");
  return rows[0].total;
}

async function compterStocks() {
  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM stocks");
  return rows[0].total;
}

async function compterPoches() {
  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM poches");
  return rows[0].total;
}

async function compterDemandesUrgentes() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM demandes_sang WHERE urgence = 1 AND statut = 'EN_ATTENTE'"
  );
  return rows[0].total;
}

async function compterStocksFaibles() {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM stocks WHERE quantite <= seuil_alerte"
  );
  return rows[0].total;
}

// ============================================
// RÉPARTITIONS (pour graphiques donut)
// ============================================

async function demandesParStatut(etablissementId = null) {
  let sql = `
    SELECT statut, COUNT(*) AS total
    FROM demandes_sang
  `;
  const params = [];

  if (etablissementId) {
    sql += " WHERE etablissement_demandeur_id = ? OR etablissement_destinataire_id = ?";
    params.push(etablissementId, etablissementId);
  }

  sql += " GROUP BY statut";

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function stocksParType(etablissementId = null) {
  let sql = `
    SELECT type_produit, SUM(quantite) AS total
    FROM stocks
  `;
  const params = [];

  if (etablissementId) {
    sql += " WHERE etablissement_id = ?";
    params.push(etablissementId);
  }

  sql += " GROUP BY type_produit";

  const [rows] = await pool.query(sql, params);
  return rows;
}

async function etablissementsParType() {
  const [rows] = await pool.query(
    "SELECT type, COUNT(*) AS total FROM etablissements GROUP BY type"
  );
  return rows;
}

async function personnelsParRole() {
  const [rows] = await pool.query(
    `SELECT role, COUNT(*) AS total FROM utilisateurs
     WHERE role IN ('PERSONNEL_BANQUE', 'PERSONNEL_HOPITAL', 'ADMINISTRATEUR')
     GROUP BY role`
  );
  return rows;
}

// ============================================
// STATISTIQUES PAR ÉTABLISSEMENT
// ============================================

async function statsEtablissement(etablissementId, dateDebut, dateFin) {
  // Nombre de dons sur la période
  const [donsResult] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(quantite), 0) AS volume
     FROM dons
     WHERE etablissement_id = ?
       AND (? IS NULL OR date_don >= ?)
       AND (? IS NULL OR date_don <= ?)`,
    [etablissementId, dateDebut, dateDebut, dateFin, dateFin]
  );

  // Nombre de poches créées sur la période
  const [pochesResult] = await pool.query(
    `SELECT COUNT(*) AS total FROM poches
     WHERE etablissement_id = ?
       AND (? IS NULL OR date_collecte >= ?)
       AND (? IS NULL OR date_collecte <= ?)`,
    [etablissementId, dateDebut, dateDebut, dateFin, dateFin]
  );

  // Nombre de demandes reçues
  const [demandesResult] = await pool.query(
    `SELECT COUNT(*) AS total FROM demandes_sang
     WHERE etablissement_destinataire_id = ?
       AND (? IS NULL OR date_demande >= ?)
       AND (? IS NULL OR date_demande <= ?)`,
    [etablissementId, dateDebut, dateDebut, dateFin, dateFin]
  );

  // Stock actuel
  const [stockResult] = await pool.query(
    `SELECT COALESCE(SUM(quantite), 0) AS total FROM stocks WHERE etablissement_id = ?`,
    [etablissementId]
  );

  return {
    nombreDons: donsResult[0].total,
    volumeCollecte: donsResult[0].volume,
    nombrePoches: pochesResult[0].total,
    nombreDemandes: demandesResult[0].total,
    stockActuel: stockResult[0].total,
  };
}

// ============================================
// STATISTIQUES PAR PERSONNEL
// ============================================

async function trouverPersonnel(personnelId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.nom, u.prenom, p.etablissement_id
     FROM utilisateurs u
     INNER JOIN personnels p ON p.id = u.id
     WHERE u.id = ?`,
    [personnelId]
  );
  return rows[0] || null;
}

async function statsPersonnel(personnelId, etablissementId, dateDebut, dateFin) {
  // Dons enregistrés par ce personnel
  const [donsResult] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(quantite), 0) AS volume
     FROM dons
     WHERE personnel_id = ?
       AND (? IS NULL OR date_don >= ?)
       AND (? IS NULL OR date_don <= ?)`,
    [personnelId, dateDebut, dateDebut, dateFin, dateFin]
  );

  // Poches générées par ce personnel
  const [pochesResult] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN statut = 'VENDUE' THEN 1 ELSE 0 END), 0) AS vendues,
            COALESCE(SUM(CASE WHEN statut = 'DISTRIBUEE' THEN 1 ELSE 0 END), 0) AS distribuees,
            COALESCE(SUM(CASE WHEN statut = 'PERIMEE' THEN 1 ELSE 0 END), 0) AS perimees
     FROM poches
     WHERE personnel_responsable_id = ?
       AND (? IS NULL OR date_collecte >= ?)
       AND (? IS NULL OR date_collecte <= ?)`,
    [personnelId, dateDebut, dateDebut, dateFin, dateFin]
  );

  // Demandes traitées par ce personnel
  const [demandesResult] = await pool.query(
    `SELECT COUNT(*) AS total FROM demandes_sang
     WHERE personnel_traitant_id = ?
       AND (? IS NULL OR date_traitement >= ?)
       AND (? IS NULL OR date_traitement <= ?)`,
    [personnelId, dateDebut, dateDebut, dateFin, dateFin]
  );

  // Nombre de donneurs enregistrés (via le registre)
  const [donneursResult] = await pool.query(
    `SELECT COUNT(*) AS total FROM donneurs
     WHERE etablissement_id = ?
       AND (? IS NULL OR date_creation >= ?)
       AND (? IS NULL OR date_creation <= ?)`,
    [etablissementId, dateDebut, dateDebut, dateFin, dateFin]
  );

  // Sollicitations envoyées
  const [sollicitationsResult] = await pool.query(
    `SELECT COUNT(*) AS total FROM sollicitations
     WHERE personnel_id = ?
       AND (? IS NULL OR date_sollicitation >= ?)
       AND (? IS NULL OR date_sollicitation <= ?)`,
    [personnelId, dateDebut, dateDebut, dateFin, dateFin]
  );

  return {
    nombreDonsEnregistres: donsResult[0].total,
    volumeSanguinCollecte: donsResult[0].volume,
    nombrePochesGenerees: pochesResult[0].total,
    nombrePochesVendues: pochesResult[0].vendues,
    nombrePochesDistribuees: pochesResult[0].distribuees,
    nombrePochesPerimees: pochesResult[0].perimees,
    nombreDemandesTraitees: demandesResult[0].total,
    nombreDonneursEnregistres: donneursResult[0].total,
    nombreSollicitationsEnvoyees: sollicitationsResult[0].total,
  };
}

// ============================================
// ÉVOLUTION DANS LE TEMPS (séries temporelles)
// ============================================

async function evolutionDons(periode, etablissementId = null) {
  let groupement;
  switch (periode) {
    case "JOURNALIER":
      groupement = "DATE(date_don)";
      break;
    case "HEBDOMADAIRE":
      groupement = "YEARWEEK(date_don)";
      break;
    case "MENSUEL":
      groupement = "DATE_FORMAT(date_don, '%Y-%m')";
      break;
    default:
      groupement = "DATE_FORMAT(date_don, '%Y-%m')";
  }

  let sql = `
    SELECT ${groupement} AS periode, COUNT(*) AS total
    FROM dons
    WHERE 1 = 1
  `;
  const params = [];

  if (etablissementId) {
    sql += " AND etablissement_id = ?";
    params.push(etablissementId);
  }

  sql += ` GROUP BY ${groupement} ORDER BY periode ASC LIMIT 30`;

  const [rows] = await pool.query(sql, params);
  return rows;
}

module.exports = {
  // Compteurs
  compterDonneurs,
  compterDons,
  compterEtablissements,
  compterPersonnels,
  compterDemandes,
  compterStocks,
  compterPoches,
  compterDemandesUrgentes,
  compterStocksFaibles,
  // Répartitions
  demandesParStatut,
  stocksParType,
  etablissementsParType,
  personnelsParRole,
  // Détails
  statsEtablissement,
  statsPersonnel,
  trouverPersonnel,
  evolutionDons,
};