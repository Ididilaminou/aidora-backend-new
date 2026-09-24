const express = require("express");
const { body, param } = require("express-validator");
const controller = require("./stock.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const creerRules = [
  body("etablissement_id")
    .isInt({ min: 1 }).withMessage("ID établissement requis"),
  body("groupe_sanguin")
    .isIn(["A", "B", "AB", "O"]).withMessage("Groupe sanguin invalide"),
  body("rhesus")
    .isIn(["POSITIF", "NEGATIF"]).withMessage("Rhésus invalide"),
  body("type_produit")
    .isIn(["SANG_TOTAL", "GLOBULES_ROUGES", "PLAQUETTES", "PLASMA"])
    .withMessage("Type de produit invalide"),
  body("quantite")
    .optional()
    .isInt({ min: 0 }).withMessage("La quantité doit être un entier positif"),
  body("seuil_alerte")
    .optional()
    .isInt({ min: 0 }).withMessage("Le seuil doit être un entier positif"),
];

const mouvementRules = [
  param("id").isInt({ min: 1 }).withMessage("ID stock invalide"),
  body("quantite")
    .isInt({ min: 1 }).withMessage("La quantité doit être un entier positif"),
  body("motif")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 255 }),
];

const ajustementRules = [
  param("id").isInt({ min: 1 }).withMessage("ID stock invalide"),
  body("nouvelle_quantite")
    .isInt({ min: 0 }).withMessage("La quantité doit être un entier positif ou nul"),
  body("motif")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 255 }),
];

const seuilRules = [
  param("id").isInt({ min: 1 }).withMessage("ID stock invalide"),
  body("seuil_alerte")
    .isInt({ min: 0 }).withMessage("Le seuil doit être un entier positif ou nul"),
];

const idRules = [
  param("id").isInt({ min: 1 }).withMessage("ID stock invalide"),
];

const etablissementIdRules = [
  param("etablissementId").isInt({ min: 1 }).withMessage("ID établissement invalide"),
];

// ============================================
// ROUTES
// ============================================

router.get("/", controller.lister);
router.get("/alertes/seuils", controller.alertesSeuils);
router.get("/etablissement/:etablissementId", etablissementIdRules, validate, controller.listerParEtablissement);
router.get("/:id", idRules, validate, controller.consulter);
router.get("/:id/mouvements", idRules, validate, controller.mouvements);

router.post(
  "/",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  creerRules,
  validate,
  controller.creer
);

router.patch(
  "/:id/entree",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  mouvementRules,
  validate,
  controller.entree
);

router.patch(
  "/:id/sortie",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  mouvementRules,
  validate,
  controller.sortie
);

router.patch(
  "/:id/ajustement",
  authorize("ADMINISTRATEUR"),
  ajustementRules,
  validate,
  controller.ajustement
);

router.patch(
  "/:id/seuil",
  authorize("ADMINISTRATEUR"),
  seuilRules,
  validate,
  controller.modifierSeuil
);

router.delete(
  "/:id",
  authorize("ADMINISTRATEUR"),
  idRules,
  validate,
  controller.supprimer
);

module.exports = router;