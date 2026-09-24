const repository = require("./rattachements.repository");
const etablissementRepository = require("../etablissements/etablissements.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");
const journalAudit = require("../journal-audit/journalAudit.service");
const notificationService = require("../notifications/notifications.service");

// ============================================
// LECTURE
// ============================================

async function lister(filtres, utilisateur) {
  // Un donneur ne voit que ses propres rattachements
  if (utilisateur.role === "DONNEUR") {
    filtres.donneur_id = utilisateur.id;
  }
  // Un personnel ne voit que les rattachements de son établissement
  if (
    (utilisateur.role === "PERSONNEL_BANQUE" || utilisateur.role === "PERSONNEL_HOPITAL") &&
    utilisateur.etablissementId
  ) {
    filtres.etablissement_id = utilisateur.etablissementId;
  }

  return repository.findAll(filtres);
}

async function consulter(id, utilisateur) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant invalide", 400, "VALIDATION_ERROR");
  }

  const rattachement = await repository.findById(idNum);
  if (!rattachement) {
    throw new AppError("Rattachement introuvable", 404, "NOT_FOUND");
  }

  // Contrôle d'accès
  if (
    utilisateur.role === "DONNEUR" &&
    rattachement.donneur_id !== utilisateur.id
  ) {
    throw new AppError("Accès refusé", 403, "FORBIDDEN");
  }

  return rattachement;
}

async function mesRattachements(utilisateur) {
  return repository.findByDonneur(utilisateur.id);
}

async function rattachementsEtablissement(etablissementId, utilisateur, statut = "ACTIF") {
  const idNum = Number(etablissementId);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant d'établissement invalide", 400, "VALIDATION_ERROR");
  }

  // Contrôle : un personnel ne voit que son établissement
  if (
    utilisateur.role !== "ADMINISTRATEUR" &&
    utilisateur.etablissementId !== idNum
  ) {
    throw new AppError("Accès refusé", 403, "FORBIDDEN");
  }

  return repository.findByEtablissement(idNum, statut);
}

// ============================================
// CRÉATION / SUPPRESSION
// ============================================

async function creer({ donneur_id, etablissement_id, source = "INSCRIPTION" }, utilisateur = null) {
  // Vérifier que l'établissement existe
  const etab = await etablissementRepository.findById(etablissement_id);
  if (!etab) {
    throw new AppError("Établissement introuvable", 404, "NOT_FOUND");
  }

  // Vérifier que le rattachement n'existe pas déjà
  const existant = await repository.findRattachement(donneur_id, etablissement_id);
  if (existant) {
    if (existant.statut === "ACTIF") {
      throw new AppError("Ce donneur est déjà rattaché à cet établissement", 409, "DEJA_RATTACHE");
    }
    // Réactiver si inactif
    const updated = await repository.updateStatut(existant.id, "ACTIF");

    await journalAudit.enregistrer({
      utilisateur_id: utilisateur?.id || null,
      action: "REACTIVER_RATTACHEMENT",
      nouvelle_valeur: { donneur_id, etablissement_id },
    });

    return updated;
  }

  const rattachement = await repository.create({
    donneur_id,
    etablissement_id,
    statut: "ACTIF",
    source,
    est_principal: false,
  });

  logger.info(`Rattachement créé : donneur #${donneur_id} ↔ établissement #${etablissement_id}`);

  // 📝 Audit
  await journalAudit.enregistrer({
    utilisateur_id: utilisateur?.id || null,
    action: "CREER_RATTACHEMENT",
    nouvelle_valeur: {
      rattachement_id: rattachement.id,
      donneur_id,
      etablissement_id,
      source,
    },
  });

  // 🔔 Notification au donneur
  await notificationService.notifier(donneur_id, {
    titre: "Nouveau rattachement 🏥",
    message: `Vous êtes maintenant rattaché à ${etab.nom}.`,
    type: "SYSTEME",
  });

  return rattachement;
}

/**
 * Crée un rattachement automatique (ex: après un don).
 * Ne lève jamais d'erreur si le rattachement existe déjà.
 */
async function creerSiAbsent(donneurId, etablissementId, source = "DON") {
  try {
    const existant = await repository.findRattachement(donneurId, etablissementId);
    if (existant) {
      if (existant.statut === "INACTIF") {
        return repository.updateStatut(existant.id, "ACTIF");
      }
      return existant;
    }
    return await creer({ donneur_id: donneurId, etablissement_id: etablissementId, source });
  } catch (err) {
    logger.error(`[Rattachements] creerSiAbsent échec : ${err.message}`);
    return null;
  }
}

async function desactiver(id, utilisateur) {
  const rattachement = await consulter(id, utilisateur);

  if (rattachement.statut !== "ACTIF") {
    throw new AppError("Ce rattachement n'est pas actif", 400, "STATUT_INVALIDE");
  }

  const updated = await repository.updateStatut(Number(id), "INACTIF");

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "DESACTIVER_RATTACHEMENT",
    ancienne_valeur: { statut: "ACTIF" },
    nouvelle_valeur: { statut: "INACTIF" },
  });

  return updated;
}

async function reactiver(id, utilisateur) {
  const rattachement = await consulter(id, utilisateur);

  if (rattachement.statut !== "INACTIF") {
    throw new AppError("Ce rattachement n'est pas inactif", 400, "STATUT_INVALIDE");
  }

  const updated = await repository.updateStatut(Number(id), "ACTIF");

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "REACTIVER_RATTACHEMENT",
    ancienne_valeur: { statut: "INACTIF" },
    nouvelle_valeur: { statut: "ACTIF" },
  });

  return updated;
}

async function definirPrincipal(id, utilisateur) {
  const rattachement = await consulter(id, utilisateur);

  if (rattachement.statut !== "ACTIF") {
    throw new AppError("Seul un rattachement actif peut être principal", 400, "STATUT_INVALIDE");
  }

  await repository.setPrincipal(rattachement.donneur_id, Number(id));

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "DEFINIR_RATTACHEMENT_PRINCIPAL",
    nouvelle_valeur: { rattachement_id: id },
  });

  return repository.findById(Number(id));
}

async function supprimer(id, utilisateur) {
  const rattachement = await consulter(id, utilisateur);

  // Seul un admin peut supprimer un rattachement actif
  if (rattachement.statut === "ACTIF" && utilisateur.role !== "ADMINISTRATEUR") {
    throw new AppError(
      "Seul un administrateur peut supprimer un rattachement actif",
      403,
      "FORBIDDEN"
    );
  }

  await repository.delete(Number(id));

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "SUPPRIMER_RATTACHEMENT",
    ancienne_valeur: {
      rattachement_id: id,
      donneur_id: rattachement.donneur_id,
      etablissement_id: rattachement.etablissement_id,
    },
  });
}

module.exports = {
  lister,
  consulter,
  mesRattachements,
  rattachementsEtablissement,
  creer,
  creerSiAbsent,
  desactiver,
  reactiver,
  definirPrincipal,
  supprimer,
};