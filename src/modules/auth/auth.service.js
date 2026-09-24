// ============================================
// AIDORA - SERVICE AUTH
// ============================================

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const authRepository = require("./auth.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");
const journalAudit = require("../journal-audit/journalAudit.service");
const notificationService = require("../notifications/notifications.service");
const emailService = require("../../services/emailService");
const smsService = require("../../services/smsService");
require("dotenv").config();

// ============================================
// CONSTANTES
// ============================================

const IDENTIFIANTS_INCORRECTS = "Identifiant ou mot de passe incorrect";

// Hash bcrypt valide (coût 10) pour comparaison à temps constant si l'utilisateur n'existe pas
const HASH_FACTICE =
  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

const BCRYPT_ROUNDS = 12;
const DUREE_CODE_ACTIVATION_MIN = 15;   // 15 minutes
const DUREE_CODE_INVITATION_JOURS = 7;  // 7 jours

// ============================================
// UTILITAIRES
// ============================================

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
}

function genererCodeActivation() {
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += caracteres[crypto.randomInt(0, caracteres.length)];
  }
  return `AID-${code}`;
}

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function calculerExpiration(minutes = DUREE_CODE_ACTIVATION_MIN) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function calculerExpirationJours(jours) {
  return new Date(Date.now() + jours * 24 * 60 * 60 * 1000);
}

/**
 * Envoie un code d'activation par email ET/OU SMS (selon les infos fournies).
 * Ne bloque jamais l'inscription si l'envoi échoue.
 */
async function envoyerCodeMultiCanal({
  utilisateurId,
  prenom,
  email,
  telephone,
  code,
  type = "ACTIVATION", // ACTIVATION | INVITATION | REINITIALISATION
}) {
  const envois = [];

  // Email
  if (email) {
    let promesse;
    if (type === "ACTIVATION") {
      promesse = emailService.envoyerCodeActivationDonneur({
        destinataire: email,
        prenom,
        code,
        utilisateurId,
      });
    } else if (type === "REINITIALISATION") {
      promesse = emailService.envoyerCodeReinitialisation({
        destinataire: email,
        prenom,
        code,
        utilisateurId,
      });
    }
    if (promesse) envois.push(promesse.catch((e) => ({ succes: false, erreur: e.message })));
  }

  // SMS
  if (telephone) {
    envois.push(
      smsService.envoyerCodeActivation(telephone, prenom, code, utilisateurId)
        .catch((e) => ({ succes: false, erreur: e.message }))
    );
  }

  if (envois.length === 0) {
    logger.warn(`[Auth] Aucun canal d'envoi disponible pour #${utilisateurId}`);
    return { envoye: false };
  }

  const resultats = await Promise.all(envois);
  const succes = resultats.some((r) => r.succes);

  return { envoye: succes, resultats };
}

// ============================================
// CONNEXION
// ============================================

async function login(identifiant, motDePasse, adresseIp = null) {
  const utilisateur = await authRepository.findUtilisateurByIdentifiant(identifiant);

  if (!utilisateur) {
    await bcrypt.compare(motDePasse, HASH_FACTICE);
    throw new AppError(IDENTIFIANTS_INCORRECTS, 401, "AUTH_FAILED");
  }

  if (utilisateur.statut_compte !== "ACTIF") {
    throw new AppError("Compte non activé ou suspendu", 403, "COMPTE_INACTIF");
  }

  const valide = await bcrypt.compare(motDePasse, utilisateur.mot_de_passe);
  if (!valide) {
    await journalAudit.enregistrer({
      utilisateur_id: utilisateur.id,
      action: "CONNEXION_ECHOUEE",
      nouvelle_valeur: { identifiant, raison: "MOT_DE_PASSE_INCORRECT" },
      adresse_ip: adresseIp,
    });
    throw new AppError(IDENTIFIANTS_INCORRECTS, 401, "AUTH_FAILED");
  }

  const payload = { id: utilisateur.id, role: utilisateur.role };
  let extras = {};

  if (utilisateur.role === "DONNEUR") {
    extras = (await authRepository.getDonneurExtras(utilisateur.id)) || {};
  } else if (
    utilisateur.role === "PERSONNEL_BANQUE" ||
    utilisateur.role === "PERSONNEL_HOPITAL"
  ) {
    extras = (await authRepository.getPersonnelExtras(utilisateur.id)) || {};
    payload.etablissementId = extras.etablissement_id;
  }

  const token = signToken(payload);

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "CONNEXION",
    nouvelle_valeur: {
      role: utilisateur.role,
      etablissement_id: extras.etablissement_id || null,
    },
    adresse_ip: adresseIp,
  });

  logger.info(`Connexion réussie : #${utilisateur.id} (${utilisateur.role})`);

  return {
    token,
    user: {
      id: utilisateur.id,
      nom: utilisateur.nom,
      prenom: utilisateur.prenom,
      role: utilisateur.role,
      ...extras,
    },
  };
}

// ============================================
// DÉCONNEXION
// ============================================

async function logout(utilisateurId, adresseIp = null) {
  await journalAudit.enregistrer({
    utilisateur_id: utilisateurId,
    action: "DECONNEXION",
    adresse_ip: adresseIp,
  });
  return { message: "Déconnexion réussie" };
}

// ============================================
// INSCRIPTION PUBLIQUE D'UN DONNEUR
// ============================================

/**
 * Inscription publique d'un visiteur.
 * Le donneur n'est PAS rattaché à une banque à l'inscription.
 * Il reçoit un code d'activation par email et/ou SMS.
 */
async function inscrireDonneur(data, adresseIp = null) {
  const {
    nom,
    prenom,
    email,
    telephone,
    motDePasse,
    groupeSanguin,
    rhesus,
    dateNaissance,
    sexe,
    latitude,
    longitude,
    ville,
    quartier,
  } = data;

  // Validation minimale : téléphone obligatoire (contrainte DB)
  if (!telephone) {
    throw new AppError("Le téléphone est obligatoire", 400, "TELEPHONE_REQUIS");
  }
  if (!email && !telephone) {
    throw new AppError(
      "Au moins un email ou un téléphone est requis",
      400,
      "CONTACT_REQUIS"
    );
  }

  // Hash du mot de passe
  const motDePasseHash = await bcrypt.hash(motDePasse, BCRYPT_ROUNDS);

  // Générer le code d'activation
  const codeActivation = genererCodeActivation();
  const codeHash = hashCode(codeActivation);

  // Créer le compte via transaction
  const resultat = await authRepository.creerDonneurInscription({
    nom,
    prenom,
    email: email || null,
    telephone,
    motDePasseHash,
    groupeSanguin,
    rhesus,
    dateNaissance,
    sexe,
    latitude,
    longitude,
    ville,
    quartier,
    codeActivation,
    codeHash,
  });

  // Audit
  await journalAudit.enregistrer({
    utilisateur_id: resultat.utilisateurId,
    action: "INSCRIPTION_DONNEUR",
    nouvelle_valeur: {
      email: email || null,
      telephone,
      groupe_sanguin: groupeSanguin,
      rhesus,
    },
    adresse_ip: adresseIp,
  });

  logger.info(`Inscription donneur #${resultat.utilisateurId} réussie`);

  // Envoi du code (ne bloque jamais)
  try {
    await envoyerCodeMultiCanal({
      utilisateurId: resultat.utilisateurId,
      prenom,
      email,
      telephone,
      code: codeActivation,
      type: "ACTIVATION",
    });
  } catch (err) {
    logger.error(`[Auth] Échec envoi code inscription : ${err.message}`);
  }

  return {
    utilisateurId: resultat.utilisateurId,
    email: email || null,
    telephone,
    dateExpiration: resultat.dateExpiration,
    message:
      "Inscription réussie. Un code d'activation vous a été envoyé par email et/ou SMS.",
  };
}

// ============================================
// ACTIVATION DE COMPTE (email OU téléphone)
// ============================================

async function activerCompte({ courriel, telephone, code }, adresseIp = null) {
  let utilisateur = null;
  if (courriel) {
    utilisateur = await authRepository.findUtilisateurByEmail(courriel);
  } else if (telephone) {
    utilisateur = await authRepository.findUtilisateurByTelephone(telephone);
  }

  if (!utilisateur) {
    throw new AppError("Code invalide ou expiré", 400, "CODE_INVALIDE");
  }

  if (utilisateur.statut_compte === "ACTIF") {
    throw new AppError("Ce compte est déjà activé", 400, "DEJA_ACTIF");
  }

  const codeHash = hashCode(code);
  const activation = await authRepository.findActivationValide(
    utilisateur.id,
    codeHash
  );

  if (!activation) {
    throw new AppError("Code invalide ou expiré", 400, "CODE_INVALIDE");
  }

  await authRepository.activerCompteTransactionnel(
    utilisateur.id,
    activation.id
  );

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "ACTIVATION_COMPTE",
    nouvelle_valeur: { statut: "ACTIF" },
    adresse_ip: adresseIp,
  });

  await notificationService.notifier(utilisateur.id, {
    titre: "Compte activé",
    message: "Votre compte Aidora est actif. Vous pouvez vous connecter.",
    type: "SYSTEME",
  });

  if (utilisateur.email) {
    emailService
      .envoyerBienvenueDonneur({
        destinataire: utilisateur.email,
        prenom: utilisateur.prenom,
        utilisateurId: utilisateur.id,
      })
      .catch((e) => logger.error(`[Auth] Bienvenue email : ${e.message}`));
  }

  logger.info(`Compte #${utilisateur.id} activé`);

  return { message: "Compte activé avec succès" };
}

// ============================================
// RENVOI DE CODE D'ACTIVATION
// ============================================

async function renvoyerCodeActivation({ courriel, telephone }) {
  let utilisateur = null;
  if (courriel) utilisateur = await authRepository.findUtilisateurByEmail(courriel);
  else if (telephone) utilisateur = await authRepository.findUtilisateurByTelephone(telephone);

  if (!utilisateur) {
    return {
      message: "Si un compte correspondant existe, un nouveau code sera envoyé.",
    };
  }

  if (utilisateur.statut_compte === "ACTIF") {
    throw new AppError("Ce compte est déjà activé", 400, "DEJA_ACTIF");
  }

  const code = genererCodeActivation();
  const codeHash = hashCode(code);
  const dateExpiration = calculerExpiration();

  await authRepository.remplacerActivation(utilisateur.id, codeHash, dateExpiration);

  await envoyerCodeMultiCanal({
    utilisateurId: utilisateur.id,
    prenom: utilisateur.prenom,
    email: utilisateur.email,
    telephone: utilisateur.telephone,
    code,
    type: "ACTIVATION",
  });

  logger.info(`Nouveau code d'activation pour #${utilisateur.id}`);

  return {
    message: "Un nouveau code d'activation a été envoyé.",
    dateExpiration,
  };
}

// ============================================
// MOT DE PASSE OUBLIÉ
// ============================================

async function demanderReinitialisation({ courriel, telephone }) {
  let utilisateur = null;
  if (courriel) utilisateur = await authRepository.findUtilisateurByEmail(courriel);
  else if (telephone) utilisateur = await authRepository.findUtilisateurByTelephone(telephone);

  if (!utilisateur || utilisateur.statut_compte !== "ACTIF") {
    return {
      message:
        "Si un compte actif correspond à ce contact, un code de réinitialisation a été envoyé.",
    };
  }

  const code = genererCodeActivation();
  const codeHash = hashCode(code);
  const dateExpiration = calculerExpiration();

  await authRepository.remplacerActivation(utilisateur.id, codeHash, dateExpiration);

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "DEMANDE_REINITIALISATION_MDP",
  });

  await envoyerCodeMultiCanal({
    utilisateurId: utilisateur.id,
    prenom: utilisateur.prenom,
    email: utilisateur.email,
    telephone: utilisateur.telephone,
    code,
    type: "REINITIALISATION",
  });

  logger.info(`Code de réinitialisation pour #${utilisateur.id}`);

  return {
    message:
      "Si un compte actif correspond à ce contact, un code de réinitialisation a été envoyé.",
  };
}

// ============================================
// RÉINITIALISATION DU MOT DE PASSE
// ============================================

async function reinitialiserMotDePasse(
  { courriel, telephone, code, nouveauMotDePasse },
  adresseIp = null
) {
  let utilisateur = null;
  if (courriel) utilisateur = await authRepository.findUtilisateurByEmail(courriel);
  else if (telephone) utilisateur = await authRepository.findUtilisateurByTelephone(telephone);

  if (!utilisateur || utilisateur.statut_compte !== "ACTIF") {
    throw new AppError("Code invalide ou expiré", 400, "CODE_INVALIDE");
  }

  const codeHash = hashCode(code);
  const activation = await authRepository.findActivationValide(utilisateur.id, codeHash);

  if (!activation) {
    throw new AppError("Code invalide ou expiré", 400, "CODE_INVALIDE");
  }

  const motDePasseHash = await bcrypt.hash(nouveauMotDePasse, BCRYPT_ROUNDS);

  await authRepository.changerMotDePasseTransactionnel(
    utilisateur.id,
    motDePasseHash,
    activation.id
  );

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "REINITIALISATION_MDP",
    adresse_ip: adresseIp,
  });

  await notificationService.notifier(utilisateur.id, {
    titre: "Mot de passe réinitialisé",
    message:
      "Votre mot de passe a été réinitialisé. Si vous n'êtes pas à l'origine de cette action, contactez immédiatement l'administrateur.",
    type: "ALERTE",
  });

  return { message: "Mot de passe réinitialisé avec succès." };
}

// ============================================
// MODIFICATION DU MOT DE PASSE (connecté)
// ============================================

async function modifierMotDePasse(
  utilisateurId,
  { ancienMotDePasse, nouveauMotDePasse },
  adresseIp = null
) {
  const utilisateur = await authRepository.findUtilisateurById(utilisateurId);
  if (!utilisateur || !utilisateur.mot_de_passe) {
    throw new AppError("Utilisateur introuvable", 404, "NOT_FOUND");
  }

  const valide = await bcrypt.compare(ancienMotDePasse, utilisateur.mot_de_passe);
  if (!valide) {
    throw new AppError("Ancien mot de passe incorrect", 401, "AUTH_FAILED");
  }

  const motDePasseHash = await bcrypt.hash(nouveauMotDePasse, BCRYPT_ROUNDS);
  await authRepository.updateMotDePasse(utilisateurId, motDePasseHash);

  await journalAudit.enregistrer({
    utilisateur_id: utilisateurId,
    action: "MODIFIER_MOT_DE_PASSE",
    adresse_ip: adresseIp,
  });

  await notificationService.notifier(utilisateurId, {
    titre: "Mot de passe modifié",
    message:
      "Votre mot de passe a bien été modifié. Si vous n'êtes pas à l'origine de cette action, contactez immédiatement l'administrateur.",
    type: "ALERTE",
  });

  return { message: "Mot de passe modifié avec succès." };
}

// ============================================
// INVITATION PAR LA BANQUE (registre)
// ============================================

async function inviterDonneursParBanque(data, utilisateurAdmin = null) {
  const {
    etablissementId,
    prenom,
    nom,
    telephone,
    email,
    groupeSanguin,
    rhesus,
    source = "MANUEL",
  } = data;

  if (!etablissementId) {
    throw new AppError(
      "L'établissement est obligatoire",
      400,
      "ETABLISSEMENT_REQUIS"
    );
  }
  if (!email && !telephone) {
    throw new AppError(
      "Au moins un email ou un téléphone est requis pour envoyer l'invitation",
      400,
      "CONTACT_REQUIS"
    );
  }

  const codeActivation = genererCodeActivation();
  const dateExpiration = calculerExpirationJours(DUREE_CODE_INVITATION_JOURS);

  const resultat = await authRepository.creerInvitation({
    etablissementId,
    prenom,
    nom,
    telephone: telephone || null,
    email: email || null,
    groupeSanguin: groupeSanguin || null,
    rhesus: rhesus || null,
    codeActivation,
    source,
    dateExpiration,
  });

  await journalAudit.enregistrer({
    utilisateur_id: utilisateurAdmin?.id || null,
    action: "INVITER_DONNEUR",
    nouvelle_valeur: {
      invitation_id: resultat.invitationId,
      etablissement_id: etablissementId,
      email: email || null,
      telephone: telephone || null,
    },
  });

  const envois = [];

  if (email) {
    envois.push(
      emailService.envoyerInvitationRegistre({
        destinataire: email,
        prenom,
        nomEtablissement: data.nomEtablissement || "la banque de sang",
        code: codeActivation,
        utilisateurId: utilisateurAdmin?.id || null,
      }).catch((e) => ({ succes: false, erreur: e.message }))
    );
  }

  if (telephone) {
    envois.push(
      smsService.envoyerInvitation(
        telephone,
        prenom,
        data.nomEtablissement || "la banque de sang",
        codeActivation,
        utilisateurAdmin?.id || null
      ).catch((e) => ({ succes: false, erreur: e.message }))
    );
  }

  await Promise.all(envois);

  logger.info(`Invitation créée pour ${prenom} ${nom} (étab #${etablissementId})`);

  return {
    invitationId: resultat.invitationId,
    dateExpiration,
    message: "Invitation envoyée avec succès.",
  };
}

// ============================================
// ACCEPTER UNE INVITATION
// ============================================

async function accepterInvitation({ code, motDePasse }, adresseIp = null) {
  const invitation = await authRepository.trouverInvitationParCode(code);
  if (!invitation) {
    throw new AppError("Code d'invitation invalide ou expiré", 400, "CODE_INVALIDE");
  }

  const existant = await authRepository.findUtilisateurParEmailOuTelephone(
    invitation.email,
    invitation.telephone
  );

  if (existant) {
    await authRepository.updateStatutInvitation(invitation.id, "ACCEPTEE");
    await authRepository.creerRattachementInitial(
      existant.id,
      invitation.etablissement_id,
      "INVITATION"
    );
    await journalAudit.enregistrer({
      utilisateur_id: existant.id,
      action: "ACCEPTER_INVITATION",
      nouvelle_valeur: {
        invitation_id: invitation.id,
        etablissement_id: invitation.etablissement_id,
      },
      adresse_ip: adresseIp,
    });
    return {
      utilisateurId: existant.id,
      message: "Invitation acceptée. Vous êtes rattaché à l'établissement.",
    };
  }

  const motDePasseHash = await bcrypt.hash(motDePasse, BCRYPT_ROUNDS);
  const codeActivation = genererCodeActivation();
  const codeHash = hashCode(codeActivation);

  const resultat = await authRepository.creerDonneurInscription({
    nom: invitation.nom,
    prenom: invitation.prenom,
    email: invitation.email,
    telephone: invitation.telephone,
    motDePasseHash,
    groupeSanguin: invitation.groupe_sanguin || "O",
    rhesus: invitation.rhesus || "POSITIF",
    dateNaissance: null,
    sexe: null,
    latitude: null,
    longitude: null,
    ville: null,
    quartier: null,
    codeActivation,
    codeHash,
  });

  await authRepository.creerRattachementInitial(
    resultat.utilisateurId,
    invitation.etablissement_id,
    "INVITATION"
  );
  await authRepository.updateStatutInvitation(invitation.id, "ACCEPTEE");

  await journalAudit.enregistrer({
    utilisateur_id: resultat.utilisateurId,
    action: "ACCEPTER_INVITATION",
    nouvelle_valeur: {
      invitation_id: invitation.id,
      etablissement_id: invitation.etablissement_id,
    },
    adresse_ip: adresseIp,
  });

  try {
    await envoyerCodeMultiCanal({
      utilisateurId: resultat.utilisateurId,
      prenom: invitation.prenom,
      email: invitation.email,
      telephone: invitation.telephone,
      code: codeActivation,
      type: "ACTIVATION",
    });
  } catch (err) {
    logger.error(`[Auth] Envoi code après invitation : ${err.message}`);
  }

  return {
    utilisateurId: resultat.utilisateurId,
    message: "Inscription réussie. Un code d'activation vous a été envoyé pour activer votre compte.",
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  login,
  logout,
  inscrireDonneur,
  activerCompte,
  renvoyerCodeActivation,
  demanderReinitialisation,
  reinitialiserMotDePasse,
  modifierMotDePasse,
  inviterDonneursParBanque,
  accepterInvitation,
  genererCodeActivation,
  hashCode,
  calculerExpiration,
};
