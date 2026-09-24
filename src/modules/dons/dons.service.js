// ============================================
// AIDORA - SERVICE DONS
// ============================================

const repository = require("./dons.repository");
const donneurRepository = require("../donneurs/donneurs.repository");
const rattachementsService = require("../rattachements/rattachements.service");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");
const notificationService = require("../notifications/notifications.service");
const journalAudit = require("../journal-audit/journalAudit.service");

// ============================================
// LISTER
// ============================================

async function lister(filtres, utilisateur = null) {
  // Un donneur ne voit que ses propres dons
  if (utilisateur?.role === "DONNEUR") {
    filtres.donneur_id = utilisateur.id;
  }

  // Un personnel ne voit que les dons de son établissement
  if (
    utilisateur &&
    (utilisateur.role === "PERSONNEL_BANQUE" || utilisateur.role === "PERSONNEL_HOPITAL") &&
    utilisateur.etablissementId
  ) {
    filtres.etablissement_id = utilisateur.etablissementId;
  }

  return repository.findAll(filtres);
}

// ============================================
// CONSULTER
// ============================================

/**
 * @param {string|number} id
 * @param {object|null} utilisateur - si fourni, applique le contrôle d'accès
 * @param {boolean} verifierAcces - défaut true quand utilisateur est fourni
 */
async function consulter(id, utilisateur = null, verifierAcces = true) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant de don invalide", 400, "VALIDATION_ERROR");
  }

  const don = await repository.findById(idNum);
  if (!don) {
    throw new AppError("Don introuvable", 404, "NOT_FOUND");
  }

  if (verifierAcces && utilisateur) {
    // Donneur : uniquement ses propres dons
    if (utilisateur.role === "DONNEUR" && don.donneur_id !== utilisateur.id) {
      throw new AppError("Accès refusé à ce don", 403, "FORBIDDEN");
    }

    // Personnel : uniquement les dons de son établissement
    if (
      (utilisateur.role === "PERSONNEL_BANQUE" || utilisateur.role === "PERSONNEL_HOPITAL") &&
      utilisateur.etablissementId &&
      don.etablissement_id !== utilisateur.etablissementId
    ) {
      throw new AppError("Accès refusé à ce don", 403, "FORBIDDEN");
    }
    // ADMINISTRATEUR : accès total
  }

  return don;
}

// ============================================
// LISTER PAR DONNEUR
// ============================================

async function listerParDonneur(donneurId, utilisateur) {
  const idNum = Number(donneurId);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant de donneur invalide", 400, "VALIDATION_ERROR");
  }

  // Un donneur ne peut voir que ses propres dons
  if (utilisateur.role === "DONNEUR" && utilisateur.id !== idNum) {
    throw new AppError("Accès refusé à ces dons", 403, "FORBIDDEN");
  }

  return repository.findByDonneurId(idNum);
}

// ============================================
// CRÉER UN DON
// ============================================

async function creer(donnees, utilisateur) {
  const donneurId = Number(donnees.donneur_id);

  // Vérifier que le donneur existe
  const donneur = await donneurRepository.findById(donneurId);
  if (!donneur) {
    throw new AppError("Donneur introuvable", 404, "NOT_FOUND");
  }

  // Vérifier que le donneur est disponible
  if (!donneur.disponible) {
    throw new AppError(
      "Ce donneur n'est pas disponible pour un don actuellement",
      400,
      "BAD_REQUEST"
    );
  }

  // Vérifier le délai depuis le dernier don (90 jours minimum)
  const dernierDon = await repository.findDernierDon(donneurId);
  if (dernierDon) {
    const joursDepuis = Math.floor(
      (Date.now() - new Date(dernierDon.date_don).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (joursDepuis < 90) {
      throw new AppError(
        `Le donneur doit attendre encore ${90 - joursDepuis} jour(s) avant de pouvoir donner à nouveau`,
        400,
        "BAD_REQUEST"
      );
    }
  }

  // Vérifier que le personnel est bien rattaché à un établissement
  const etablissementId = utilisateur.etablissementId;
  if (!etablissementId) {
    throw new AppError(
      "Aucun établissement rattaché à ce compte",
      403,
      "FORBIDDEN"
    );
  }

  const don = await repository.create({
    ...donnees,
    personnel_id: utilisateur.id,
    etablissement_id: etablissementId,
  });

  logger.info(
    `Don #${don.id} enregistré pour donneur #${donneurId} par #${utilisateur.id}`
  );

  // 📝 Audit
  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "ENREGISTRER_DON",
    nouvelle_valeur: {
      don_id: don.id,
      donneur_id: don.donneur_id,
      quantite: don.quantite,
      etablissement_id: etablissementId,
    },
  });

  return don;
}

// ============================================
// VALIDER UN DON
// ============================================

async function valider(id, utilisateur) {
  // Contrôle d'accès établissement pour le personnel
  const don = await consulter(id, utilisateur);

  if (don.statut !== "ENREGISTRE") {
    throw new AppError(
      `Ce don est déjà au statut ${don.statut}`,
      400,
      "BAD_REQUEST"
    );
  }

  const poches = await repository.validerEtGenererPoches(
    Number(id),
    don,
    utilisateur.id
  );

  // 📝 Audit
  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "VALIDER_DON",
    ancienne_valeur: { statut: "ENREGISTRE" },
    nouvelle_valeur: {
      statut: "VALIDE",
      poches_generees: poches.length,
    },
  });

  // 🔔 Notification au donneur
  await notificationService.notifier(don.donneur_id, {
    titre: "Don validé ✅",
    message: `Votre don du ${new Date(don.date_don).toLocaleDateString(
      "fr-FR"
    )} a été validé. ${poches.length} poche(s) ont été générées. Merci pour votre générosité !`,
    type: "DON",
  });

  // ⭐ RATTACHEMENT AUTOMATIQUE APRÈS UN DON
  try {
    await rattachementsService.creerSiAbsent(
      don.donneur_id,
      don.etablissement_id,
      "DON"
    );
    logger.info(
      `Rattachement automatique : donneur #${don.donneur_id} → établissement #${don.etablissement_id}`
    );
  } catch (err) {
    // Ne jamais bloquer la validation d'un don
    logger.error(`[Dons] Échec rattachement auto : ${err.message}`);
  }

  logger.info(
    `Don #${id} validé par #${utilisateur.id} — ${poches.length} poche(s) générée(s)`
  );

  return { don: { ...don, statut: "VALIDE" }, poches };
}

// ============================================
// REJETER UN DON
// ============================================

async function rejeter(id, { motif }, utilisateur) {
  const don = await consulter(id, utilisateur);

  if (don.statut !== "ENREGISTRE") {
    throw new AppError(
      `Ce don est déjà au statut ${don.statut}`,
      400,
      "BAD_REQUEST"
    );
  }

  const donRejete = await repository.rejeter(Number(id), motif);

  logger.warn(`Don #${id} rejeté par #${utilisateur.id} — Motif : ${motif}`);

  // 📝 Audit
  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "REJETER_DON",
    ancienne_valeur: { statut: "ENREGISTRE" },
    nouvelle_valeur: { statut: "REJETE", motif },
  });

  // 🔔 Notification au donneur
  await notificationService.notifier(don.donneur_id, {
    titre: "Don rejeté ❌",
    message: `Votre don du ${new Date(don.date_don).toLocaleDateString(
      "fr-FR"
    )} a été rejeté. Motif : ${motif}`,
    type: "ALERTE",
  });

  return donRejete;
}

// ============================================
// SUPPRIMER UN DON (admin)
// ============================================

async function supprimer(id, utilisateur) {
  // Admin uniquement (vérifié en route) — pas de filtre établissement
  const don = await consulter(id, utilisateur, false);

  if (don.statut === "VALIDE") {
    throw new AppError(
      "Impossible de supprimer un don validé (des poches y sont rattachées)",
      400,
      "BAD_REQUEST"
    );
  }

  await repository.delete(Number(id));

  logger.warn(`Don #${id} supprimé par admin #${utilisateur.id}`);

  // 📝 Audit
  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "SUPPRIMER_DON",
    ancienne_valeur: {
      don_id: don.id,
      donneur_id: don.donneur_id,
      statut: don.statut,
    },
  });
}

// ============================================
// POChes D'UN DON
// ============================================

async function pochesDuDon(id, utilisateur) {
  const don = await consulter(id, utilisateur);

  return repository.findPochesParDon(don.id);
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  lister,
  consulter,
  listerParDonneur,
  creer,
  valider,
  rejeter,
  supprimer,
  pochesDuDon,
};
