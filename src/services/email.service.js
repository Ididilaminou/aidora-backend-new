// ============================================
// AIDORA - SERVICE EMAIL
// ============================================

const nodemailer = require("nodemailer");
const logger = require("../config/logger");
const { pool } = require("../config/db");

const EMAIL_PROVIDER   = process.env.EMAIL_PROVIDER || "mock";
const EMAIL_ACTIF      = process.env.EMAIL_ACTIF !== "false";
const EMAIL_FROM_NAME  = process.env.EMAIL_FROM_NAME || "Aidora";
const EMAIL_FROM_EMAIL = process.env.EMAIL_FROM_EMAIL || "noreply@aidora.cm";
const EMAIL_FROM       = process.env.EMAIL_FROM || `${EMAIL_FROM_NAME} <${EMAIL_FROM_EMAIL}>`;
const FRONTEND_URL     = process.env.FRONTEND_URL || "http://localhost:5173";
const BREVO_API_KEY    = process.env.BREVO_API_KEY;

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (EMAIL_PROVIDER === "gmail" || EMAIL_PROVIDER === "smtp") {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 465,
      secure: process.env.SMTP_SECURE !== "false",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  } else if (EMAIL_PROVIDER === "sendgrid") {
    transporter = nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false,
      auth: { user: "apikey", pass: process.env.SENDGRID_API_KEY },
    });
  } else {
    throw new Error(`Fournisseur email inconnu pour SMTP : ${EMAIL_PROVIDER}`);
  }

  return transporter;
}

// ============================================
// COMPOSANTS HTML
// ============================================

function boutonCta({ url, texte, couleur = "#dc2626" }) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 28px auto;">
      <tr>
        <td align="center" bgcolor="${couleur}" style="border-radius: 8px;">
          <a href="${url}" target="_blank"
             style="display: inline-block; padding: 14px 32px;
                    font-family: Arial, Helvetica, sans-serif; font-size: 16px;
                    font-weight: bold; color: #ffffff; text-decoration: none;
                    border-radius: 8px; background-color: ${couleur};">
            ${texte}
          </a>
        </td>
      </tr>
    </table>`;
}

function enveloppe({ titre, contenu }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${titre}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;padding:24px 12px;">
    <tr><td align="center">
      <table width="100%" cellspacing="0" cellpadding="0" border="0"
             style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;">
        <tr>
          <td align="center" bgcolor="#dc2626" style="padding:28px 24px;">
            <h1 style="margin:0;color:#fff;font-size:26px;">🩸 Aidora</h1>
            <p style="margin:6px 0 0;color:#fecaca;font-size:13px;">Donner son sang, sauver des vies.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 28px;color:#1e293b;font-size:15px;line-height:1.6;">
            ${contenu}
          </td>
        </tr>
        <tr>
          <td bgcolor="#f1f5f9" style="padding:20px 28px;text-align:center;color:#64748b;font-size:12px;">
            <p style="margin:0;">© ${new Date().getFullYear()} Aidora — Tous droits réservés</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ============================================
// ENVOI PRINCIPAL
// ============================================

async function envoyer({ destinataire, sujet, html, texte = null, utilisateurId = null }) {
  if (!destinataire) {
    logger.warn(`[EMAIL] Destinataire manquant`);
    return { succes: false, erreur: "Destinataire manquant" };
  }

  if (!EMAIL_ACTIF) {
    logger.info(`[EMAIL] Désactivé — email non envoyé à ${destinataire}`);
    return { succes: true, messageId: null };
  }

  if (EMAIL_PROVIDER === "mock") {
    logger.info("┌─────────────────────────────────────────────");
    logger.info(`│ [EMAIL MOCK] À     : ${destinataire}`);
    logger.info(`│ [EMAIL MOCK] Sujet : ${sujet}`);
    logger.info("└─────────────────────────────────────────────");
    return { succes: true, messageId: `mock-${Date.now()}` };
  }

  if (EMAIL_PROVIDER === "brevo") {
    if (!BREVO_API_KEY) {
      logger.error("[EMAIL/BREVO] BREVO_API_KEY manquante");
      return { succes: false, erreur: "BREVO_API_KEY manquante" };
    }
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": BREVO_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: EMAIL_FROM_NAME, email: EMAIL_FROM_EMAIL },
          to: [{ email: destinataire }],
          subject: sujet,
          htmlContent: html,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      logger.info(`[EMAIL/BREVO] Envoyé à ${destinataire}`);
      return { succes: true, messageId: data.messageId };
    } catch (err) {
      logger.error(`[EMAIL/BREVO] Échec : ${err.message}`);
      return { succes: false, erreur: err.message };
    }
  }

  try {
    const transport = getTransporter();
    const info = await transport.sendMail({
      from: EMAIL_FROM,
      to: destinataire,
      subject: sujet,
      text: texte || html.replace(/<[^>]*>/g, ""),
      html,
    });
    logger.info(`[EMAIL/${EMAIL_PROVIDER}] Envoyé à ${destinataire}`);
    return { succes: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`[EMAIL/${EMAIL_PROVIDER}] Échec : ${err.message}`);
    return { succes: false, erreur: err.message };
  }
}

// ============================================
// TEMPLATES
// ============================================

async function envoyerCodeActivationDonneur({ destinataire, prenom, code, telephone = null, utilisateurId = null }) {
  const sujet = "Aidora — Activez votre compte";
  const params = new URLSearchParams();
  params.set("code", code);
  params.set("email", destinataire);
  if (telephone) params.set("tel", telephone);
  const url = `${FRONTEND_URL}/activation?${params.toString()}`;

  const contenu = `
    <h2 style="margin:0 0 16px;color:#dc2626;font-size:22px;">Bienvenue sur Aidora 🩸</h2>
    <p>Bonjour <strong>${prenom}</strong>,</p>
    <p>Merci de rejoindre Aidora. Pour activer votre compte, cliquez sur le bouton ci-dessous :</p>
    ${boutonCta({ url, texte: "Activer mon compte" })}
    <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:24px 0;text-align:center;">
      <p style="font-size:11px;color:#64748b;margin:0 0 8px;">OU SAISISSEZ LE CODE</p>
      <p style="font-size:28px;font-weight:bold;color:#dc2626;letter-spacing:4px;margin:0;font-family:monospace;">${code}</p>
      <p style="font-size:11px;color:#64748b;margin:8px 0 0;">Valable 15 minutes</p>
    </div>`;

  return envoyer({ destinataire, sujet, html: enveloppe({ titre: sujet, contenu }), utilisateurId });
}

async function envoyerInvitationRegistre({ destinataire, prenom, nomEtablissement, code, telephone = null, utilisateurId = null }) {
  const sujet = `${nomEtablissement} vous invite sur Aidora`;
  const params = new URLSearchParams();
  params.set("code", code);
  params.set("email", destinataire);
  if (telephone) params.set("tel", telephone);
  const url = `${FRONTEND_URL}/inscription?${params.toString()}`;

  const contenu = `
    <h2 style="margin:0 0 16px;color:#dc2626;font-size:22px;">Vous êtes invité à rejoindre Aidora 🩸</h2>
    <p>Bonjour <strong>${prenom}</strong>,</p>
    <p>L'établissement <strong>${nomEtablissement}</strong> vous invite à créer votre compte donneur.</p>
    ${boutonCta({ url, texte: "Créer mon compte" })}`;

  return envoyer({ destinataire, sujet, html: enveloppe({ titre: sujet, contenu }), utilisateurId });
}

async function envoyerConfirmationRdv({ destinataire, prenom, dateRdv, heureRdv, nomEtablissement, utilisateurId = null }) {
  const sujet = "Aidora — Confirmation de votre rendez-vous";
  const url = `${FRONTEND_URL}/donneur/rendez-vous`;

  const contenu = `
    <h2 style="margin:0 0 16px;color:#10b981;font-size:22px;">Rendez-vous confirmé ✅</h2>
    <p>Bonjour <strong>${prenom}</strong>,</p>
    <div style="background:#f8fafc;padding:20px;border-radius:8px;margin:20px 0;">
      <p style="margin:6px 0;"><strong>Établissement :</strong> ${nomEtablissement}</p>
      <p style="margin:6px 0;"><strong>Date :</strong> ${dateRdv}</p>
      <p style="margin:6px 0;"><strong>Heure :</strong> ${heureRdv}</p>
    </div>
    ${boutonCta({ url, texte: "Voir mon rendez-vous" })}`;

  return envoyer({ destinataire, sujet, html: enveloppe({ titre: sujet, contenu }), utilisateurId });
}

async function envoyerBienvenueDonneur({ destinataire, prenom, utilisateurId = null }) {
  const sujet = "Bienvenue sur Aidora 🩸";
  const url = `${FRONTEND_URL}/connexion`;

  const contenu = `
    <h2 style="margin:0 0 16px;color:#dc2626;font-size:22px;">Votre compte est actif 🎉</h2>
    <p>Bonjour <strong>${prenom}</strong>,</p>
    <p>Votre compte Aidora est maintenant activé. Connectez-vous :</p>
    ${boutonCta({ url, texte: "Me connecter" })}`;

  return envoyer({ destinataire, sujet, html: enveloppe({ titre: sujet, contenu }), utilisateurId });
}

async function envoyerAlerteEligibiliteExpiree({ destinataire, prenom, utilisateurId = null }) {
  const sujet = "Aidora — Renouvelez votre test d'éligibilité";
  const url = `${FRONTEND_URL}/donneur/questionnaire`;

  const contenu = `
    <h2 style="margin:0 0 16px;color:#f59e0b;font-size:22px;">Test à renouveler ⚠️</h2>
    <p>Bonjour <strong>${prenom}</strong>,</p>
    <p>Votre test d'éligibilité a expiré. Refaites-le :</p>
    ${boutonCta({ url, texte: "Refaire le test", couleur: "#f59e0b" })}`;

  return envoyer({ destinataire, sujet, html: enveloppe({ titre: sujet, contenu }), utilisateurId });
}

async function envoyerCodeReinitialisation({ destinataire, prenom, code, utilisateurId = null }) {
  const sujet = "Aidora — Réinitialisation de mot de passe";
  const params = new URLSearchParams();
  params.set("code", code);
  params.set("email", destinataire);
  const url = `${FRONTEND_URL}/reinitialisation?${params.toString()}`;

  const contenu = `
    <h2 style="margin:0 0 16px;color:#dc2626;font-size:22px;">Réinitialisation 🔒</h2>
    <p>Bonjour <strong>${prenom}</strong>,</p>
    ${boutonCta({ url, texte: "Réinitialiser mon mot de passe" })}
    <div style="background:#f8fafc;padding:16px;border-radius:8px;margin:24px 0;text-align:center;">
      <p style="font-size:28px;font-weight:bold;color:#dc2626;letter-spacing:4px;margin:0;font-family:monospace;">${code}</p>
    </div>`;

  return envoyer({ destinataire, sujet, html: enveloppe({ titre: sujet, contenu }), utilisateurId });
}

async function envoyerIdentifiantsPersonnel({ destinataire, prenom, nom, email, motDePasseTemporaire, nomEtablissement, role, utilisateurId = null }) {
  const sujet = "Aidora — Vos identifiants";
  const url = `${FRONTEND_URL}/connexion`;

  const contenu = `
    <h2 style="margin:0 0 16px;color:#dc2626;font-size:22px;">Bienvenue sur Aidora 🩸</h2>
    <p>Bonjour <strong>${prenom} ${nom}</strong>,</p>
    <div style="background:#f8fafc;padding:20px;border-radius:8px;margin:20px 0;">
      <p style="margin:6px 0;"><strong>Email :</strong> ${email}</p>
      <p style="margin:6px 0;"><strong>Mot de passe :</strong>
        <span style="font-family:monospace;font-size:18px;color:#dc2626;font-weight:bold;">${motDePasseTemporaire}</span>
      </p>
    </div>
    ${boutonCta({ url, texte: "Me connecter" })}`;

  return envoyer({ destinataire, sujet, html: enveloppe({ titre: sujet, contenu }), utilisateurId });
}

// ============================================
// VÉRIFICATION
// ============================================

async function verifierConnexion() {
  if (EMAIL_PROVIDER === "mock") {
    logger.info("[EMAIL] Mode mock actif");
    return true;
  }
  logger.info(`[EMAIL] Provider : ${EMAIL_PROVIDER}`);
  return true;
}

module.exports = {
  envoyer,
  envoyerCodeActivationDonneur,
  envoyerInvitationRegistre,
  envoyerConfirmationRdv,
  envoyerBienvenueDonneur,
  envoyerAlerteEligibiliteExpiree,
  envoyerCodeReinitialisation,
  envoyerIdentifiantsPersonnel,
  verifierConnexion,
};