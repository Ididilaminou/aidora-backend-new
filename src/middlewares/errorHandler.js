const logger = require("../config/logger");

// Erreurs MySQL connues -> traduction en réponse HTTP propre
function mapDbError(err) {
  if (err.code === "ER_DUP_ENTRY") {
    return { status: 409, message: "Une ressource avec ces informations existe déjà" };
  }
  if (err.code === "ER_NO_REFERENCED_ROW_2" || err.code === "ER_NO_REFERENCED_ROW") {
    return { status: 422, message: "Référence invalide (ressource liée introuvable)" };
  }
  if (err.code === "ER_ROW_IS_REFERENCED_2") {
    return { status: 409, message: "Impossible : cette ressource est utilisée ailleurs" };
  }
  return null;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || "Erreur serveur";
  const code = err.code;
  const details = err.details;

  const dbMapped = err.code && err.code.startsWith && err.code.startsWith("ER_") ? mapDbError(err) : null;
  if (dbMapped) {
    status = dbMapped.status;
    message = dbMapped.message;
  }

  // Les erreurs non "opérationnelles" (bugs inattendus) sont loguées en error avec stack complète,
  // jamais renvoyées telles quelles au client en production (fuite d'info).
  if (!err.isOperational && !dbMapped) {
    logger.error(err.stack || err.message);
    if (process.env.NODE_ENV === "production") {
      status = 500;
      message = "Erreur serveur";
    }
  } else {
    logger.warn(`${req.method} ${req.originalUrl} -> ${status}: ${message}`);
  }

  res.status(status).json({
    success: false,
    message,
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
  });
}

module.exports = errorHandler;
