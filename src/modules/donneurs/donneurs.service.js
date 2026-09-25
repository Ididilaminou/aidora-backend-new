const bcrypt = require("bcryptjs");
const { withTransaction } = require("../../config/db");
const donneurRepository = require("./donneurs.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");
const { generateActivationCode } = require("../../utils/generateCode");
const journalAudit = require("../journal-audit/journalAudit.service");
const notificationService = require("../notifications/notifications.service");
const emailService = require("../../services/emailService");

const BCRYPT_ROUNDS = 12;

// ============================================
// UC1 : Créer un compte donneur (par le personnel, après un don physique)
// 3 insertions liées (utilisateurs, donneurs, activations_compte)
// → obligatoirement transactionnel
// ============================================
async function creerDonneur(data, etablissementId, utilisateurCreateur = null) {
  const resultat = await withTransaction(async (conn) => {
    // Vérifier l'unicité (téléphone + email)
    const existant = await donneurRepository.findUtilisateurByTelephoneOuEmail(
      data.telephone,
      data.email,
      conn
    );
    if (existant) {
      throw new AppError(
        "Un compte existe déjà pour ce donneur",
        409,
        "DONNEUR_DEJA_EXISTANT"
      );
    }

    async function listerTous(seulementGeo = false) {
      return donneurRepository.listerTousLesDonneurs({ seulementGeo });
    }
        // 1. Créer l'utilisateur
    const utilisateurId = await donneurRepository.insertUtilisateur(data, conn);

    // 2. Créer le profil donneur
    await donneurRepository.insertDonneur(
      utilisateurId,
      { ...data, etablissementId },
      conn
    );

    // 3. Générer et enregistrer le code d'activation
    const codeActivation = generateActivationCode();
    await donneurRepository.insertActivation(utilisateurId, codeActivation, conn);

    return { id: utilisateurId, codeActivation, etablissementId };
  });

  // 📝 Audit (hors transaction, ne bloque jamais)
  await journalAudit.enregistrer({
    utilisateur_id: utilisateurCreateur?.id || resultat.id,
    action: "CREER_DONNEUR",
    nouvelle_valeur: {
      donneur_id: resultat.id,
      etablissement_id: etablissementId,
      telephone: data.telephone,
    },
  });

  logger.info(
    `Donneur #${resultat.id} créé dans l'établissement #${etablissementId}`
  );

    // ============================================
  // 📧 ENVOI DU CODE D'ACTIVATION PAR EMAIL
  // ============================================
  try {
    if (data.email) {
      await emailService.envoyerCodeActivationDonneur({
        destinataire: data.email,
        prenom: data.prenom,
        code: resultat.codeActivation,
        utilisateurId: resultat.id,
      });
      logger.info(`📧 Email d'activation envoyé à ${data.email}`);
    } else {
      logger.warn(`⚠️ Pas d'email pour le donneur #${resultat.id}`);
    }
  } catch (emailErr) {
    logger.error(`❌ Erreur envoi email activation : ${emailErr.message}`);
  }

  // ============================================
  // 📱 ENVOI DU CODE PAR SMS (si configuré)
  // ============================================
  try {
    const smsService = require("../../services/sms.service");
    if (smsService?.envoyerCodeActivationDonneur) {
      await smsService.envoyerCodeActivationDonneur({
        telephone: data.telephone,
        prenom: data.prenom,
        code: resultat.codeActivation,
        utilisateurId: resultat.id,
      });
      logger.info(`📱 SMS d'activation envoyé à ${data.telephone}`);
    }
  } catch (smsErr) {
    logger.debug(`📱 SMS non envoyé : ${smsErr.message}`);
  }

  // 📝 Log de secours (dev)
  logger.info(
    `[DEV] Code d'activation pour donneur #${resultat.id} : ${resultat.codeActivation}`
  );

  return resultat;
}   

// ============================================
// UC2 : Activation du compte via le code reçu (valable 24h)
// + choix du mot de passe
// ============================================
async function activerDonneur(telephone, codeActivation, motDePasse) {
  const resultat = await withTransaction(async (conn) => {
    const utilisateur = await donneurRepository.findUtilisateurByTelephone(
      telephone,
      conn
    );
    if (!utilisateur) {
      throw new AppError(
        "Aucun compte trouvé pour ce numéro",
        404,
        "DONNEUR_INTROUVABLE"
      );
    }

    if (utilisateur.statut_compte === "ACTIF") {
      throw new AppError("Ce compte est déjà activé", 409, "DEJA_ACTIF");
    }

    const activation = await donneurRepository.findActivationEnAttente(
      utilisateur.id,
      conn
    );
    if (!activation) {
      throw new AppError(
        "Aucun code d'activation en attente",
        400,
        "AUCUNE_ACTIVATION"
      );
    }

    if (new Date(activation.date_expiration) < new Date()) {
      throw new AppError(
        "Code d'activation expiré, redemandez-en un",
        410,
        "CODE_EXPIRE"
      );
    }

    if (activation.code !== codeActivation) {
      throw new AppError(
        "Code d'activation incorrect",
        400,
        "CODE_INVALIDE"
      );
    }

    const hash = await bcrypt.hash(motDePasse, BCRYPT_ROUNDS);
    await donneurRepository.activerUtilisateur(utilisateur.id, hash, conn);
    await donneurRepository.marquerActivationUtilisee(activation.id, conn);

    return { id: utilisateur.id, prenom: utilisateur.prenom };
  });

  // 📝 Audit
  await journalAudit.enregistrer({
    utilisateur_id: resultat.id,
    action: "ACTIVATION_DONNEUR",
    nouvelle_valeur: { telephone, statut: "ACTIF" },
  });

  logger.info(`Donneur #${resultat.id} activé via code`);

  // 🔔 Notification de bienvenue
  await notificationService.notifier(resultat.id, {
    titre: "Bienvenue sur Aidora 🩸",
    message:
      "Votre compte est maintenant actif. Complétez votre profil et indiquez votre disponibilité pour recevoir des sollicitations.",
    type: "SYSTEME",
  });

  return resultat;
}

// ============================================
// Consultation du profil
// ============================================
async function getProfil(donneurId) {
  const donneur = await donneurRepository.findById(donneurId);
  if (!donneur) {
    throw new AppError("Donneur introuvable", 404, "DONNEUR_INTROUVABLE");
  }
  return donneur;
}

// ============================================
// Modification du profil
// ============================================
async function updateProfil(donneurId, data) {
  const ancien = await getProfil(donneurId);

  await donneurRepository.updateProfil(donneurId, data);
  const updated = await getProfil(donneurId);

  // 📝 Audit
  await journalAudit.enregistrer({
    utilisateur_id: donneurId,
    action: "MODIFIER_PROFIL_DONNEUR",
    ancienne_valeur: {
      groupe_sanguin: ancien.groupe_sanguin,
      rhesus: ancien.rhesus,
      telephone: ancien.telephone,
    },
    nouvelle_valeur: {
      groupe_sanguin: updated.groupe_sanguin,
      rhesus: updated.rhesus,
      telephone: updated.telephone,
    },
  });

  return updated;
}

// ============================================
// Modification de la disponibilité
// ============================================
async function updateDisponibilite(donneurId, disponible) {
  await donneurRepository.updateDisponibilite(donneurId, disponible);

  // 📝 Audit
  await journalAudit.enregistrer({
    utilisateur_id: donneurId,
    action: disponible ? "DEVENIR_DISPONIBLE" : "DEVENIR_INDISPONIBLE",
  });

  return { id: donneurId, disponible: !!disponible };
}

// ============================================
// Mise à jour de la position (recherche géo)
// ============================================
async function updatePosition(donneurId, latitude, longitude) {
  await donneurRepository.updatePosition(donneurId, latitude, longitude);
  return { id: donneurId, latitude, longitude };
}

// ============================================
// Liste des donneurs d'un établissement
// ============================================
async function listerDonneurs(etablissementId) {
  return donneurRepository.listByEtablissement(etablissementId);
}

// ============================================
// Recherche géo de donneurs compatibles
// ============================================
async function rechercherDonneursProches(criteres) {
  if (criteres.latitude == null || criteres.longitude == null) {
    throw new AppError(
      "Position (latitude/longitude) requise pour la recherche",
      422,
      "POSITION_REQUISE"
    );
  }
  return donneurRepository.rechercherDonneursProches(criteres);
}

module.exports = {
  creerDonneur,
  activerDonneur,
  getProfil,
  updateProfil,
  updateDisponibilite,
  updatePosition,
  listerDonneurs,
  rechercherDonneursProches,
  listerTous,
};