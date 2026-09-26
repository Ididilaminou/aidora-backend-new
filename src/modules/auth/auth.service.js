// ============================================
// AIDORA - SERVICE AUTH
// ============================================

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const repo = require("./auth.repository");
const emailService = require("../../services/email.service");
const logger = require("../../config/logger");
const AppError = require("../../utils/AppError");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

if (!JWT_SECRET) {
  logger.error("[AUTH] ⚠️ JWT_SECRET manquant dans .env — la connexion plantera !");
}

// ============================================
// HELPERS
// ============================================

function genererCodeActivation() {
  const aleatoire = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `AID-${aleatoire}`;
}

function hasherCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * Normalise un utilisateur pour le frontend.
 * Format attendu par le type Utilisateur (snake_case + id + role).
 */
function normaliserUtilisateur(u, extras = null) {
  if (!u) return null;
  return {
    id: u.id,
    nom: u.nom,
    prenom: u.prenom,
    email: u.email,
    telephone: u.telephone,
    role: u.role,
    statut_compte: u.statut_compte,
    doit_changer_mot_de_passe: u.doit_changer_mot_de_passe === 1,
    etablissement_id: extras?.etablissement_id ?? null,
    ...(extras || {}),
  };
}

// ============================================
// LOGIN
// ============================================

async function login(identifiant, motDePasse, ip = null) {
  if (!identifiant || !motDePasse) {
    throw new AppError("Identifiant et mot de passe obligatoires", 400, "CHAMPS_MANQUANTS");
  }

  const u = await repo.findUtilisateurByIdentifiant(identifiant);

  if (!u || !(await bcrypt.compare(motDePasse, u.mot_de_passe))) {
    throw new AppError("Identifiant ou mot de passe incorrect", 401, "IDENTIFIANTS_INCORRECTS");
  }

  if (u.statut_compte !== "ACTIF") {
    throw new AppError(
      "Votre compte n'est pas encore activé. Vérifiez votre email pour l'activer.",
      403,
      "COMPTE_INACTIF"
    );
  }

  // Extras selon le rôle
  let extras = null;
  if (u.role === "DONNEUR") {
    extras = await repo.getDonneurExtras(u.id);
  } else if (u.role === "PERSONNEL_BANQUE" || u.role === "PERSONNEL_HOPITAL") {
    extras = await repo.getPersonnelExtras(u.id);
  }

  const jeton = jwt.sign(
    { id: u.id, identifiant: u.id, role: u.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  // ✅ Format EXACT attendu par le frontend : { token, user }
  return {
    token: jeton,
    user: normaliserUtilisateur(u, extras),
  };
}

async function logout(userId, ip = null) {
  return { message: "Déconnexion réussie" };
}

// ============================================
// INSCRIPTION DONNEUR
// ============================================

async function inscrireDonneur(data, ip = null) {
  const {
    prenom, nom, email, telephone, motDePasse, groupeSanguin, rhesus,
    ville, quartier, adresse, latitude, longitude,
  } = data;

  // Validations
  if (!prenom || !nom || !telephone || !motDePasse || !groupeSanguin || !rhesus) {
    throw new AppError("Champs obligatoires manquants", 400, "CHAMPS_MANQUANTS");
  }
  if (motDePasse.length < 8) {
    throw new AppError("Le mot de passe doit contenir au moins 8 caractères", 400, "MDP_TROP_COURT");
  }
  if (!/[a-zA-Z]/.test(motDePasse) || !/\d/.test(motDePasse)) {
    throw new AppError("Le mot de passe doit contenir au moins une lettre et un chiffre", 400, "MDP_FAIBLE");
  }
  if (!["A", "B", "AB", "O"].includes(groupeSanguin)) {
    throw new AppError("Groupe sanguin invalide", 400, "GROUPE_INVALIDE");
  }
  if (!["POSITIF", "NEGATIF"].includes(rhesus)) {
    throw new AppError("Rhésus invalide", 400, "RHESUS_INVALIDE");
  }

  const emailNormalise = email ? email.trim().toLowerCase() : null;
  const telephoneNormalise = telephone.trim();

  const motDePasseHash = await bcrypt.hash(motDePasse, 12);
  const codeActivation = genererCodeActivation();
  const codeHash = hasherCode(codeActivation);

  const result = await repo.creerDonneurInscription({
    nom: nom.trim(),
    prenom: prenom.trim(),
    email: emailNormalise,
    telephone: telephoneNormalise,
    motDePasseHash,
    groupeSanguin,
    rhesus,
    ville: ville || null,
    quartier: quartier || null,
    latitude: latitude || null,
    longitude: longitude || null,
    codeHash,
    codeActivation,
  });

  // Email (non bloquant)
  if (emailNormalise) {
    emailService
      .envoyerCodeActivationDonneur({
        destinataire: emailNormalise,
        prenom: prenom.trim(),
        code: codeActivation,
        telephone: telephoneNormalise,
        utilisateurId: result.utilisateurId,
      })
      .catch((err) => logger.error(`[AUTH] Email activation : ${err.message}`));
  }

  logger.info(
    `[AUTH] Inscription donneur #${result.utilisateurId} (${emailNormalise || telephoneNormalise})`
  );

  return {
    message: emailNormalise
      ? "Inscription réussie. Un code d'activation vous a été envoyé par email."
      : "Inscription réussie. Un code d'activation vous sera communiqué.",
    utilisateur_id: result.utilisateurId,
    utilisateurId: result.utilisateurId, // compat
    email: emailNormalise,
    telephone: telephoneNormalise,
    codeActivation, // TEMPORAIRE — à retirer en prod
    dateExpiration: result.dateExpiration,
  };
}

// ============================================
// ACTIVATION
// ============================================

async function activerCompte(data, ip = null) {
  // Accepte { identifiant, codeActivation } OU { courriel, telephone, codeActivation }
  const identifiant = data.identifiant || data.courriel || data.email || data.telephone;
  const codeActivation = data.codeActivation || data.code;

  if (!identifiant || !codeActivation) {
    throw new AppError("Identifiant et code d'activation obligatoires", 400, "CHAMPS_MANQUANTS");
  }

  const codeNormalise = codeActivation.trim().toUpperCase();
  if (!/^AID-[A-Z0-9]{6}$/.test(codeNormalise)) {
    throw new AppError("Le code doit respecter le format AID-XXXXXX", 400, "CODE_INVALIDE");
  }

  const u = await repo.findUtilisateurByIdentifiant(identifiant.trim());
  if (!u) {
    throw new AppError("Le code d'activation est invalide ou expiré", 400, "CODE_INVALIDE");
  }

  if (u.statut_compte === "ACTIF") {
    throw new AppError("Ce compte est déjà activé", 400, "DEJA_ACTIF");
  }

  const codeHash = hasherCode(codeNormalise);
  const activation = await repo.findActivationValide(u.id, codeHash);

  if (!activation) {
    throw new AppError("Le code d'activation est invalide ou expiré", 400, "CODE_INVALIDE");
  }

  await repo.activerCompteTransactionnel(u.id, activation.id);

  // Email de bienvenue (non bloquant)
  if (u.email) {
    emailService
      .envoyerBienvenueDonneur({
        destinataire: u.email,
        prenom: u.prenom,
        utilisateurId: u.id,
      })
      .catch(() => {});
  }

  logger.info(`[AUTH] Compte #${u.id} activé`);

  return { message: "Compte activé avec succès. Vous pouvez maintenant vous connecter." };
}

async function renvoyerCodeActivation(data) {
  const identifiant = data.identifiant || data.courriel || data.email || data.telephone;

  if (!identifiant) {
    throw new AppError("Identifiant obligatoire", 400, "CHAMPS_MANQUANTS");
  }

  const u = await repo.findUtilisateurByIdentifiant(identifiant.trim());

  if (!u) {
    // Réponse générique
    return { message: "Si un compte correspondant existe, un nouveau code sera envoyé." };
  }

  if (u.statut_compte === "ACTIF") {
    throw new AppError("Ce compte est déjà activé. Connectez-vous.", 400, "DEJA_ACTIF");
  }

  const codeActivation = genererCodeActivation();
  const codeHash = hasherCode(codeActivation);
  const dateExpiration = new Date(Date.now() + 15 * 60 * 1000);

  await repo.remplacerActivation(u.id, codeHash, dateExpiration);

  if (u.email) {
    emailService
      .envoyerCodeActivationDonneur({
        destinataire: u.email,
        prenom: u.prenom,
        code: codeActivation,
        telephone: u.telephone,
        utilisateurId: u.id,
      })
      .catch(() => {});
  }

  return {
    message: "Un nouveau code d'activation a été généré.",
    codeActivation, // TEMPORAIRE
    dateExpiration,
  };
}

// ============================================
// MOT DE PASSE OUBLIÉ
// ============================================

async function demanderReinitialisation(data) {
  const identifiant = data.identifiant || data.email || data.telephone;
  if (!identifiant) {
    throw new AppError("Identifiant obligatoire", 400, "CHAMPS_MANQUANTS");
  }

  const u = await repo.findUtilisateurByIdentifiant(identifiant.trim());
  if (!u) {
    return { message: "Si un compte existe, un code vous sera envoyé." };
  }

  const code = genererCodeActivation();
  const codeHash = hasherCode(code);
  const dateExpiration = new Date(Date.now() + 15 * 60 * 1000);

  await repo.remplacerActivation(u.id, codeHash, dateExpiration);

  if (u.email) {
    emailService
      .envoyerCodeReinitialisation({
        destinataire: u.email,
        prenom: u.prenom,
        code,
        utilisateurId: u.id,
      })
      .catch(() => {});
  }

  return {
    message: "Code de réinitialisation envoyé.",
    code, // TEMPORAIRE
    dateExpiration,
  };
}

async function reinitialiserMotDePasse(data, ip = null) {
  const identifiant = data.identifiant || data.email || data.telephone;
  const { code, nouveauMotDePasse } = data;

  if (!identifiant || !code || !nouveauMotDePasse) {
    throw new AppError("Champs obligatoires manquants", 400, "CHAMPS_MANQUANTS");
  }

  if (nouveauMotDePasse.length < 8) {
    throw new AppError("Le mot de passe doit contenir au moins 8 caractères", 400, "MDP_TROP_COURT");
  }

  const u = await repo.findUtilisateurByIdentifiant(identifiant.trim());
  if (!u) {
    throw new AppError("Code invalide ou expiré", 400, "CODE_INVALIDE");
  }

  const codeHash = hasherCode(code.trim().toUpperCase());
  const activation = await repo.findActivationValide(u.id, codeHash);

  if (!activation) {
    throw new AppError("Code invalide ou expiré", 400, "CODE_INVALIDE");
  }

  const hash = await bcrypt.hash(nouveauMotDePasse, 12);
  await repo.changerMotDePasseTransactionnel(u.id, hash, activation.id);

  return { message: "Mot de passe réinitialisé. Connectez-vous." };
}

async function modifierMotDePasse(userId, data, ip = null) {
  const { ancienMotDePasse, nouveauMotDePasse } = data;

  if (!ancienMotDePasse || !nouveauMotDePasse) {
    throw new AppError("Champs obligatoires manquants", 400, "CHAMPS_MANQUANTS");
  }
  if (nouveauMotDePasse.length < 8) {
    throw new AppError("Le nouveau mot de passe doit contenir au moins 8 caractères", 400, "MDP_TROP_COURT");
  }

  const u = await repo.findUtilisateurById(userId);
  if (!u || !(await bcrypt.compare(ancienMotDePasse, u.mot_de_passe))) {
    throw new AppError("Ancien mot de passe incorrect", 401, "MDP_INCORRECT");
  }

  const hash = await bcrypt.hash(nouveauMotDePasse, 12);
  await repo.updateMotDePasse(userId, hash);

  return { message: "Mot de passe modifié avec succès." };
}

// ============================================
// INVITATIONS
// ============================================

async function inviterDonneursParBanque(data, user) {
  const { prenom, nom, email, telephone, groupeSanguin, rhesus, etablissementId } = data;

  if (!prenom || !nom || (!email && !telephone)) {
    throw new AppError("Champs obligatoires manquants", 400, "CHAMPS_MANQUANTS");
  }

  const codeActivation = genererCodeActivation();
  const dateExpiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const etabIdFinal =
    etablissementId ||
    user?.etablissement_id ||
    user?.etablissementIdentifiant;

  if (!etabIdFinal) {
    throw new AppError("Établissement introuvable", 400, "ETABLISSEMENT_MANQUANT");
  }

  const { invitationId } = await repo.creerInvitation({
    etablissementId: etabIdFinal,
    prenom: prenom.trim(),
    nom: nom.trim(),
    email: email ? email.trim().toLowerCase() : null,
    telephone: telephone ? telephone.trim() : null,
    groupeSanguin: groupeSanguin || null,
    rhesus: rhesus || null,
    codeActivation,
    source: "MANUEL",
    dateExpiration,
  });

  // Récupérer le nom de l'établissement (adapter si méthode différente)
  const etab = await repo.findUtilisateurById(etabIdFinal);
  const nomEtablissement = etab?.nom || "Aidora";

  if (email) {
    emailService
      .envoyerInvitationRegistre({
        destinataire: email.trim().toLowerCase(),
        prenom: prenom.trim(),
        nomEtablissement,
        code: codeActivation,
        telephone: telephone || null,
        utilisateurId: user?.id || null,
      })
      .catch(() => {});
  }

  return {
    message: "Invitation envoyée.",
    invitationId,
    codeActivation, // TEMPORAIRE
    dateExpiration,
  };
}

async function accepterInvitation(data, ip = null) {
  const { code, prenom, nom, motDePasse, email, telephone } = data;

  if (!code || !prenom || !nom || !motDePasse) {
    throw new AppError("Champs obligatoires manquants", 400, "CHAMPS_MANQUANTS");
  }

  const invitation = await repo.trouverInvitationParCode(code.trim().toUpperCase());
  if (!invitation) {
    throw new AppError("Code d'invitation invalide ou expiré", 400, "INVITATION_INVALIDE");
  }

  const motDePasseHash = await bcrypt.hash(motDePasse, 12);
  const codeActivation = genererCodeActivation();
  const codeHash = hasherCode(codeActivation);

  const result = await repo.creerDonneurInscription({
    nom: nom.trim(),
    prenom: prenom.trim(),
    email: (email || invitation.email || "").trim().toLowerCase() || null,
    telephone: (telephone || invitation.telephone || "").trim(),
    motDePasseHash,
    groupeSanguin: invitation.groupe_sanguin,
    rhesus: invitation.rhesus,
    codeHash,
    codeActivation,
  });

  // Rattachement à l'établissement inviteur
  await repo.creerRattachementInitial(
    result.utilisateurId,
    invitation.etablissement_id,
    "INVITATION"
  );

  await repo.updateStatutInvitation(invitation.id, "ACCEPTEE");

  return {
    message: "Invitation acceptée. Un code d'activation vous a été envoyé.",
    utilisateurId: result.utilisateurId,
    codeActivation,
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
};