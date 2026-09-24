require("dotenv").config();
const app = require("./app");
const { checkConnection } = require("./config/db");
const logger = require("./config/logger");

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await checkConnection(); // on ne démarre pas le serveur si la BDD est injoignable
    const server = app.listen(PORT, () => {
      logger.info(`Aidora API démarrée sur le port ${PORT}`);
    });

    // Arrêt propre (utile en prod / PM2 / Docker)
    process.on("SIGTERM", () => {
      logger.info("SIGTERM reçu, arrêt du serveur...");
      server.close(() => process.exit(0));
    });
  } catch (err) {
    logger.error(`Échec du démarrage: ${err.message}`);
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

start();
