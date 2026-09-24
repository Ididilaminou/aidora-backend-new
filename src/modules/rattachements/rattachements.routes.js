const express = require("express");
const { body, param, query } = require("express-validator");
const controller = require("./rattachements.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

// ============================================
// RÈGLES
// ============================================

const creerRules = [
  body("donneur_id")
    .isInt({ min: 1 }).withMessage("ID donneur requis"),
  body("etablissement_id")
    .isInt({ min: 1 }).withMessage("ID établissement requis"),
  body("source")
    .optional()
    .isIn(["INSCRIPTION", "REGISTRE_MANUEL", "REGISTRE_CSV", "REGISTRE_OCR", "DON"])
    .withMessage("Source invalide"),
];

const idRules = [
  param("id").isInt({ min: 1 }).withMessage("ID rattachement invalide"),
];

const etablissementIdRules = [
  param("etablissementId").isInt({ min: 1 }).withMessage("ID établissement invalide"),
];

const listerRules = [
  query("donneur_id").optional().isInt({ min: 1 }),
  query("etablissement_id").optional().isInt({ min: 1 }),
  query("statut").optional().isIn(["ACTIF", "INACTIF"]),
  query("page").optional().isInt({ min: 1 }),
  query("limite").optional().isInt({ min: 1, max: 100 }),
];

// ============================================
// ROUTES
// ============================================

router.get("/", listerRules, validate, controller.lister);
router.get("/moi", controller.mesRattachements);
router.get(
  "/etablissement/:etablissementId",
  etablissementIdRules,
  validate,
  controller.rattachementsEtablissement
);
router.get("/:id", idRules, validate, controller.consulter);

router.post(
  "/",
  authorize("ADMINISTRATEUR", "PERSONNEL_BANQUE"),
  creerRules,
  validate,
  controller.creer
);

router.patch(
  "/:id/desactiver",
  authorize("ADMINISTRATEUR", "PERSONNEL_BANQUE"),
  idRules,
  validate,
  controller.desactiver
);

router.patch(
  "/:id/reactiver",
  authorize("ADMINISTRATEUR", "PERSONNEL_BANQUE"),
  idRules,
  validate,
  controller.reactiver
);

router.patch(
  "/:id/principal",
  authorize("DONNEUR"),
  idRules,
  validate,
  controller.definirPrincipal
);

router.delete(
  "/:id",
  authorize("ADMINISTRATEUR"),
  idRules,
  validate,
  controller.supprimer
);

module.exports = router;