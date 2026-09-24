const express = require("express");
const { body, param, query } = require("express-validator");
const controller = require("./rapports.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const genererRules = [
  body("type")
    .isIn(["DONS", "DEMANDES", "STOCKS", "PERSONNELS", "ETABLISSEMENTS", "AUDIT"])
    .withMessage("Type de rapport invalide"),
  body("format_export")
    .optional()
    .isIn(["PDF", "EXCEL", "CSV"])
    .withMessage("Format d'export invalide"),
  body("date_debut")
    .optional()
    .isISO8601().withMessage("Date de début invalide"),
  body("date_fin")
    .optional()
    .isISO8601().withMessage("Date de fin invalide")
    .custom((value, { req }) => {
      if (req.body.date_debut && new Date(value) < new Date(req.body.date_debut)) {
        throw new Error("La date de fin doit être postérieure à la date de début");
      }
      return true;
    }),
  body("etablissement_id")
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage("ID établissement invalide"),
];

const idRules = [
  param("id").isInt({ min: 1 }).withMessage("ID rapport invalide"),
];

const listerRules = [
  query("type")
    .optional()
    .isIn(["DONS", "DEMANDES", "STOCKS", "PERSONNELS", "ETABLISSEMENTS", "AUDIT"]),
  query("format_export")
    .optional()
    .isIn(["PDF", "EXCEL", "CSV"]),
  query("page").optional().isInt({ min: 1 }),
  query("limite").optional().isInt({ min: 1, max: 100 }),
];

// ============================================
// ROUTES
// ============================================

router.get("/", listerRules, validate, controller.lister);
router.get("/:id", idRules, validate, controller.consulter);
router.get("/:id/telecharger", idRules, validate, controller.telecharger);

router.post(
  "/generer",
  authorize("ADMINISTRATEUR", "PERSONNEL_BANQUE", "PERSONNEL_HOPITAL"),
  genererRules,
  validate,
  controller.generer
);

router.delete(
  "/:id",
  authorize("ADMINISTRATEUR", "PERSONNEL_BANQUE", "PERSONNEL_HOPITAL"),
  idRules,
  validate,
  controller.supprimer
);

module.exports = router;