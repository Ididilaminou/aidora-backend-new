const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const logger = require("./config/logger");
const { apiLimiter } = require("./middlewares/rateLimiter");
const errorHandler = require("./middlewares/errorHandler");
const AppError = require("./utils/AppError");

// ============================================
// IMPORTS DES MODULES (une seule fois chacun)
// ============================================

const authRoutes = require("./modules/auth/auth.routes");
const donneursRoutes = require("./modules/donneurs/donneurs.routes");
const etablissementsRoutes = require("./modules/etablissements/etablissements.routes");
const personnelsRoutes = require("./modules/personnels/personnels.routes");
const donsRoutes = require("./modules/dons/dons.routes");
const pochesRoutes = require("./modules/poches/poches.routes");
const stockRoutes = require("./modules/stock/stock.routes");
const demandesRoutes = require("./modules/demandes/demandes.routes");
const notificationsRoutes = require("./modules/notifications/notifications.routes");
const statistiquesRoutes = require("./modules/statistiques/statistiques.routes");
const rapportsRoutes = require("./modules/rapports/rapports.routes");
const journalAuditRoutes = require("./modules/journal-audit/journalAudit.routes");
const rattachementsRoutes = require("./modules/rattachements/rattachements.routes");
const rdvRoutes = require("./modules/rdv/rdv.routes");
const registresRoutes = require("./modules/registres/registres.routes");
const evaluationsIaRoutes = require("./modules/evaluations-ia/evaluations-ia.routes");
const sollicitationsRoutes = require("./modules/sollicitations/sollicitations.routes");
// ⚠️ Note : si vous avez un module "alertes", décommentez la ligne ci-dessous
// const alertesRoutes = require("./modules/alertes/alertes.routes");

// ============================================
// CONFIGURATION EXPRESS
// ============================================

const app = express();

app.set("trust proxy", 1);

// --- Sécurité HTTP ---
app.use(helmet());

// --- CORS ---
const origines = (process.env.CORS_ORIGINS || "").split(",").filter(Boolean);
app.use(
  cors({
    origin: origines.length ? origines : "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// --- Parsing JSON ---
app.use(express.json({ limit: "1mb" }));

// --- Logs HTTP ---
app.use(morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }));

// --- Rate limiting ---
app.use("/api", apiLimiter);

// ============================================
// ROUTES
// ============================================

// Health check
app.get("/api/health", (req, res) =>
  res.json({ success: true, message: "Aidora API en ligne" })
);

// Modules (une seule fois chacun)
app.use("/api/auth", authRoutes);
app.use("/api/donneurs", donneursRoutes);
app.use("/api/etablissements", etablissementsRoutes);
app.use("/api/personnels", personnelsRoutes);
app.use("/api/dons", donsRoutes);
app.use("/api/poches", pochesRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/demandes", demandesRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/statistiques", statistiquesRoutes);
app.use("/api/rapports", rapportsRoutes);
app.use("/api/journal-audit", journalAuditRoutes);
app.use("/api/rattachements", rattachementsRoutes);
app.use("/api/rdv", rdvRoutes);
app.use("/api/registres", registresRoutes);
app.use("/api/evaluations-ia", evaluationsIaRoutes);
app.use("/api/sollicitations", sollicitationsRoutes);
// app.use("/api/alertes", alertesRoutes);  // décommenter si le module existe

// ============================================
// GESTION DES ERREURS
// ============================================

// Route inconnue → 404
app.use((req, res, next) =>
  next(new AppError(`Route ${req.originalUrl} introuvable`, 404, "NOT_FOUND"))
);

// Gestionnaire d'erreurs global
app.use(errorHandler);

module.exports = app;