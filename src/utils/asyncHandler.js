// Évite d'oublier un try/catch dans un contrôleur async : toute rejection
// tombe automatiquement dans le middleware d'erreur global (next(err)).
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
