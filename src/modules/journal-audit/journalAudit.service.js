const repository = require("./journalAudit.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");

/**
 * Liste les entrées d'audit avec filtres.
 */
async function lister(filtres) {
  return repository.findAll(filtres);
}

/**
 * Récupère une entrée d'audit par ID.
 */
async function consulter(id) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant invalide", 400, "VALIDATION_ERROR");
  }

  const entree = await repository.findById(idNum);
  if (!entree) {
    throw new AppError("Entrée d'audit introuvable", 404, "NOT_FOUND");
  }
  return entree;
}

/**
 * Historique complet d'un utilisateur.
 */
async function parUtilisateur(utilisateurId) {
  const idNum = Number(utilisateurId);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant utilisateur invalide", 400, "VALIDATION_ERROR");
  }

  const entrees = await repository.findByUtilisateur(idNum);
  return { utilisateur_id: idNum, total: entrees.length, entrees };
}

/**
 * Statistiques des actions les plus fréquentes.
 */
async function statsActions() {
  return repository.statsParAction();
}

/**
 * Purge les entrées antérieures à une date (admin).
 */
async function purger(dateAvant, utilisateur) {
  const date = new Date(dateAvant);
  if (isNaN(date.getTime())) {
    throw new AppError("Date de purge invalide", 400, "VALIDATION_ERROR");
  }

  const result = await repository.purgerAvant(date);

  // Tracer la purge elle-même (récursion volontaire)
  await enregistrer({
    utilisateur_id: utilisateur.id,
    action: "PURGE_AUDIT",
    ancienne_valeur: null,
    nouvelle_valeur: `${result.supprimees} entrée(s) supprimée(s) avant ${dateAvant}`,
    adresse_ip: null,
  });

  logger.warn(
    `Purge audit : ${result.supprimees} entrées supprimées avant ${dateAvant} par #${utilisateur.id}`
  );

  return result;
}

// ============================================
// API INTERNE — Utilisée par tous les autres modules
// ============================================

/**
 * Enregistre une action dans le journal d'audit.
 * @param {Object} params
 * @param {number} params.utilisateur_id - ID de l'utilisateur qui fait l'action
 * @param {string} params.action - Nom de l'action (ex: "CREATE_DON", "UPDATE_STOCK")
 * @param {any}    [params.ancienne_valeur] - Valeur avant modification
 * @param {any}    [params.nouvelle_valeur] - Valeur après modification
 * @param {string} [params.adresse_ip] - Adresse IP de l'utilisateur
 */
async function enregistrer({
  utilisateur_id,
  action,
  ancienne_valeur = null,
  nouvelle_valeur = null,
  adresse_ip = null,
}) {
  if (!utilisateur_id || !action) {
    // Ne jamais faire planter l'appelant pour un log d'audit raté
    logger.warn("enregistrer() appelé sans utilisateur_id ou action");
    return null;
  }

  try {
    return await repository.create({
      utilisateur_id,
      action,
      ancienne_valeur: ancienne_valeur
        ? typeof ancienne_valeur === "string"
          ? ancienne_valeur
          : JSON.stringify(ancienne_valeur)
        : null,
      nouvelle_valeur: nouvelle_valeur
        ? typeof nouvelle_valeur === "string"
          ? nouvelle_valeur
          : JSON.stringify(nouvelle_valeur)
        : null,
      adresse_ip,
    });
  } catch (err) {
    // Ne JAMAIS propager une erreur d'audit à l'appelant
    logger.error(`Échec enregistrement audit : ${err.message}`);
    return null;
  }
}

/**
 * Enregistre une action directement depuis une requête Express
 * (extrait automatiquement l'utilisateur et l'IP).
 */
async function enregistrerDepuisRequete(req, action, ancienneValeur = null, nouvelleValeur = null) {
  const utilisateurId = req.user?.id;
  const adresseIp =
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;

  return enregistrer({
    utilisateur_id: utilisateurId,
    action,
    ancienne_valeur: ancienneValeur,
    nouvelle_valeur: nouvelleValeur,
    adresse_ip: adresseIp,
  });
}

module.exports = {
  // API publique
  lister,
  consulter,
  parUtilisateur,
  statsActions,
  purger,
  // API interne (pour les autres modules)
  enregistrer,
  enregistrerDepuisRequete,
};