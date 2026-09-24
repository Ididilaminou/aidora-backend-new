// ============================================
// AIDORA - SERVICE SMS (abstraction multi-fournisseur)
// ============================================
//
// En développement, utilise un mode MOCK qui log les SMS
// dans la console (aucun envoi réel, aucun frais).
//
// Pour brancher un vrai fournisseur :
//   1. Définir SMS_PROVIDER dans .env (ex: "orange", "mtn", "twilio", "nexah")
//   2. Remplir les identifiants du fournisseur dans .env
//   3. Implémenter la fonction d'envoi dans le switch ci-dessous
//   4. Le reste du code reste INCHANGÉ
//

const logger = require("../config/logger");
const { pool } = require("../config/db");

// ============================================
// CONFIGURATION
// ============================================

const SMS_PROVIDER = process.env.SMS_PROVIDER || "mock";
const SMS_ACTIF = process.env.SMS_ACTIF !== "false"; // Activable/désactivable

// ============================================
// FONCTION PRINCIPALE D'ENVOI
// ============================================

/**
 * Envoie un SMS.
 *
 * @param {string} telephone - Numéro au format international (ex: +237690000000)
 * @param {string} message   - Contenu du SMS
 * @param {number|null} utilisateurId - ID utilisateur (optionnel, pour traçabilité)
 * @returns {Promise<{succes: boolean, providerMessageId?: string, erreur?: string}>}
 */
async function envoyer(telephone, message, utilisateurId = null) {
  // Nettoyage du numéro
  const telephoneClean = normaliserTelephone(telephone);

  if (!telephoneClean) {
    logger.warn(`[SMS] Numéro invalide : ${telephone}`);
    await tracerEchec(utilisateurId, telephone, message, "NUMERO_INVALIDE");
    return { succes: false, erreur: "Numéro invalide" };
  }

  if (!SMS_ACTIF) {
    logger.info(`[SMS] Désactivé par config — message non envoyé à ${telephoneClean}`);
    await tracerEnvoi(utilisateurId, telephoneClean, message, "DESACTIVE", null, null);
    return { succes: true, providerMessageId: null };
  }

  try {
    let providerMessageId = null;

    switch (SMS_PROVIDER) {
      case "mock":
        providerMessageId = await envoyerMock(telephoneClean, message);
        break;
      case "orange":
        providerMessageId = await envoyerOrange(telephoneClean, message);
        break;
      case "mtn":
        providerMessageId = await envoyerMTN(telephoneClean, message);
        break;
      case "nexah":
        providerMessageId = await envoyerNexah(telephoneClean, message);
        break;
      case "twilio":
        providerMessageId = await envoyerTwilio(telephoneClean, message);
        break;
      default:
        throw new Error(`Fournisseur SMS inconnu : ${SMS_PROVIDER}`);
    }

    await tracerEnvoi(
      utilisateurId,
      telephoneClean,
      message,
      "ENVOYE",
      SMS_PROVIDER,
      providerMessageId
    );

    return { succes: true, providerMessageId };
  } catch (err) {
    logger.error(`[SMS] Échec envoi à ${telephoneClean} : ${err.message}`);
    await tracerEnvoi(
      utilisateurId,
      telephoneClean,
      message,
      "ECHOUE",
      SMS_PROVIDER,
      null,
      err.message
    );
    return { succes: false, erreur: err.message };
  }
}

// ============================================
// MESSAGES PRÉDÉFINIS (templates)
// ============================================

/**
 * Envoie un code d'activation par SMS.
 */
async function envoyerCodeActivation(telephone, prenom, code, utilisateurId = null) {
  const message = `Aidora : Bonjour ${prenom}, votre code d'activation est ${code}. Valable 15 minutes. Ne le partagez avec personne.`;
  return envoyer(telephone, message, utilisateurId);
}

/**
 * Envoie une invitation à un donneur (registre banque).
 */
async function envoyerInvitation(telephone, prenom, nomEtablissement, code, utilisateurId = null) {
  const message = `Aidora : Bonjour ${prenom}, ${nomEtablissement} vous invite à rejoindre la plateforme. Code : ${code}. Inscrivez-vous sur aidora.cm`;
  return envoyer(telephone, message, utilisateurId);
}

/**
 * Envoie une notification de RDV confirmé.
 */
async function envoyerConfirmationRdv(telephone, prenom, dateRdv, nomEtablissement, utilisateurId = null) {
  const message = `Aidora : Bonjour ${prenom}, votre RDV à ${nomEtablissement} est confirmé pour le ${dateRdv}. Merci !`;
  return envoyer(telephone, message, utilisateurId);
}

// ============================================
// ADAPTATEURS FOURNISSEURS
// ============================================

/**
 * Mode MOCK (développement) — n'envoie rien, log seulement.
 */
async function envoyerMock(telephone, message) {
  logger.info(`[SMS MOCK] À: ${telephone}`);
  logger.info(`[SMS MOCK] Message: ${message}`);
  return `mock-${Date.now()}`;
}

/**
 * Orange SMS API Cameroun.
 * Doc : https://developer.orange.com/apis/sms-cm
 */
async function envoyerOrange(telephone, message) {
  const fetch = require("node-fetch");
  const token = process.env.ORANGE_SMS_TOKEN;
  const sender = process.env.ORANGE_SMS_SENDER || "AIDORA";

  if (!token) throw new Error("ORANGE_SMS_TOKEN manquant");

  const reponse = await fetch(
    "https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B2370000/requests",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        outboundSMSMessageRequest: {
          address: `tel:${telephone}`,
          senderAddress: `tel:${sender}`,
          outboundSMSTextMessage: { message },
        },
      }),
    }
  );

  if (!reponse.ok) {
    throw new Error(`Orange API error: ${reponse.status}`);
  }

  const data = await reponse.json();
  return data?.outboundSMSMessageRequest?.resourceURL || null;
}

/**
 * MTN SMS API Cameroun.
 */
async function envoyerMTN(telephone, message) {
  const fetch = require("node-fetch");
  const apiKey = process.env.MTN_SMS_API_KEY;

  if (!apiKey) throw new Error("MTN_SMS_API_KEY manquant");

  const reponse = await fetch("https://api.mtn.cm/sms/v1/send", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: telephone,
      message,
      sender: "AIDORA",
    }),
  });

  if (!reponse.ok) {
    throw new Error(`MTN API error: ${reponse.status}`);
  }

  const data = await reponse.json();
  return data?.messageId || null;
}

/**
 * Nexah (Cameroun).
 */
async function envoyerNexah(telephone, message) {
  const fetch = require("node-fetch");
  const user = process.env.NEXAH_USER;
  const password = process.env.NEXAH_PASSWORD;
  const sender = process.env.NEXAH_SENDER || "AIDORA";

  if (!user || !password) throw new Error("NEXAH_USER ou NEXAH_PASSWORD manquant");

  const params = new URLSearchParams({
    user,
    password,
    sender,
    msg: message,
    to: telephone,
  });

  const reponse = await fetch(
    `https://sms.nexah.net/api/v1/directsend?${params.toString()}`
  );

  if (!reponse.ok) {
    throw new Error(`Nexah API error: ${reponse.status}`);
  }

  const data = await reponse.json();
  return data?.messageId || null;
}

/**
 * Twilio (international).
 */
async function envoyerTwilio(telephone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    throw new Error("Configuration Twilio manquante");
  }

  const client = require("twilio")(accountSid, authToken);
  const result = await client.messages.create({
    body: message,
    from,
    to: telephone,
  });

  return result.sid;
}

// ============================================
// UTILITAIRES
// ============================================

/**
 * Normalise un numéro de téléphone (retire espaces, tirets).
 * Force le format +XXX...
 */
function normaliserTelephone(telephone) {
  if (!telephone) return null;

  let clean = String(telephone).replace(/[\s\-\(\)\.]/g, "");

  if (!clean.startsWith("+")) {
    if (clean.startsWith("00")) clean = "+" + clean.slice(2);
    else if (clean.startsWith("237")) clean = "+" + clean;
    else return null;
  }

  if (!/^\+\d{8,15}$/.test(clean)) return null;

  return clean;
}

/**
 * Enregistre un envoi dans la table `traces_sms`.
 */
async function tracerEnvoi(
  utilisateurId,
  telephone,
  message,
  statut,
  provider = null,
  providerMessageId = null,
  erreur = null
) {
  try {
    await pool.query(
      `INSERT INTO traces_sms
        (utilisateur_id, telephone, message, statut, provider, provider_message_id, erreur)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        utilisateurId,
        telephone,
        message,
        statut,
        provider,
        providerMessageId,
        erreur,
      ]
    );
  } catch (err) {
    logger.error(`[SMS] Impossible de tracer l'envoi : ${err.message}`);
  }
}

async function tracerEchec(utilisateurId, telephone, message, erreur) {
  return tracerEnvoi(utilisateurId, telephone, message, "ECHOUE", null, null, erreur);
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  envoyer,
  envoyerCodeActivation,
  envoyerInvitation,
  envoyerConfirmationRdv,
  normaliserTelephone,
};