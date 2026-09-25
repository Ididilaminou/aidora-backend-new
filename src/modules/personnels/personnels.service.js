const repository = require("./personnels.repository");
const etablissementRepository = require("../etablissements/etablissements.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const journalAudit = require("../journal-audit/journalAudit.service");
const notificationService = require("../notifications/notifications.service");
const smsService = require("../../services/smsService");
const emailService = require("../../services/emailService");

const ROLES_PERSONNEL = [
  "PERSONNEL_BANQUE",
  "PERSONNEL_HOPITAL",
  "ADMINISTRATEUR",
];

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

/**
 * Génère un mot de passe temporaire lisible.
 */
function genererMotDePasseTemporaire() {
  const caracteres = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let motDePasse = "";
  for (let i = 0; i < 10; i++) {
    motDePasse += caracteres[crypto.randomInt(0, caracteres.length)];
  }
  return motDePasse;
}

/**
 * Vérifie qu'un hôpital possède une banque de sang.
 */
function hopitalPossedeBanque(etab) {
  if (!etab || etab.type !== "HOPITAL") return false;
  if (typeof etab.possede_banque_de_sang === "boolean") {
    return etab.possede_banque_de_sang;
  }
  return etab.possede_banque_de_sang === 1;
}

/**
 * Vérifie la cohérence entre un rôle et un établissement.
 */
function verifierCoherenceRoleEtablissement(role, etab) {
  if (role === "PERSONNEL_BANQUE") {
    const estValide =
      etab.type === "BANQUE_DE_SANG" || hopitalPossedeBanque(etab);
    if (!estValide) {
      throw new AppError(
        "Un personnel de banque doit être rattaché à une banque de sang (ou un hôpital avec banque de sang)",
        400,
        "BAD_REQUEST"
      );
    }
    return;
  }

  if (role === "PERSONNEL_HOPITAL" && etab.type !== "HOPITAL") {
    throw new AppError(
      "Un personnel hospitalier doit être rattaché à un hôpital",
      400,
      "BAD_REQUEST"
    );
  }
}

/**
 * Génère le HTML de l'email d'identifiants.
 */
function genererHtmlIdentifiants({ prenom, courriel, motDePasseTemporaire }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #dc2626; margin: 0;">Aidora</h1>
        <p style="color: #64748b; font-size: 12px; margin: 4px 0 0 0;">Ensemble, sauvons des vies.</p>
      </div>

      <h2 style="color: #0f172a;">Bienvenue ${prenom} !</h2>
      <p>Un administrateur vient de créer votre compte personnel sur la plateforme Aidora.</p>

      <div style="background: #f8fafc; border-left: 4px solid #dc2626; padding: 16px; margin: 24px 0; border-radius: 8px;">
        <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;"><strong>Email</strong></p>
        <p style="margin: 0 0 16px 0; font-family: monospace; font-size: 14px;">${courriel}</p>

        <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;"><strong>Mot de passe temporaire</strong></p>
        <p style="margin: 0; font-family: monospace; font-size: 20px; font-weight: bold; color: #dc2626; letter-spacing: 2px;">
          ${motDePasseTemporaire}
        </p>
      </div>

      <p style="text-align: center; margin: 32px 0;">
        <a href="${FRONTEND_URL}/connexion"
           style="display: inline-block; background: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
          Se connecter
        </a>
      </p>

      <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 8px; margin-top: 24px;">
        <p style="margin: 0; font-size: 13px; color: #b45309;">
          ⚠️ Ce mot de passe est <strong>temporaire</strong>. Modifiez-le dès votre première connexion.
        </p>
      </div>

      <p style="font-size: 12px; color: #94a3b8; margin-top: 32px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px;">
        Vous recevez cet email car un compte a été créé pour vous sur Aidora.<br/>
        Si vous n'êtes pas concerné, ignorez ce message.
      </p>
    </div>
  `;
}

/**
 * Envoie les identifiants par SMS + Email.
 * Ne bloque JAMAIS la création en cas d'échec.
 *
 * ⚠️ On utilise les VRAIES signatures des services :
 *    - smsService.envoyerCodeActivationDonneur({ telephone, prenom, code })
 *    - emailService.envoyer({ destinataire, sujet, html, utilisateurId })
 */
async function envoyerIdentifiants({
  prenom,
  nom,
  courriel,
  telephone,
  motDePasseTemporaire,
  utilisateurId = null,
}) {
  const resultats = { sms: false, email: false };

  // -------- SMS --------
  if (telephone) {
    try {
      await smsService.envoyer({
        telephone,
        message:
          `Aidora : Bienvenue ${prenom} ! ` +
          `Votre compte personnel est actif. ` +
          `Email : ${courriel} | ` +
          `Mot de passe temporaire : ${motDePasseTemporaire} | ` +
          `Connectez-vous : ${FRONTEND_URL}/connexion`,
        utilisateurId,
      });
      logger.info(`📱 SMS identifiants envoyé à ${telephone}`);
      resultats.sms = true;
    } catch (err) {
      logger.error(`Échec SMS identifiants vers ${telephone} : ${err.message}`);
    }
  }

  // -------- Email --------
  if (courriel) {
    try {
      const html = genererHtmlIdentifiants({
        prenom,
        courriel,
        motDePasseTemporaire,
      });
      await emailService.envoyer({
        destinataire: courriel,
        sujet: "Aidora — Vos identifiants de connexion",
        html,
        utilisateurId,
      });
      logger.info(`📧 Email identifiants envoyé à ${courriel}`);
      resultats.email = true;
    } catch (err) {
      logger.error(
        `Échec email identifiants vers ${courriel} : ${err.message}`
      );
    }
  }

  return resultats;
}
/**
 * Liste les personnels avec filtres.
 */
async function lister(filtres) {
  return repository.findAll(filtres);
}

/**
 * Récupère le profil du personnel connecté.
 */
async function monProfil(utilisateur) {
  const personnel = await repository.findByUserId(utilisateur.id);
  if (!personnel) {
    throw new AppError("Profil personnel introuvable", 404, "NOT_FOUND");
  }
  return personnel;
}

/**
 * Récupère un personnel par ID (avec contrôle d'accès).
 */
async function consulter(id, utilisateur) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant invalide", 400, "VALIDATION_ERROR");
  }

  const personnel = await repository.findById(idNum);
  if (!personnel) {
    throw new AppError("Personnel introuvable", 404, "NOT_FOUND");
  }

  if (
    utilisateur.role !== "ADMINISTRATEUR" &&
    personnel.etablissement_id !== utilisateur.etablissementId
  ) {
    throw new AppError("Accès refusé à ce personnel", 403, "FORBIDDEN");
  }

  return personnel;
}

/**
 * Crée un nouveau compte personnel + envoie les identifiants.
 */
async function creer(donnees, createur) {
  const {
    courriel,
    prenom,
    nom,
    telephone,
    role,
    etablissement_id,
    fonction,
  } = donnees;

  // Validation du rôle
  if (!ROLES_PERSONNEL.includes(role)) {
    throw new AppError(
      `Rôle invalide. Doit être : ${ROLES_PERSONNEL.join(", ")}`,
      400,
      "VALIDATION_ERROR"
    );
  }

  // Unicité courriel
  const emailExiste = await repository.emailExiste(courriel);
  if (emailExiste) {
    throw new AppError(
      "Un compte existe déjà avec ce courriel",
      409,
      "CONFLICT"
    );
  }

  // Unicité téléphone
  if (telephone) {
    const telExiste = await repository.telephoneExiste(telephone);
    if (telExiste) {
      throw new AppError(
        "Un compte existe déjà avec ce téléphone",
        409,
        "CONFLICT"
      );
    }
  }

  // Vérifier l'établissement + cohérence
  if (etablissement_id) {
    const etab = await etablissementRepository.findById(etablissement_id);
    if (!etab) {
      throw new AppError("Établissement introuvable", 404, "NOT_FOUND");
    }
    verifierCoherenceRoleEtablissement(role, etab);
  } else if (role !== "ADMINISTRATEUR") {
    throw new AppError(
      "Un personnel doit être rattaché à un établissement",
      400,
      "BAD_REQUEST"
    );
  }

  // Générer mot de passe temporaire
  const motDePasseTemporaire = genererMotDePasseTemporaire();
  const motDePasseHash = await bcrypt.hash(motDePasseTemporaire, 12);

  // Créer utilisateur + personnel
  const resultat = await repository.creerUtilisateurEtPersonnel({
    courriel,
    motDePasseHash,
    prenom,
    nom,
    telephone,
    role,
    etablissement_id,
    fonction,
    createur_id: createur.id,
  });

  const libelleCompte =
    role === "ADMINISTRATEUR" ? "Administrateur" : "Compte personnel";

  logger.info(
    `${libelleCompte} #${resultat.id} créé par #${createur.id} (rôle : ${role})`
  );

  // 📝 Audit
  await journalAudit.enregistrer({
    utilisateur_id: createur.id,
    action: "CREER_PERSONNEL",
    ancienne_valeur: null,
    nouvelle_valeur: {
      personnel_id: resultat.id,
      role,
      etablissement_id,
    },
  });

  // 🔔 Notification interne
  try {
    await notificationService.notifier(resultat.id, {
      titre: "🎉 Bienvenue sur Aidora",
      message:
        "Votre compte personnel a été créé. Changez votre mot de passe dès la première connexion.",
      type: "SYSTEME",
    });
  } catch (err) {
    logger.error(`Notification interne échouée : ${err.message}`);
  }

  // 📱📧 Envoi automatique des identifiants (SMS + Email)
  const envoyes = await envoyerIdentifiants({
    prenom,
    nom,
    courriel,
    telephone,
    motDePasseTemporaire,
    utilisateurId: resultat.id,
  });

  return {
    utilisateur: resultat,
    // On renvoie le mot de passe UNE SEULE FOIS
    // (au cas où l'envoi automatique échoue).
    motDePasseTemporaire,
    envoyes, // { sms: true/false, email: true/false }
  };
}

/**
 * Modifie un personnel.
 */
async function modifier(id, donnees) {
  await consulter(id, { role: "ADMINISTRATEUR" });

  const donneesNettoyees = { ...donnees };
  delete donneesNettoyees.role;
  delete donneesNettoyees.motDePasse;
  delete donneesNettoyees.courriel;

  return repository.update(Number(id), donneesNettoyees);
}

/**
 * Rattache un personnel à un établissement.
 */
async function rattacher(id, { etablissement_id }) {
  const personnel = await consulter(id, { role: "ADMINISTRATEUR" });

  const etab = await etablissementRepository.findById(etablissement_id);
  if (!etab) {
    throw new AppError("Établissement introuvable", 404, "NOT_FOUND");
  }

  verifierCoherenceRoleEtablissement(personnel.role, etab);

  return repository.updateEtablissement(Number(id), etablissement_id);
}

/**
 * Change le statut d'un compte.
 */
async function changerStatut(id, statut) {
  await consulter(id, { role: "ADMINISTRATEUR" });

  if (!["ACTIF", "INACTIF", "BLOQUE"].includes(statut)) {
    throw new AppError("Statut invalide", 400, "VALIDATION_ERROR");
  }

  return repository.updateStatut(Number(id), statut);
}

/**
 * Supprime un personnel.
 */
async function supprimer(id, utilisateur) {
  const personnel = await consulter(id, { role: "ADMINISTRATEUR" });

  if (personnel.id === utilisateur.id) {
    throw new AppError(
      "Vous ne pouvez pas supprimer votre propre compte",
      400,
      "BAD_REQUEST"
    );
  }

  await repository.delete(Number(id));
  logger.warn(`Personnel #${id} supprimé par admin #${utilisateur.id}`);
}

module.exports = {
  lister,
  monProfil,
  consulter,
  creer,
  modifier,
  rattacher,
  changerStatut,
  supprimer,
};