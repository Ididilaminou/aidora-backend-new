require("dotenv").config();
const smsService = require("./src/services/smsService");

async function test() {
  const resultat = await smsService.envoyerCodeActivation(
    "+237690000001",
    "Jean",
    "AID-K9P2X7"
  );
  console.log("Résultat :", resultat);
}

test();