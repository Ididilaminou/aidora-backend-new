const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");
require("dotenv").config();

/**
 * Middleware d'authentification JWT.
 * Vérifie le token Bearer et attache le payload à req.user.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(new AppError("Token manquant", 401, "TOKEN_MISSING"));
  }

  const token = header.split(" ")[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // payload attendu : { id, role, etablissementId? }
    req.user = payload;
    next();
  } catch (err) {
    const message =
      err.name === "TokenExpiredError"
        ? "Session expirée, reconnectez-vous"
        : "Token invalide";
    next(new AppError(message, 401, "TOKEN_INVALID"));
  }
}

/**
 * Middleware d'autorisation par rôle.
 * Usage : authorize("ADMINISTRATEUR") ou authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR")
 */
function authorize(...rolesAutorises) {
  return (req, res, next) => {
    if (!req.user || !rolesAutorises.includes(req.user.role)) {
      return next(new AppError("Accès refusé pour ce rôle", 403, "FORBIDDEN"));
    }
    next();
  };
}

module.exports = { authenticate, authorize };