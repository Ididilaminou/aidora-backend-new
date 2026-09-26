// ============================================
// AIDORA - UTILITAIRES RÉPONSE
// ============================================

function success(res, data = null, message = "OK", statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function error(res, message = "Erreur", statusCode = 500, code = null, details = null) {
  const body = { success: false, message };
  if (code) body.code = code;
  if (details) body.erreurs = details;
  return res.status(statusCode).json(body);
}

module.exports = { success, error };