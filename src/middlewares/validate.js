const { validationResult } = require("express-validator");
const AppError = require("../utils/AppError");

// À placer après un tableau de règles express-validator dans une route.
// Regroupe toutes les erreurs de validation en une seule réponse 422 lisible.
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const erreurs = result.array().map((e) => ({ champ: e.path, message: e.msg }));
  next(new AppError("Données invalides", 422, "VALIDATION_ERROR", erreurs));
}

module.exports = validate;
