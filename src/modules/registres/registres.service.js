const fs = require("fs");
const csv = require("csv-parser");
const crypto = require("crypto");
const repository = require("./registres.repository");
const authRepository = require("../auth/auth.repository");
const etablissementRepository = require("../etablissements/etablissements.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");
const journalAudit = require("../journal-audit/journalAudit.service");
const notificationService = require("../notifications/notifications.service");
const emailService = require("../../services/emailService");
const smsService = require("../../services/smsService");

const DUREE_INVITATION_JOURS = 7;

// ============================================
// UTILITAIRES
// ============================================

/**
 * Génère un code d'invitation (format AID-XXXXXX).
 */
function genererCodeInvitation() {
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += caracteres[crypto.randomInt(0, caracteres.length)];
  }
  return `AID-${code}`;
}

/**
 * Normalise un numéro de téléphone.
 */
function normaliserTelephone(tel) {
  if (!tel) return null;
  let clean = String(tel).replace(/[\s\-\(\)\.]/g, "");
  if (!clean.startsWith("+")) {
    if (clean.startsWith("00")) clean = "+" + clean.slice(2);
    else if (clean.startsWith("237")) clean = "+" + clean;
    else return null;
  }
  if (!/^\+\d{8,15}$/.test(clean)) return null;
  return clean;
}

/**
 * Valide une ligne du registre.
 */
function validerLigne(ligne, index) {
  const erreurs = [];

  if (!ligne.nom || ligne.nom.trim().length < 2) {
    erreurs.push("Nom manquant ou trop court");
  }
  if (!ligne.prenom || ligne.prenom.trim().length < 2) {
    erreurs.push("Prénom manquant ou trop court");
  }

  const email = ligne.email ? ligne.email.trim().toLowerCase() : null;
  const telephone = normaliserTelephone(ligne.telephone);

  if (!email && !telephone) {
    erreurs.push("Au moins un email ou téléphone est requis");
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    erreurs.push("Email invalide");
  }

  const groupeSanguin = ligne.groupe_sanguin
    ? ligne.groupe_sanguin.trim().toUpperCase()
    : null;
  if (groupeSanguin && !["A", "B", "AB", "O"].includes(groupeSanguin)) {
    erreurs.push("Groupe sanguin invalide");
  }

  const rhesus = ligne.rhesus ? ligne.rhesus.trim().toUpperCase() : null;
  if (rhesus && !["POSITIF", "NEGATIF"].includes(rhesus)) {
    erreurs.push("Rhésus invalide");
  }

  return {
    valide: erreurs.length === 0,
    erreurs,
    donnees: {
      nom: ligne.nom ? ligne.nom.trim() : null,
      prenom: ligne.prenom ? ligne.prenom.trim() : null,
      email,
      telephone,
      groupe_sanguin: groupeSanguin,
      rhesus,
    },
    index: index + 2, // Ligne 1 = en-têtes CSV
  };
}

// ============================================
// INVITATION D'UN DONNEUR (unitaire)
// ============================================

/**
 * Invite un donneur (saisie manuelle par la banque).
 */
async function inviterDonneur(data, utilisateur) {
  const etablissementId = data.etablissement_id || utilisateur.etablissementId;

  if (!etablissementId) {
    throw new AppError("Établissement requis", 400, "ETABLISSEMENT_REQUIS");
  }

  // Vérifier que l'établissement existe
  const etab = await etablissementRepository.findById(etablissementId);
  if (!etab) {
    throw new AppError("Établissement introuvable", 404, "NOT_FOUND");
  }

  // Validation
  if (!data.nom || !data.prenom) {
    throw new AppError("Nom et prénom requis", 400, "CHAMPS_REQUIS");
  }

  const email = data.email ? data.email.trim().toLowerCase() : null;
  const telephone = normaliserTelephone(data.telephone);

  if (!email && !telephone) {
    throw new AppError(
      "Au moins un email ou téléphone est requis",
      400,
      "CONTACT_REQUIS"
    );
  }

  // Vérifier qu'il n'y a pas déjà une invitation en attente
  const existante = await repository.findInvitationEnAttenteParContact(
    etablissementId,
    email,
    telephone
  );

  if (existante) {
    throw new AppError(
      "Une invitation est déjà en attente pour ce donneur",
      409,
      "INVITATION_DEJA_EXISTANTE"
    );
  }

  // Vérifier si le donneur existe déjà sur la plateforme
  const utilisateurExistant = await authRepository.findUtilisateurParEmailOuTelephone(
    email,
    telephone
  );

  // Générer le code d'invitation
  const codeActivation = genererCodeInvitation();
  const dateExpiration = new Date(
    Date.now() + DUREE_INVITATION_JOURS * 24 * 60 * 60 * 1000
  );

  // Créer l'invitation
  const invitation = await repository.creerInvitation({
    etablissement_id: etablissementId,
    donneur_existant_id: utilisateurExistant?.id || null,
    prenom: data.prenom.trim(),
    nom: data.nom.trim(),
    telephone,
    email,
    groupe_sanguin: data.groupe_sanguin || null,
    rhesus: data.rhesus || null,
    code_activation: codeActivation,
    source: data.source || "MANUEL",
    date_expiration: dateExpiration,
  });

  // 📤 Envoi des invitations
  await envoyerInvitation({
    invitation_id: invitation.id,
    prenom: data.prenom,
    nom: data.nom,
    email,
    telephone,
    nomEtablissement: etab.nom,
    codeActivation,
    utilisateurId: utilisateur.id,
  });

  // 📝 Audit
  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "INVITER_DONNEUR",
    nouvelle_valeur: {
      invitation_id: invitation.id,
      etablissement_id: etablissementId,
      email,
      telephone,
      donneur_existant: !!utilisateurExistant,
    },
  });

  logger.info(
    `Invitation #${invitation.id} créée pour ${data.prenom} ${data.nom}`
  );

  return {
    invitation_id: invitation.id,
    donneur_existant: !!utilisateurExistant,
    date_expiration: dateExpiration,
    message: utilisateurExistant
      ? "Ce donneur existe déjà. Il a été notifié pour se rattacher à votre établissement."
      : "Invitation envoyée par email et/ou SMS.",
  };
}

/**
 * Envoie l'invitation par email et/ou SMS.
 */
async function envoyerInvitation({
  invitation_id,
  prenom,
  nom,
  email,
  telephone,
  nomEtablissement,
  codeActivation,
  utilisateurId,
}) {
  const envois = [];

  if (email) {
    envois.push(
      emailService
        .envoyerInvitationRegistre({
          destinataire: email,
          prenom,
          nomEtablissement,
          code: codeActivation,
          utilisateurId,
        })
        .catch((e) => {
          logger.error(`[Registres] Email échec : ${e.message}`);
          return { succes: false, erreur: e.message };
        })
    );
  }

  if (telephone) {
    envois.push(
      smsService
        .envoyerInvitation(telephone, prenom, nomEtablissement, codeActivation, utilisateurId)
        .catch((e) => {
          logger.error(`[Registres] SMS échec : ${e.message}`);
          return { succes: false, erreur: e.message };
        })
    );
  }

  const resultats = await Promise.all(envois);
  const succes = resultats.some((r) => r.succes);

  if (!succes) {
    logger.warn(`[Registres] Aucun envoi réussi pour invitation #${invitation_id}`);
  }

  return { succes };
}

// ============================================
// IMPORT CSV EN MASSE
// ============================================

/**
 * Importe un fichier CSV de donneurs (registre papier).
 * Chaque ligne crée une invitation.
 *
 * @returns {{ total, importes, echoues, erreurs, invitations }}
 */
async function importerCsv(filePath, utilisateur, etablissementId = null) {
  const etabId = etablissementId || utilisateur.etablissementId;

  if (!etabId) {
    throw new AppError("Établissement requis", 400, "ETABLISSEMENT_REQUIS");
  }

  const etab = await etablissementRepository.findById(etabId);
  if (!etab) {
    throw new AppError("Établissement introuvable", 404, "NOT_FOUND");
  }

  const lignes = await lireCsv(filePath);

  if (lignes.length === 0) {
    throw new AppError("Le fichier CSV est vide", 400, "CSV_VIDE");
  }

  const resultats = {
    total: lignes.length,
    importes: 0,
    echoues: 0,
    doublons: 0,
    erreurs: [],
    invitations: [],
  };

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    const validation = validerLigne(ligne, i);

    if (!validation.valide) {
      resultats.echoues++;
      resultats.erreurs.push({
        ligne: validation.index,
        donnees: ligne,
        erreurs: validation.erreurs,
      });
      continue;
    }

    try {
      const donnees = validation.donnees;

      // Vérifier doublon d'invitation
      const existante = await repository.findInvitationEnAttenteParContact(
        etabId,
        donnees.email,
        donnees.telephone
      );

      if (existante) {
        resultats.doublons++;
        continue;
      }

      // Vérifier si le donneur existe déjà
      const utilisateurExistant = await authRepository.findUtilisateurParEmailOuTelephone(
        donnees.email,
        donnees.telephone
      );

      const codeActivation = genererCodeInvitation();
      const dateExpiration = new Date(
        Date.now() + DUREE_INVITATION_JOURS * 24 * 60 * 60 * 1000
      );

      const invitation = await repository.creerInvitation({
        etablissement_id: etabId,
        donneur_existant_id: utilisateurExistant?.id || null,
        prenom: donnees.prenom,
        nom: donnees.nom,
        telephone: donnees.telephone,
        email: donnees.email,
        groupe_sanguin: donnees.groupe_sanguin,
        rhesus: donnees.rhesus,
        code_activation: codeActivation,
        source: "CSV",
        date_expiration: dateExpiration,
      });

      // Envoi (non bloquant)
      await envoyerInvitation({
        invitation_id: invitation.id,
        prenom: donnees.prenom,
        nom: donnees.nom,
        email: donnees.email,
        telephone: donnees.telephone,
        nomEtablissement: etab.nom,
        codeActivation,
        utilisateurId: utilisateur.id,
      });

      resultats.importes++;
      resultats.invitations.push({
        invitation_id: invitation.id,
        email: donnees.email,
        telephone: donnees.telephone,
      });
    } catch (err) {
      resultats.echoues++;
      resultats.erreurs.push({
        ligne: validation.index,
        donnees: ligne,
        erreurs: [err.message],
      });
    }
  }

  // 📝 Audit global
  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "IMPORTER_REGISTRE_CSV",
    nouvelle_valeur: {
      etablissement_id: etabId,
      total: resultats.total,
      importes: resultats.importes,
      echoues: resultats.echoues,
      doublons: resultats.doublons,
    },
  });

  logger.info(
    `Import CSV terminé : ${resultats.importes}/${resultats.total} importés pour étab #${etabId}`
  );

  return resultats;
}

/**
 * Lit un fichier CSV et retourne un tableau d'objets.
 */
function lireCsv(filePath) {
  return new Promise((resolve, reject) => {
    const lignes = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => lignes.push(data))
      .on("end", () => resolve(lignes))
      .on("error", (err) => reject(err));
  });
}

// ============================================
// LISTE / SUIVI
// ============================================

async function listerInvitations(filtres, utilisateur) {
  // Un personnel ne voit que les invitations de son établissement
  if (
    (utilisateur.role === "PERSONNEL_BANQUE" || utilisateur.role === "PERSONNEL_HOPITAL") &&
    utilisateur.etablissementId
  ) {
    filtres.etablissement_id = utilisateur.etablissementId;
  }

  const invitations = await repository.findAllInvitations(filtres);

  // Mise à jour automatique du statut des invitations expirées
  const maintenant = new Date();
  for (const inv of invitations) {
    if (
      inv.statut === "EN_ATTENTE" &&
      new Date(inv.date_expiration) < maintenant
    ) {
      await repository.updateStatutInvitation(inv.id, "EXPIREE");
      inv.statut = "EXPIREE";
    }
  }

  return { invitations };
}

async function consulterInvitation(id, utilisateur) {
  const invitation = await repository.findInvitationById(id);

  if (!invitation) {
    throw new AppError("Invitation introuvable", 404, "NOT_FOUND");
  }

  // Contrôle d'accès
  if (
    utilisateur.role === "PERSONNEL_BANQUE" &&
    invitation.etablissement_id !== utilisateur.etablissementId
  ) {
    throw new AppError("Accès refusé", 403, "FORBIDDEN");
  }

  return invitation;
}

async function annulerInvitation(id, utilisateur) {
  const invitation = await consulterInvitation(id, utilisateur);

  if (invitation.statut !== "EN_ATTENTE") {
    throw new AppError(
      `Impossible d'annuler une invitation au statut ${invitation.statut}`,
      400,
      "STATUT_INVALIDE"
    );
  }

  const updated = await repository.updateStatutInvitation(id, "EXPIREE");

  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "ANNULER_INVITATION",
    ancienne_valeur: { statut: "EN_ATTENTE" },
    nouvelle_valeur: { statut: "EXPIREE" },
  });

  return updated;
}

async function statsInvitations(utilisateur) {
  const etabId = utilisateur.etablissementId;
  if (!etabId) {
    throw new AppError("Aucun établissement rattaché", 403, "FORBIDDEN");
  }

  const stats = await repository.statsInvitations(etabId);
  return { stats };
}

// ============================================
// ACCEPTATION D'INVITATION (par le donneur)
// ============================================

/**
 * Le donneur accepte une invitation et finalise son inscription.
 */
async function accepterInvitation({ code, motDePasse }, adresseIp = null) {
  const authService = require("../auth/auth.service");
  return authService.accepterInvitation({ code, motDePasse }, adresseIp);
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  inviterDonneur,
  importerCsv,
  listerInvitations,
  consulterInvitation,
  annulerInvitation,
  statsInvitations,
  accepterInvitation,
};