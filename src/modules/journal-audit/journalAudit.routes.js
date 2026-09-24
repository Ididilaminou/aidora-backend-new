const express = require("express");
const { param, query } = require("express-validator");
const controller = require("./journalAudit.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const listerRules = [
  query("utilisateur_id")
    .optional()
    .isInt({ min: 1 }).withMessage("ID utilisateur invalide"),
  query("action")
    .optional()
    .isString().trim().isLength({ min: 2, max: 150 }),
  query("date_debut")
    .optional()
    .isISO8601().withMessage("Date de début invalide"),
  query("date_fin")
    .optional()
    .isISO8601().withMessage("Date de fin invalide"),
  query("page")
    .optional()
    .isInt({ min: 1 }).withMessage("Page invalide"),
  query("limite")
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage("Limite invalide (1 à 100)"),
];

const idRules = [
  param("id").isInt({ min: 1 }).withMessage("ID entrée d'audit invalide"),
];

// ============================================
// ROUTES (admin uniquement)
// ============================================

router.get("/", authorize("ADMINISTRATEUR"), listerRules, validate, controller.lister);

router.get("/:id", authorize("ADMINISTRATEUR"), idRules, validate, controller.consulter);

router.get(
  "/utilisateur/:utilisateurId",
  authorize("ADMINISTRATEUR"),
  [param("utilisateurId").isInt({ min: 1 }).withMessage("ID utilisateur invalide")],
  validate,
  controller.parUtilisateur
);

router.get(
  "/stats/actions",
  authorize("ADMINISTRATEUR"),
  controller.statsActions
);

router.delete(
  "/purger",
  authorize("ADMINISTRATEUR"),
  [
    query("avant")
      .isISO8601().withMessage("La date 'avant' est requise (format ISO)"),
  ],
  validate,
  controller.purger
);

module.exports = router;