const repository = require("./sollicitations.repository");
const notificationService = require("../notifications/notifications.service");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");

async function lister(filtres, utilisateur) {
  if (utilisateur.role === "DONNEUR") {
    filtres.donneur_id = utilisateur.id;
  } else if (utilisateur.role === "PERSONNEL_BANQUE") {
    filtres.personnel_id = utilisateur.id;
  }
  return { sollicitations: await repository.findAll(filtres) };
}

async function donneursCompatibles(groupe_sanguin, rhesus, utilisateur) {
  if (!utilisateur.etablissementId) {
    throw new AppError("Aucun établissement associé", 403, "FORBIDDEN");
  }
  return repository.findDonneursCompatibles({
    etablissement_id: utilisateur.etablissementId,
    groupe_sanguin,
    rhesus,
  });
}

async function creer({ donneur_id, message, motif }, utilisateur) {
  if (!utilisateur.etablissementId) {
    throw new AppError("Aucun établissement associé", 403, "FORBIDDEN");
  }

  const sollicitation = await repository.create({
    donneur_id,
    personnel_id: utilisateur.id,
    message,
    motif,
  });

  logger.info(`Sollicitation #${sollicitation.id} → donneur #${donneur_id}`);

  // Notification au donneur
  await notificationService.notifier(donneur_id, {
    titre: "📢 Sollicitation de don",
    message: message || "Une banque de sang vous sollicite pour un don.",
    type: "SOLLICITATION",
  });

  return sollicitation;
}

async function repondre(id, { statut }, utilisateur) {
  const s = await repository.findById(Number(id));
  if (!s) throw new AppError("Sollicitation introuvable", 404, "NOT_FOUND");

  if (utilisateur.role === "DONNEUR" && s.donneur_id !== utilisateur.id) {
    throw new AppError("Accès refusé", 403, "FORBIDDEN");
  }

  if (s.statut !== "ENVOYEE") {
    throw new AppError("Cette sollicitation a déjà été traitée", 400, "BAD_REQUEST");
  }

  if (!["ACCEPTEE", "REFUSEE"].includes(statut)) {
    throw new AppError("Statut invalide", 400, "VALIDATION_ERROR");
  }

  const updated = await repository.changerStatut(Number(id), statut);
  logger.info(`Sollicitation #${id} → ${statut} par #${utilisateur.id}`);
  return updated;
}

module.exports = { lister, donneursCompatibles, creer, repondre };