// ============================================
// AIDORA - SERVICE EMAIL (abstraction multi-fournisseur)
// ============================================
//
// Providers supportés :
//   - mock     : log dans la console (dev, aucun frais)
//   - brevo    : API HTTP transactionnelle (recommandé prod)
//   - gmail    : SMTP Gmail
//   - smtp     : SMTP générique
//   - sendgrid : SMTP SendGrid
//
// Pour changer de provider : modifier EMAIL_PROVIDER dans .env
// Le reste du code reste INCHANGÉ.
//

const nodemailer = require("nodemailer");
const logger = require("../config/logger");
const { pool } = require("../config/db");

// ============================================
// CONFIGURATION
// ============================================

const EMAIL_PROVIDER   = process.env.EMAIL_PROVIDER || "mock";
const EMAIL_ACTIF      = process.env.EMAIL_ACTIF !== "false";
const EMAIL_FROM_NAME  = process.env.EMAIL_FROM_NAME || "Aidora";
const EMAIL_FROM_EMAIL = process.env.EMAIL_FROM_EMAIL || "noreply@aidora.cm";
const EMAIL_FROM       = process.env.EMAIL_FROM || `${EMAIL_FROM_NAME} <${EMAIL_FROM_EMAIL}>`;
const FRONTEND_URL     = process.env.FRONTEND_URL || "http://localhost:5173";
const BREVO_API_KEY    = process.env.BREVO_API_KEY;

// Transporteur Nodemailer (instancié une seule fois, uniquement pour SMTP)
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
      auth: {
        user: "apikey",
        pass: process.env.SENDGRID_API_KEY,
      },
    });
  } else {
    throw new Error(`Fournisseur email inconnu pour SMTP : ${EMAIL_PROVIDER}`);
  }

  return transporter;
}

// ============================================
// ENVOI VIA BREVO (API HTTP v3)
// ============================================

async function envoyerViaBrevo({ destinataire, sujet, html, texte }) {
  if (!BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY manquante dans .env");
  }

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
      textContent: texte || stripHtml(html),
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Brevo HTTP ${res.status} — ${errBody}`);
  }

  const data = await res.json();
  return { messageId: data.messageId || null };
}

// ============================================
// FONCTION PRINCIPALE D'ENVOI
// ============================================

/**
 * Envoie un email.
 *
 * @param {Object} options
 * @param {string} options.destinataire - Email du destinataire
 * @param {string} options.sujet        - Sujet de l'email
 * @param {string} options.html         - Contenu HTML
 * @param {string} [options.texte]      - Version texte (fallback)
 * @param {number|null} [options.utilisateurId] - ID utilisateur (traçabilité)
 * @returns {Promise<{succes: boolean, messageId?: string, erreur?: string}>}
 */
async function envoyer({ destinataire, sujet, html, texte = null, utilisateurId = null }) {
  if (!destinataire) {
    logger.warn(`[EMAIL] Destinataire manquant`);
    await tracerEnvoi(utilisateurId, null, sujet, "ECHOUE", null, null, "DESTINATAIRE_MANQUANT");
    return { succes: false, erreur: "Destinataire manquant" };
  }

  if (!EMAIL_ACTIF) {
    logger.info(`[EMAIL] Désactivé par config — email non envoyé à ${destinataire}`);
    await tracerEnvoi(utilisateurId, destinataire, sujet, "DESACTIVE", null, null, null);
    return { succes: true, messageId: null };
  }

  // -------- MODE MOCK (console, dev) --------
  if (EMAIL_PROVIDER === "mock") {
    logger.info("┌─────────────────────────────────────────────");
    logger.info(`│ [EMAIL MOCK] À       : ${destinataire}`);
    logger.info(`│ [EMAIL MOCK] Sujet   : ${sujet}`);
    logger.info(`│ [EMAIL MOCK] Contenu : ${(html || texte || "").slice(0, 150)}...`);
    logger.info("└─────────────────────────────────────────────");
    await tracerEnvoi(utilisateurId, destinataire, sujet, "ENVOYE", "mock", "mock-id", null);
    return { succes: true, messageId: `mock-${Date.now()}` };
  }

  // -------- MODE BREVO (API HTTP) --------
  if (EMAIL_PROVIDER === "brevo") {
    try {
      const { messageId } = await envoyerViaBrevo({ destinataire, sujet, html, texte });
      logger.info(`[EMAIL/BREVO] Envoyé à ${destinataire} (id: ${messageId})`);
      await tracerEnvoi(utilisateurId, destinataire, sujet, "ENVOYE", "brevo", messageId, null);
      return { succes: true, messageId };
    } catch (err) {
      logger.error(`[EMAIL/BREVO] Échec envoi à ${destinataire} : ${err.message}`);
      await tracerEnvoi(utilisateurId, destinataire, sujet, "ECHOUE", "brevo", null, err.message);
      return { succes: false, erreur: err.message };
    }
  }

  // -------- MODE SMTP (gmail / smtp / sendgrid) --------
  try {
    const transport = getTransporter();

    const info = await transport.sendMail({
      from: EMAIL_FROM,
      to: destinataire,
      subject: sujet,
      text: texte || stripHtml(html),
      html,
    });

    logger.info(`[EMAIL/${EMAIL_PROVIDER}] Envoyé à ${destinataire} (id: ${info.messageId})`);
    await tracerEnvoi(utilisateurId, destinataire, sujet, "ENVOYE", EMAIL_PROVIDER, info.messageId, null);

    return { succes: true, messageId: info.messageId };
  } catch (err) {
    logger.error(`[EMAIL/${EMAIL_PROVIDER}] Échec envoi à ${destinataire} : ${err.message}`);
    await tracerEnvoi(utilisateurId, destinataire, sujet, "ECHOUE", EMAIL_PROVIDER, null, err.message);
    return { succes: false, erreur: err.message };
  }
}

// ============================================
// TEMPLATES PRÉDÉFINIS
// ============================================

/**
 * Envoie un code d'activation à un nouveau donneur.
 */
async function envoyerCodeActivationDonneur({ destinataire, prenom, code, utilisateurId = null }) {
  const sujet = "Aidora — Votre code d'activation";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Bienvenue sur Aidora 🩸</h2>
      <p>Bonjour <strong>${prenom}</strong>,</p>
      <p>Merci de rejoindre la communauté Aidora. Voici votre code d'activation :</p>
      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <p style="font-size: 12px; color: #64748b; margin: 0;">CODE D'ACTIVATION</p>
        <p style="font-size: 32px; font-weight: bold; color: #dc2626; letter-spacing: 3px; margin: 10px 0;">${code}</p>
        <p style="font-size: 12px; color: #64748b; margin: 0;">Valable 15 minutes</p>
      </div>
      <p>Rendez-vous sur <a href="${FRONTEND_URL}/activation">${FRONTEND_URL}/activation</a> pour activer votre compte.</p>
      <p style="color: #64748b; font-size: 12px; margin-top: 30px;">Ne partagez jamais ce code. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      <p style="color: #94a3b8; font-size: 11px;">— L'équipe Aidora</p>
    </div>
  `;

  return envoyer({ destinataire, sujet, html, utilisateurId });
}

/**
 * Envoie une invitation à un donneur du registre papier.
 */
async function envoyerInvitationRegistre({
  destinataire,
  prenom,
  nomEtablissement,
  code,
  utilisateurId = null,
}) {
  const sujet = `${nomEtablissement} vous invite sur Aidora`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Vous êtes invité à rejoindre Aidora 🩸</h2>
      <p>Bonjour <strong>${prenom}</strong>,</p>
      <p>L'établissement <strong>${nomEtablissement}</strong> vous invite à créer votre compte donneur sur Aidora.</p>
      <p>Votre code d'invitation :</p>
      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <p style="font-size: 28px; font-weight: bold; color: #dc2626; letter-spacing: 3px; margin: 0;">${code}</p>
      </div>
      <p>Créez votre compte ici : <a href="${FRONTEND_URL}/inscription?code=${code}">${FRONTEND_URL}/inscription</a></p>
      <p style="color: #64748b; font-size: 12px; margin-top: 30px;">Ce code est valable 7 jours.</p>
      <p style="color: #94a3b8; font-size: 11px;">— L'équipe Aidora</p>
    </div>
  `;

  return envoyer({ destinataire, sujet, html, utilisateurId });
}

/**
 * Envoie une confirmation de RDV.
 */
async function envoyerConfirmationRdv({
  destinataire,
  prenom,
  dateRdv,
  heureRdv,
  nomEtablissement,
  utilisateurId = null,
}) {
  const sujet = "Aidora — Confirmation de votre RDV";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Rendez-vous confirmé ✅</h2>
      <p>Bonjour <strong>${prenom}</strong>,</p>
      <p>Votre rendez-vous pour un don de sang est confirmé :</p>
      <ul>
        <li><strong>Établissement :</strong> ${nomEtablissement}</li>
        <li><strong>Date :</strong> ${dateRdv}</li>
        <li><strong>Heure :</strong> ${heureRdv}</li>
      </ul>
      <p>Merci de vous présenter 10 minutes avant l'heure prévue.</p>
      <p style="color: #94a3b8; font-size: 11px;">— L'équipe Aidora</p>
    </div>
  `;

  return envoyer({ destinataire, sujet, html, utilisateurId });
}

/**
 * Envoie un email de bienvenue après activation.
 */
async function envoyerBienvenueDonneur({ destinataire, prenom, utilisateurId = null }) {
  const sujet = "Bienvenue sur Aidora 🩸";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Votre compte est actif 🎉</h2>
      <p>Bonjour <strong>${prenom}</strong>,</p>
      <p>Votre compte Aidora est maintenant activé. Vous pouvez dès à présent :</p>
      <ul>
        <li>Compléter votre profil donneur</li>
        <li>Vérifier votre éligibilité au don</li>
        <li>Rechercher une banque de sang proche</li>
        <li>Prendre rendez-vous pour un don</li>
      </ul>
      <p><a href="${FRONTEND_URL}/connexion" style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">Accéder à mon espace</a></p>
      <p style="color: #94a3b8; font-size: 11px; margin-top: 30px;">— L'équipe Aidora</p>
    </div>
  `;

  return envoyer({ destinataire, sujet, html, utilisateurId });
}

/**
 * Rappel : éligibilité expirée.
 */
async function envoyerAlerteEligibiliteExpiree({ destinataire, prenom, utilisateurId = null }) {
  const sujet = "Aidora — Renouvelez votre test d'éligibilité";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Test d'éligibilité à renouveler ⚠️</h2>
      <p>Bonjour <strong>${prenom}</strong>,</p>
      <p>Votre test d'éligibilité au don de sang a expiré. Pour continuer à donner, merci de le refaire.</p>
      <p><a href="${FRONTEND_URL}/donneur/questionnaire">Refaire le test</a></p>
      <p style="color: #94a3b8; font-size: 11px;">— L'équipe Aidora</p>
    </div>
  `;

  return envoyer({ destinataire, sujet, html, utilisateurId });
}

/**
 * Réinitialisation de mot de passe.
 */
async function envoyerCodeReinitialisation({ destinataire, prenom, code, utilisateurId = null }) {
  const sujet = "Aidora — Réinitialisation de votre mot de passe";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Réinitialisation du mot de passe 🔒</h2>
      <p>Bonjour <strong>${prenom}</strong>,</p>
      <p>Vous avez demandé à réinitialiser votre mot de passe. Voici votre code :</p>
      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <p style="font-size: 32px; font-weight: bold; color: #dc2626; letter-spacing: 3px; margin: 0;">${code}</p>
      </div>
      <p>Ce code est valable 15 minutes.</p>
      <p style="color: #64748b; font-size: 12px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      <p style="color: #94a3b8; font-size: 11px;">— L'équipe Aidora</p>
    </div>
  `;

  return envoyer({ destinataire, sujet, html, utilisateurId });
}

// ============================================
// UTILITAIRES
// ============================================

/**
 * Retire les balises HTML (pour le fallback texte).
 */
function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Enregistre un envoi dans la table `traces_email`.
 */
async function tracerEnvoi(
  utilisateurId,
  destinataire,
  sujet,
  statut,
  provider = null,
  providerMessageId = null,
  erreur = null
) {
  try {
    await pool.query(
      `INSERT INTO traces_email
        (utilisateur_id, destinataire, sujet, statut, provider, provider_message_id, erreur)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [utilisateurId, destinataire, sujet, statut, provider, providerMessageId, erreur]
    );
  } catch (err) {
    // Si la table n'existe pas encore, ne pas planter
    if (err.code !== "ER_NO_SUCH_TABLE") {
      logger.error(`[EMAIL] Impossible de tracer l'envoi : ${err.message}`);
    }
  }
}

// ============================================
// VÉRIFICATION DE LA CONNEXION
// ============================================

/**
 * Vérifie que le fournisseur email est bien configuré et joignable.
 */
async function verifierConnexion() {
  if (EMAIL_PROVIDER === "mock") {
    logger.info("[EMAIL] Mode mock actif (aucun envoi réel — affichage console)");
    return true;
  }

  if (EMAIL_PROVIDER === "brevo") {
    if (!BREVO_API_KEY) {
      logger.error("[EMAIL/BREVO] ❌ BREVO_API_KEY manquante dans .env");
      return false;
    }
    try {
      const res = await fetch("https://api.brevo.com/v3/account", {
        headers: {
          accept: "application/json",
          "api-key": BREVO_API_KEY,
        },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} — ${body}`);
      }
      const data = await res.json();
      logger.info(`[EMAIL/BREVO] ✅ Connexion OK (compte: ${data.email || "inconnu"})`);
      return true;
    } catch (err) {
      logger.error(`[EMAIL/BREVO] ❌ Connexion échouée : ${err.message}`);
      return false;
    }
  }

  // gmail / smtp / sendgrid
  try {
    const transport = getTransporter();
    await transport.verify();
    logger.info(`[EMAIL/${EMAIL_PROVIDER}] ✅ Connexion SMTP OK`);
    return true;
  } catch (err) {
    logger.error(`[EMAIL/${EMAIL_PROVIDER}] ❌ Connexion SMTP échouée : ${err.message}`);
    return false;
  }
}

/**
 * Envoie les identifiants (email + mot de passe temporaire) à un nouveau personnel.
 * Le personnel devra changer son mot de passe à la première connexion.
 */
async function envoyerIdentifiantsPersonnel({
  destinataire,
  prenom,
  nom,
  email,
  motDePasseTemporaire,
  nomEtablissement,
  role,
  utilisateurId = null,
}) {
  const sujet = "Aidora — Vos identifiants de connexion";

  const libelleRole =
    role === "PERSONNEL_BANQUE"
      ? "Personnel de banque de sang"
      : role === "PERSONNEL_HOPITAL"
      ? "Personnel d'hôpital"
      : role;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Bienvenue sur Aidora 🩸</h2>
      <p>Bonjour <strong>${prenom} ${nom}</strong>,</p>
      <p>Un compte professionnel vous a été créé sur la plateforme Aidora.</p>

      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="font-size: 12px; color: #64748b; margin: 0 0 10px;">VOS IDENTIFIANTS</p>
        <p style="margin: 5px 0;"><strong>Rôle :</strong> ${libelleRole}</p>
        ${nomEtablissement ? `<p style="margin: 5px 0;"><strong>Établissement :</strong> ${nomEtablissement}</p>` : ""}
        <p style="margin: 5px 0;"><strong>Email :</strong> ${email}</p>
        <p style="margin: 5px 0;"><strong>Mot de passe temporaire :</strong>
          <span style="font-family: monospace; font-size: 18px; color: #dc2626; font-weight: bold;">${motDePasseTemporaire}</span>
        </p>
      </div>

      <p><strong>⚠️ Important :</strong> Ce mot de passe est temporaire. Vous devrez le changer à votre première connexion.</p>

      <p style="text-align: center; margin: 30px 0;">
        <a href="${FRONTEND_URL}/connexion" style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
          Me connecter
        </a>
      </p>

      <p style="color: #64748b; font-size: 12px;">Si vous n'êtes pas à l'origine de cette demande, contactez immédiatement votre administrateur.</p>
      <p style="color: #94a3b8; font-size: 11px;">— L'équipe Aidora</p>
    </div>
  `;

  return envoyer({ destinataire, sujet, html, utilisateurId });
}

// ============================================
// EXPORTS
// ============================================

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