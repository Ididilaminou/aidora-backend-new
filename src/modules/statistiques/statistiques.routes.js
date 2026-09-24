const express = require("express");
const { param, query } = require("express-validator");
const controller = require("./statistiques.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();


// ============================================
// 🌐 ROUTE PUBLIQUE (avant authenticate !)
// ============================================
// Aucun token requis → utilisée par la landing page.
router.get("/publiques", controller.publiques);


router.use(authenticate);

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const periodeRules = [
  query("periode")
    .optional()
    .isIn(["JOURNALIER", "HEBDOMADAIRE", "MENSUEL", "GLOBAL"])
    .withMessage("La période doit être JOURNALIER, HEBDOMADAIRE, MENSUEL ou GLOBAL"),
  query("date_debut")
    .optional()
    .isISO8601().withMessage("Date de début invalide"),
  query("date_fin")
    .optional()
    .isISO8601().withMessage("Date de fin invalide")
    .custom((value, { req }) => {
      if (req.query.date_debut && new Date(value) < new Date(req.query.date_debut)) {
        throw new Error("La date de fin doit être postérieure à la date de début");
      }
      return true;
    }),
];

const etablissementIdRules = [
  param("etablissementId")
    .isInt({ min: 1 }).withMessage("ID établissement invalide"),
];

const personnelIdRules = [
  param("personnelId")
    .isInt({ min: 1 }).withMessage("ID personnel invalide"),
];

// ============================================
// ROUTES
// ============================================

router.get(
  "/globales",
  authorize("ADMINISTRATEUR"),
  controller.globales
);

router.get(
  "/etablissement/:etablissementId",
  authorize("ADMINISTRATEUR", "PERSONNEL_BANQUE", "PERSONNEL_HOPITAL"),
  etablissementIdRules,
  periodeRules,
  validate,
  controller.parEtablissement
);

router.get(
  "/moi/journalier",
  authorize("PERSONNEL_BANQUE", "PERSONNEL_HOPITAL", "ADMINISTRATEUR"),
  controller.monJournalier
);

router.get(
  "/moi/hebdomadaire",
  authorize("PERSONNEL_BANQUE", "PERSONNEL_HOPITAL", "ADMINISTRATEUR"),
  controller.monHebdomadaire
);

router.get(
  "/moi/mensuel",
  authorize("PERSONNEL_BANQUE", "PERSONNEL_HOPITAL", "ADMINISTRATEUR"),
  controller.monMensuel
);

router.get(
  "/moi/global",
  authorize("PERSONNEL_BANQUE", "PERSONNEL_HOPITAL", "ADMINISTRATEUR"),
  controller.monGlobal
);

router.get(
  "/personnel/:personnelId",
  authorize("ADMINISTRATEUR"),
  personnelIdRules,
  periodeRules,
  validate,
  controller.personnelParPeriode
);

router.get(
  "/dons/evolution",
  authorize("ADMINISTRATEUR", "PERSONNEL_BANQUE"),
  periodeRules,
  validate,
  controller.evolutionDons
);

router.get(
  "/demandes/par-statut",
  authorize("ADMINISTRATEUR", "PERSONNEL_BANQUE", "PERSONNEL_HOPITAL"),
  controller.demandesParStatut
);

router.get(
  "/stocks/par-type",
  authorize("ADMINISTRATEUR", "PERSONNEL_BANQUE"),
  controller.stocksParType
);

module.exports = router;