const repository = require("./notifications.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");

/**
 * Liste les notifications d'un utilisateur.
 */
async function lister(utilisateurId, filtres) {
  return repository.findAllByUser(utilisateurId, filtres);
}

/**
 * Liste les notifications non lues d'un utilisateur.
 */
async function nonLues(utilisateurId) {
  const notifications = await repository.findNonLues(utilisateurId);
  return {
    notifications,
    total: notifications.length,
  };
}

/**
 * Compteur de notifications non lues.
 */
async function compteur(utilisateurId) {
  const total = await repository.compterNonLues(utilisateurId);
  return { total };
}

/**
 * Récupère une notification (avec contrôle d'accès).
 */
async function consulter(id, utilisateurId) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant invalide", 400, "VALIDATION_ERROR");
  }

  const notification = await repository.findById(idNum);
  if (!notification) {
    throw new AppError("Notification introuvable", 404, "NOT_FOUND");
  }

  if (notification.utilisateur_id !== utilisateurId) {
    throw new AppError("Accès refusé à cette notification", 403, "FORBIDDEN");
  }

  return notification;
}

/**
 * Marque une notification comme lue.
 */
async function marquerCommeLue(id, utilisateurId) {
  const notification = await consulter(id, utilisateurId);

  if (notification.lue) {
    return notification; // Déjà lue, retourne tel quel
  }

  return repository.marquerLue(Number(id));
}

/**
 * Marque toutes les notifications d'un utilisateur comme lues.
 */
async function marquerToutesCommeLues(utilisateurId) {
  const result = await repository.marquerToutesLues(utilisateurId);
  return { modifiees: result };
}

/**
 * Supprime une notification.
 */
async function supprimer(id, utilisateurId) {
  await consulter(id, utilisateurId);
  await repository.delete(Number(id));
}

/**
 * Crée une notification (admin).
 */
async function creer(donnees, createur) {
  const { utilisateur_id, titre, message, type } = donnees;

  // Vérifier que l'utilisateur existe
  const userExiste = await repository.utilisateurExiste(utilisateur_id);
  if (!userExiste) {
    throw new AppError("Utilisateur introuvable", 404, "NOT_FOUND");
  }

  const notification = await repository.create({
    utilisateur_id,
    titre,
    message,
    type: type || "INFO",
  });

  logger.info(`Notification #${notification.id} créée par admin #${createur.id}`);
  return notification;
}

/**
 * Diffuse une notification à plusieurs utilisateurs (admin).
 */
async function diffuser(donnees, createur) {
  const { utilisateur_ids, titre, message, type } = donnees;

  if (!Array.isArray(utilisateur_ids) || utilisateur_ids.length === 0) {
    throw new AppError(
      "La liste des utilisateurs ne peut pas être vide",
      400,
      "VALIDATION_ERROR"
    );
  }

  const result = await repository.createMany(
    utilisateur_ids.map((uid) => ({
      utilisateur_id: uid,
      titre,
      message,
      type: type || "INFO",
    }))
  );

  logger.info(
    `Notification diffusée à ${result.envoyees} utilisateur(s) par admin #${createur.id}`
  );

  return { envoyees: result.envoyees };
}

// ============================================
// FONCTIONS UTILITAIRES INTERNES
// ============================================
// Ces fonctions sont utilisées par les autres modules
// (dons, demandes, stock, etc.) pour créer automatiquement
// des notifications. Elles ne sont PAS exposées dans le controller.

/**
 * Notifie un utilisateur (usage interne).
 */
async function notifier(utilisateurId, { titre, message, type = "INFO" }) {
  return repository.create({ utilisateur_id: utilisateurId, titre, message, type });
}

/**
 * Notifie tous les utilisateurs d'un rôle (usage interne).
 */
async function notifierParRole(role, { titre, message, type = "INFO" }) {
  const utilisateurs = await repository.trouverParRole(role);

  if (utilisateurs.length === 0) return { envoyees: 0 };

  const result = await repository.createMany(
    utilisateurs.map((u) => ({
      utilisateur_id: u.id,
      titre,
      message,
      type,
    }))
  );

  return { envoyees: result.envoyees };
}

/**
 * Notifie tous les utilisateurs d'un établissement (usage interne).
 */
async function notifierParEtablissement(etablissementId, { titre, message, type = "INFO" }) {
  const utilisateurs = await repository.trouverParEtablissement(etablissementId);

  if (utilisateurs.length === 0) return { envoyees: 0 };

  const result = await repository.createMany(
    utilisateurs.map((u) => ({
      utilisateur_id: u.id,
      titre,
      message,
      type,
    }))
  );

  return { envoyees: result.envoyees };
}

module.exports = {
  // API publique
  lister,
  nonLues,
  compteur,
  consulter,
  marquerCommeLue,
  marquerToutesCommeLues,
  supprimer,
  creer,
  diffuser,
  // API interne (utilisée par d'autres modules)
  notifier,
  notifierParRole,
  notifierParEtablissement,
};