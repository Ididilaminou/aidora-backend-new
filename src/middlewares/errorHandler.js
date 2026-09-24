const logger = require("../config/logger");

// ============================================================
// MESSAGES MÉTIER PAR CODE
// ------------------------------------------------------------
// Ces codes viennent des AppError du backend.
// Un code connu → message clair garanti côté client.
// ============================================================
const MESSAGES_PAR_CODE = {
  // ---- AUTH / INSCRIPTION ----
  UTILISATEUR_DEJA_EXISTANT: "Un compte existe déjà avec ces informations.",
  DONNEUR_DEJA_EXISTANT: "Un compte donneur existe déjà avec ces informations.",
  EMAIL_DEJA_UTILISE: "Cet email est déjà utilisé par un autre compte.",
  TELEPHONE_DEJA_UTILISE: "Ce numéro de téléphone est déjà utilisé.",
  IDENTIFIANTS_INCORRECTS: "Email/téléphone ou mot de passe incorrect.",
  COMPTE_INACTIF: "Votre compte n'est pas encore activé.",
  COMPTE_BLOQUE: "Votre compte a été bloqué. Contactez le support.",
  COMPTE_INTROUVABLE: "Aucun compte trouvé avec ces identifiants.",
  DONNEUR_INTROUVABLE: "Aucun compte donneur trouvé.",

  // ---- ACTIVATION ----
  CODE_INVALIDE: "Le code d'activation est incorrect.",
  CODE_EXPIRE: "Votre code d'activation a expiré.",
  AUCUNE_ACTIVATION: "Aucun code d'activation en attente.",
  DEJA_ACTIF: "Ce compte est déjà activé.",

  // ---- VALIDATION ----
  VALIDATION_ERROR: "Certains champs sont invalides.",
  ERREUR_VALIDATION: "Certains champs sont invalides.",

  // ---- SÉCURITÉ ----
  UNAUTHORIZED: "Vous devez être connecté.",
  FORBIDDEN: "Vous n'avez pas les droits nécessaires.",
  TOKEN_EXPIRE: "Votre session a expiré.",
  TOKEN_INVALIDE: "Session invalide.",

  // ---- RATE LIMIT ----
  RATE_LIMIT: "Trop de tentatives. Réessayez plus tard.",
  TOO_MANY_REQUESTS: "Trop de requêtes. Patientez un instant.",

  // ---- RESSOURCES ----
  NOT_FOUND: "Ressource introuvable.",
  ROUTE_INTROUVABLE: "Cette route n'existe pas.",
};

// ============================================================
// ERREURS MYSQL → RÉPONSE HTTP PROPRE
// ============================================================
function mapDbError(err) {
  if (err.code === "ER_DUP_ENTRY") {
    return {
      status: 409,
      message: "Une ressource avec ces informations existe déjà",
    };
  }
  if (
    err.code === "ER_NO_REFERENCED_ROW_2" ||
    err.code === "ER_NO_REFERENCED_ROW"
  ) {
    return {
      status: 422,
      message: "Référence invalide (ressource liée introuvable)",
    };
  }
  if (err.code === "ER_ROW_IS_REFERENCED_2") {
    return {
      status: 409,
      message: "Impossible : cette ressource est utilisée ailleurs",
    };
  }
  return null;
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || "Erreur serveur";
  const code = err.code;
  const details = err.details;

  // --- 1. Erreurs MySQL connues ---
  const dbMapped =
    err.code && err.code.startsWith && err.code.startsWith("ER_")
      ? mapDbError(err)
      : null;

  if (dbMapped) {
    status = dbMapped.status;
    message = dbMapped.message;
  }

  // --- 2. Message clair par CODE métier (priorité) ---
  const codeMetier = code && MESSAGES_PAR_CODE[code];
  if (codeMetier) {
    message = codeMetier;
  }

  // --- 3. Erreur non opérationnelle (bug inattendu) ---
  // On garde "Erreur serveur" UNIQUEMENT si pas de code métier
  const estOperationnelle = err.isOperational === true || Boolean(codeMetier);
  if (!estOperationnelle && !dbMapped) {
    logger.error(err.stack || err.message);
    if (process.env.NODE_ENV === "production") {
      status = 500;
      // ⚠️ On garde le message SEULEMENT si c'est une vraie erreur inconnue
      message = "Erreur serveur";
    }
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${status}: ${message}`);
  }

  // --- 4. Réponse JSON ---
  res.status(status).json({
    success: false,
    message,
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
  });
}

module.exports = errorHandler;