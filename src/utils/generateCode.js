// Génère un code d'activation à 6 chiffres, envoyé au donneur pour activer son compte
function generateActivationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { generateActivationCode };
