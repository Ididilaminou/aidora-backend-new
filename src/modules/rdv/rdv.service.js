const repository = require("./rdv.repository");
const donneurRepository = require("../donneurs/donneurs.repository");
const etablissementRepository = require("../etablissements/etablissements.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");
const journalAudit = require("../journal-audit/journalAudit.service");
const notificationService = require("../notifications/notifications.service");
const emailService = require("../../services/email.service");
const smsService = require("../../services/smsService");

// ============================================
// CRÉNEAUX (gérés par la banque)
// ============================================

async function listerCreneaux(filtres) {
  return repository.findAllCreneaux(filtres);
}

async function creerCreneau(data, utilisateur) {
  // Un personnel ne peut créer que pour son établissement
  let etablissementId = data.etablissement_id;

  if (utilisateur.role === "PERSONNEL_BANQUE") {
    etablissementId = utilisateur.etablissementId;
  }

  if (!etablissementId) {
    throw new AppError("Établissement requis", 400, "ETABLISSEMENT_REQUIS");
  }

  // Vérifier que l'établissement est une banque de sang
  const etab = await etablissementRepository.findById(etablissementId);
  if (!etab) {
    throw new AppError("Établissement introuvable", 404, "NOT_FOUND");
  }
  if (etab.type !== "BANQUE_DE_SANG") {
    throw new AppError(
      "Seules les banques de sang peuvent créer des créneaux de don",
      400,
      "TYPE_INVALIDE"
    );
  }

  const creneau = await repository.createCreneau({
    ...data,
    etablissement_id: etablissementId,
  });

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "CREER_CRENEAU",
    nouvelle_valeur: {
      creneau_id: creneau.id,
      etablissement_id: etablissementId,
      date: data.date_creneau,
      heure: data.heure_debut,
    },
  });

  logger.info(`Créneau #${creneau.id} créé pour étab #${etablissementId}`);

  return creneau;
}

async function modifierCreneau(id, data, utilisateur) {
  const creneau = await repository.findCreneauById(id);
  if (!creneau) {
    throw new AppError("Créneau introuvable", 404, "NOT_FOUND");
  }

  // Contrôle : un personnel ne peut modifier que pour son établissement
  if (
    utilisateur.role === "PERSONNEL_BANQUE" &&
    creneau.etablissement_id !== utilisateur.etablissementId
  ) {
    throw new AppError("Accès refusé à ce créneau", 403, "FORBIDDEN");
  }

  const updated = await repository.updateCreneau(id, data);

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "MODIFIER_CRENEAU",
    ancienne_valeur: { date: creneau.date_creneau, heure: creneau.heure_debut },
    nouvelle_valeur: data,
  });

  return updated;
}

async function supprimerCreneau(id, utilisateur) {
  const creneau = await repository.findCreneauById(id);
  if (!creneau) {
    throw new AppError("Créneau introuvable", 404, "NOT_FOUND");
  }

  if (
    utilisateur.role === "PERSONNEL_BANQUE" &&
    creneau.etablissement_id !== utilisateur.etablissementId
  ) {
    throw new AppError("Accès refusé", 403, "FORBIDDEN");
  }

  // Vérifier qu'aucun RDV actif n'utilise ce créneau
  const rdvsActifs = await repository.findAllRdv({
    etablissement_id: creneau.etablissement_id,
    statut: "PLANIFIE",
  });

  const rdvLie = rdvsActifs.find((r) => r.creneau_id === Number(id));
  if (rdvLie) {
    throw new AppError(
      "Impossible de supprimer : des rendez-vous sont liés à ce créneau",
      409,
      "RDV_LIES"
    );
  }

  await repository.deleteCreneau(id);

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "SUPPRIMER_CRENEAU",
    ancienne_valeur: { creneau_id: id, etablissement_id: creneau.etablissement_id },
  });
}

// ============================================
// RENDEZ-VOUS (pris par les donneurs)
// ============================================

async function listerRdv(filtres, utilisateur) {
  // Un donneur ne voit que ses RDV
  if (utilisateur.role === "DONNEUR") {
    filtres.donneur_id = utilisateur.id;
  }
  // Un personnel ne voit que les RDV de son établissement
  if (
    (utilisateur.role === "PERSONNEL_BANQUE" || utilisateur.role === "PERSONNEL_HOPITAL") &&
    utilisateur.etablissementId
  ) {
    filtres.etablissement_id = utilisateur.etablissementId;
  }

  return repository.findAllRdv(filtres);
}

async function consulterRdv(id, utilisateur) {
  const rdv = await repository.findRdvById(id);
  if (!rdv) {
    throw new AppError("Rendez-vous introuvable", 404, "NOT_FOUND");
  }

  // Contrôle d'accès
  if (utilisateur.role === "DONNEUR" && rdv.donneur_id !== utilisateur.id) {
    throw new AppError("Accès refusé", 403, "FORBIDDEN");
  }

  return rdv;
}

async function mesRdv(utilisateur) {
  return repository.findAllRdv({ donneur_id: utilisateur.id });
}

async function prendreRdv({ creneau_id, commentaire }, utilisateur) {
  // Vérifier que le donneur existe
  const donneur = await donneurRepository.findById(utilisateur.id);
  if (!donneur) {
    throw new AppError("Profil donneur introuvable", 404, "NOT_FOUND");
  }

  // Le donneur ne doit pas avoir de RDV actif
  const rdvExistant = await repository.findRdvActifDonneur(utilisateur.id);
  if (rdvExistant) {
    throw new AppError(
      "Vous avez déjà un rendez-vous actif. Annulez-le avant d'en prendre un nouveau.",
      409,
      "RDV_DEJA_ACTIF"
    );
  }

  // Créer le RDV (transaction pour éviter les collisions)
  const rdv = await repository.createRdvTransactionnel({
    donneur_id: utilisateur.id,
    creneau_id: Number(creneau_id),
    commentaire,
  });

  logger.info(`RDV #${rdv.id} pris par donneur #${utilisateur.id}`);

  // 📝 Audit
  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "PRENDRE_RDV",
    nouvelle_valeur: {
      rdv_id: rdv.id,
      creneau_id: rdv.creneau_id,
      etablissement_id: rdv.etablissement_id,
    },
  });

  // 🔔 Notification au donneur
  await notificationService.notifier(utilisateur.id, {
    titre: "Rendez-vous confirmé 📅",
    message: `Votre RDV du ${new Date(rdv.date_rendez_vous).toLocaleDateString(
      "fr-FR"
    )} à ${rdv.heure_rendez_vous} est enregistré.`,
    type: "SYSTEME",
  });

  return rdv;
}

async function confirmerRdv(id, utilisateur) {
  const rdv = await consulterRdv(id, utilisateur);

  if (rdv.statut !== "PLANIFIE") {
    throw new AppError(
      `Impossible de confirmer un RDV au statut ${rdv.statut}`,
      400,
      "STATUT_INVALIDE"
    );
  }

  const updated = await repository.updateStatutRdv(id, "CONFIRME");

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "CONFIRMER_RDV",
    ancienne_valeur: { statut: "PLANIFIE" },
    nouvelle_valeur: { statut: "CONFIRME" },
  });

  // 📧 Envoi email de confirmation
  if (rdv.donneur_email) {
    emailService
      .envoyerConfirmationRdv({
        destinataire: rdv.donneur_email,
        prenom: rdv.donneur_prenom,
        dateRdv: new Date(rdv.date_rendez_vous).toLocaleDateString("fr-FR"),
        heureRdv: rdv.heure_rendez_vous,
        nomEtablissement: rdv.etablissement_nom,
        utilisateurId: rdv.donneur_id,
      })
      .catch((e) => logger.error(`[RDV] Email : ${e.message}`));
  }

  // 📱 SMS
  if (rdv.donneur_telephone) {
    smsService
      .envoyerConfirmationRdv(
        rdv.donneur_telephone,
        rdv.donneur_prenom,
        `${new Date(rdv.date_rendez_vous).toLocaleDateString("fr-FR")} à ${rdv.heure_rendez_vous}`,
        rdv.etablissement_nom,
        rdv.donneur_id
      )
      .catch((e) => logger.error(`[RDV] SMS : ${e.message}`));
  }

  return updated;
}

async function annulerRdv(id, { motif }, utilisateur) {
  const rdv = await consulterRdv(id, utilisateur);

  if (["ANNULE", "HONORE"].includes(rdv.statut)) {
    throw new AppError(
      `Impossible d'annuler un RDV au statut ${rdv.statut}`,
      400,
      "STATUT_INVALIDE"
    );
  }

  const updated = await repository.updateStatutRdv(id, "ANNULE", motif);

  // Libérer la place dans le créneau
  if (rdv.creneau_id) {
    await repository.libererPlace(rdv.creneau_id);
  }

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "ANNULER_RDV",
    ancienne_valeur: { statut: rdv.statut },
    nouvelle_valeur: { statut: "ANNULE", motif },
  });

  // 🔔 Notification
  await notificationService.notifier(rdv.donneur_id, {
    titre: "Rendez-vous annulé ❌",
    message: `Votre RDV du ${new Date(rdv.date_rendez_vous).toLocaleDateString(
      "fr-FR"
    )} a été annulé. Motif : ${motif || "non précisé"}`,
    type: "ALERTE",
  });

  return updated;
}

async function marquerHonore(id, utilisateur) {
  const rdv = await consulterRdv(id, utilisateur);

  if (!["PLANIFIE", "CONFIRME"].includes(rdv.statut)) {
    throw new AppError(
      `Impossible de marquer comme honoré un RDV au statut ${rdv.statut}`,
      400,
      "STATUT_INVALIDE"
    );
  }

  const updated = await repository.updateStatutRdv(id, "HONORE");

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "MARQUER_RDV_HONORE",
    ancienne_valeur: { statut: rdv.statut },
    nouvelle_valeur: { statut: "HONORE" },
  });

  return updated;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  listerCreneaux,
  creerCreneau,
  modifierCreneau,
  supprimerCreneau,
  listerRdv,
  consulterRdv,
  mesRdv,
  prendreRdv,
  confirmerRdv,
  annulerRdv,
  marquerHonore,
};