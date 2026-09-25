// ============================================================
// AIDORA — SERVICE SMS (mode mock par défaut)
// ------------------------------------------------------------
// Modes supportés :
//   - mock    : log dans la console (aucun envoi réel)
//   - orange  : API Orange Cameroun (à configurer)
//   - twilio  : Twilio
// ============================================================

const logger = require("../config/logger");

const SMS_PROVIDER = process.env.SMS_PROVIDER || "mock";
const SMS_ACTIF = process.env.SMS_ACTIF !== "false";
const SMS_SENDER = process.env.SMS_SENDER || "AIDORA";

// ============================================
// ENVOI PRINCIPAL
// ============================================
async function envoyer({ telephone, message, utilisateurId = null }) {
  if (!telephone) {
    logger.warn("[SMS] Numéro manquant");
    return { succes: false, erreur: "Téléphone manquant" };
  }

  if (!SMS_ACTIF) {
    logger.info(`[SMS] Désactivé par config — SMS non envoyé à ${telephone}`);
    return { succes: true, messageId: null };
  }

  // -------- MODE MOCK (console uniquement) --------
  if (SMS_PROVIDER === "mock") {
    logger.info("┌─────────────────────────────────────────────");
    logger.info(`│ [SMS MOCK] À       : ${telephone}`);
    logger.info(`│ [SMS MOCK] Message : ${message}`);
    logger.info("└─────────────────────────────────────────────");
    return { succes: true, messageId: `mock-${Date.now()}` };
  }

  // -------- AUTRES PROVIDERS (à venir) --------
  if (SMS_PROVIDER === "orange") {
    try {
      // À implémenter plus tard
      throw new Error("Provider Orange non encore configuré");
    } catch (err) {
      logger.error(`[SMS/ORANGE] Échec : ${err.message}`);
      return { succes: false, erreur: err.message };
    }
  }

  logger.warn(`[SMS] Provider inconnu : ${SMS_PROVIDER}`);
  return { succes: false, erreur: `Provider ${SMS_PROVIDER} non supporté` };
}

// ============================================
// TEMPLATES
// ============================================

async function envoyerCodeActivationDonneur({
  telephone,
  prenom,
  code,
  utilisateurId = null,
}) {
  const message = `Aidora: Bonjour ${prenom}, votre code d'activation est ${code}. Valable 15 min. Ne le partagez pas.`;
  return envoyer({ telephone, message, utilisateurId });
}

async function envoyerConfirmationRdv({
  telephone,
  prenom,
  dateRdv,
  heureRdv,
  nomEtablissement,
  utilisateurId = null,
}) {
  const message = `Aidora: RDV confirmé ${dateRdv} à ${heureRdv} — ${nomEtablissement}. Merci ${prenom}.`;
  return envoyer({ telephone, message, utilisateurId });
}

async function envoyerCodeReinitialisation({
  telephone,
  prenom,
  code,
  utilisateurId = null,
}) {
  const message = `Aidora: ${prenom}, code de réinitialisation: ${code}. Valable 15 min.`;
  return envoyer({ telephone, message, utilisateurId });
}

// ============================================
// VÉRIFICATION (au démarrage)
// ============================================================
async function verifierConnexion() {
  if (SMS_PROVIDER === "mock") {
    logger.info("[SMS] Mode mock actif (aucun envoi réel)");
    return true;
  }
  logger.info(`[SMS] Provider configuré : ${SMS_PROVIDER}`);
  return true;
}

async function envoyerIdentifiantsPersonnel({
  telephone,
  prenom,
  email,
  motDePasseTemporaire,
  nomEtablissement,
  utilisateurId = null,
}) {
  const message = `Aidora: Bonjour ${prenom}, votre compte ${nomEtablissement ? nomEtablissement + " " : ""}est créé. Email: ${email} | Mot de passe temporaire: ${motDePasseTemporaire} | Connectez-vous et changez-le.`;
  return envoyer({ telephone, message, utilisateurId });
}

// ============================================
// EXPORTS
// ============================================================
module.exports = {
  envoyer,
  envoyerCodeActivationDonneur,
  envoyerCodeActivation: envoyerCodeActivationDonneur,
  envoyerConfirmationRdv,
  envoyerCodeReinitialisation,
  verifierConnexion,
};