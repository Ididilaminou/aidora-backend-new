// Erreur métier avec un status HTTP explicite, à lever partout au lieu de `new Error(...)`
class AppError extends Error {
  constructor(message, status = 400, code = undefined, details = undefined) {
    super(message);
    this.status = status;
    this.code = code; // code métier optionnel (ex: "DONNEUR_DEJA_EXISTANT")
    this.details = details; // ex: liste des champs invalides
    this.isOperational = true; // distingue une erreur métier attendue d'un bug
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;


