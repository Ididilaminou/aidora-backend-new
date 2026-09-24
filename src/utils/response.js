function success(res, data = null, message = "OK", status = 200) {
  return res.status(status).json({ success: true, message, data });
}

function error(res, message = "Erreur serveur", status = 400) {
  return res.status(status).json({ success: false, message });
}

module.exports = { success, error };
