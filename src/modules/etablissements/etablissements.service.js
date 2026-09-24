const { withTransaction } = require("../../config/db");
const etablissementRepository = require("./etablissements.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");
const journalAudit = require("../journal-audit/journalAudit.service");
const notificationService = require("../notifications/notifications.service");

// ============================================
// CRÉATION D'UN ÉTABLISSEMENT
// ============================================
async function creerEtablissement(data, utilisateurCreateur = null) {
  const resultat = await withTransaction(async (conn) => {
    // Vérifier l'unicité (email / téléphone)
    const existant = await etablissementRepository.findByEmailOuTelephone(
      data.email,
      data.telephone,
      conn
    );
    if (existant) {
      throw new AppError(
        "Un établissement existe déjà avec cet email/téléphone",
        409,
        "ETABLISSEMENT_DEJA_EXISTANT"
      );
    }

    // Normalise possede_banque_de_sang
    // Une banque pure possède forcément une banque de sang
    let possede = data.possede_banque_de_sang ? 1 : 0;
    if (data.type === "BANQUE_DE_SANG") possede = 1;

    const id = await etablissementRepository.insert(
      { ...data, possede_banque_de_sang: possede },
      conn
    );

    return {
      id,
      statut: "EN_ATTENTE_VERIFICATION",
      nom: data.nom,
      type: data.type,
    };
  });

  // 📝 Audit
  await journalAudit.enregistrer({
    utilisateur_id: utilisateurCreateur?.id || null,
    action: "CREER_ETABLISSEMENT",
    nouvelle_valeur: {
      etablissement_id: resultat.id,
      nom: resultat.nom,
      type: resultat.type,
    },
  });

  logger.info(`Établissement #${resultat.id} (${resultat.type}) créé`);

  // 🔔 Notifier tous les administrateurs
  await notificationService.notifierParRole("ADMINISTRATEUR", {
    titre: "🏥 Nouvel établissement à valider",
    message: `L'établissement "${resultat.nom}" (${resultat.type}) attend votre validation.`,
    type: "SYSTEME",
  });

  return resultat;
}

// ============================================
// CONSULTATION
// ============================================
async function getEtablissement(id) {
  const etab = await etablissementRepository.findById(id);

  if (!etab) {
    throw new AppError(
      "Établissement introuvable",
      404,
      "ETABLISSEMENT_INTROUVABLE"
    );
  }

  return etab;
}

// ============================================
// LISTE
// ============================================
async function listerEtablissements(filtres) {
  return etablissementRepository.list(filtres);
}

// ============================================
// VALIDATION
// ============================================
async function validerEtablissement(id, utilisateurAdmin) {
  const etab = await getEtablissement(id);

  if (etab.statut === "ACTIF") {
    throw new AppError("Établissement déjà actif", 409, "DEJA_ACTIF");
  }

  await etablissementRepository.updateStatut(id, "ACTIF");

  await journalAudit.enregistrer({
    utilisateur_id: utilisateurAdmin?.id || null,
    action: "VALIDER_ETABLISSEMENT",
    ancienne_valeur: { statut: etab.statut },
    nouvelle_valeur: { statut: "ACTIF" },
  });

  logger.info(`Établissement #${id} validé par #${utilisateurAdmin?.id}`);

  await notificationService.notifierParEtablissement(id, {
    titre: "✅ Votre établissement a été validé",
    message: `L'établissement "${etab.nom}" est maintenant actif sur Aidora.`,
    type: "SYSTEME",
  });

  return { id, statut: "ACTIF" };
}

// ============================================
// REJET
// ============================================
async function rejeterEtablissement(id, motif = null, utilisateurAdmin = null) {
  const etab = await getEtablissement(id);

  if (etab.statut === "REJETE") {
    throw new AppError("Établissement déjà rejeté", 409, "DEJA_REJETE");
  }

  await etablissementRepository.updateStatut(id, "REJETE");

  await journalAudit.enregistrer({
    utilisateur_id: utilisateurAdmin?.id || null,
    action: "REJETER_ETABLISSEMENT",
    ancienne_valeur: { statut: etab.statut },
    nouvelle_valeur: { statut: "REJETE", motif },
  });

  logger.warn(
    `Établissement #${id} rejeté par #${utilisateurAdmin?.id} — Motif : ${motif || "non précisé"}`
  );

  await notificationService.notifierParEtablissement(id, {
    titre: "❌ Établissement rejeté",
    message: `L'établissement "${etab.nom}" a été rejeté. ${
      motif ? `Motif : ${motif}` : "Contactez l'administrateur."
    }`,
    type: "ALERTE",
  });

  return { id, statut: "REJETE" };
}

// ============================================
// SUSPENSION
// ============================================
async function suspendreEtablissement(id, utilisateurAdmin = null) {
  const etab = await getEtablissement(id);

  if (etab.statut !== "ACTIF") {
    throw new AppError(
      "Seul un établissement actif peut être suspendu",
      409,
      "STATUT_INVALIDE"
    );
  }

  await etablissementRepository.updateStatut(id, "SUSPENDU");

  await journalAudit.enregistrer({
    utilisateur_id: utilisateurAdmin?.id || null,
    action: "SUSPENDRE_ETABLISSEMENT",
    ancienne_valeur: { statut: "ACTIF" },
    nouvelle_valeur: { statut: "SUSPENDU" },
  });

  logger.warn(`Établissement #${id} suspendu par #${utilisateurAdmin?.id}`);

  await notificationService.notifierParEtablissement(id, {
    titre: "⚠️ Établissement suspendu",
    message: `L'établissement "${etab.nom}" a été temporairement suspendu.`,
    type: "ALERTE",
  });

  return { id, statut: "SUSPENDU" };
}

// ============================================
// RÉACTIVATION
// ============================================
async function reactiverEtablissement(id, utilisateurAdmin = null) {
  const etab = await getEtablissement(id);

  if (etab.statut !== "SUSPENDU") {
    throw new AppError(
      "Seul un établissement suspendu peut être réactivé",
      409,
      "STATUT_INVALIDE"
    );
  }

  await etablissementRepository.updateStatut(id, "ACTIF");

  await journalAudit.enregistrer({
    utilisateur_id: utilisateurAdmin?.id || null,
    action: "REACTIVER_ETABLISSEMENT",
    ancienne_valeur: { statut: "SUSPENDU" },
    nouvelle_valeur: { statut: "ACTIF" },
  });

  logger.info(`Établissement #${id} réactivé par #${utilisateurAdmin?.id}`);

  await notificationService.notifierParEtablissement(id, {
    titre: "✅ Établissement réactivé",
    message: `L'établissement "${etab.nom}" a été réactivé.`,
    type: "SYSTEME",
  });

  return { id, statut: "ACTIF" };
}

// ============================================
// MISE À JOUR
// ============================================
async function updateInfos(id, data, utilisateur = null) {
  const ancien = await getEtablissement(id);

  await etablissementRepository.updateInfos(id, data);
  const updated = await getEtablissement(id);

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur?.id || null,
    action: "MODIFIER_ETABLISSEMENT",
    ancienne_valeur: {
      nom: ancien.nom,
      adresse: ancien.adresse,
      ville: ancien.ville,
    },
    nouvelle_valeur: {
      nom: updated.nom,
      adresse: updated.adresse,
      ville: updated.ville,
    },
  });

  return updated;
}

// ============================================
// RECHERCHE GÉOGRAPHIQUE
// ============================================
async function rechercherProches(criteres) {
  if (criteres.latitude == null || criteres.longitude == null) {
    throw new AppError(
      "Position requise pour la recherche",
      422,
      "POSITION_REQUISE"
    );
  }
  return etablissementRepository.rechercherProches(criteres);
}

module.exports = {
  creerEtablissement,
  getEtablissement,
  listerEtablissements,
  validerEtablissement,
  rejeterEtablissement,
  suspendreEtablissement,
  reactiverEtablissement,
  updateInfos,
  rechercherProches,
};