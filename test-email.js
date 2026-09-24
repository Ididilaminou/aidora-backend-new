require("dotenv").config();
const emailService = require("./src/services/emailService");

async function test() {
  const resultat = await emailService.envoyerCodeActivationDonneur({
    destinataire: "test@aidora.cm",
    prenom: "Jean",
    code: "AID-K9P2X7",
  });
  console.log("Résultat :", resultat);
}

test();