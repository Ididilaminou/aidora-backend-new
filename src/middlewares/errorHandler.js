// ============================================
// AIDORA - MIDDLEWARE GESTION D'ERREURS
// ============================================

const logger = require("../config/logger");
const AppError = require("../utils/AppError");

function errorHandler(err, req, res, next) {
  // Erreur déjà formatée (AppError)
  if (err instanceof AppError || err.isOperational) {
    const reponse = {
      success: false,
      message: err.message,
      code: err.code,
    };

    // ✅ Expose les détails de validation (champ par champ)
    if (err.details) {
      reponse.erreurs = err.details;
      reponse.details = err.details;
    }

    return res.status(err.statusCode || 500).json(reponse);
  }

  // Erreur Prisma
  if (err.code === "P2002") {
    return res.status(409).json({
      success: false,
      message: "Conflit de données (doublon)",
      code: "DOUBLON",
    });
  }

  if (err.code === "P2025") {
    return res.status(404).json({
      success: false,
      message: "Ressource introuvable",
      code: "INTROUVABLE",
    });
  }

  // Erreur inattendue
  logger.error(`[ERROR] ${err.message}`);
  logger.error(err.stack);

  return res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Erreur interne du serveur"
        : err.message,
    code: "ERREUR_INTERNE",
  });
}

module.exports = errorHandler;