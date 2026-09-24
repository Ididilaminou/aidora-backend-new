const express = require("express");
const { body, param } = require("express-validator");
const controller = require("./demandes.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const creerRules = [
  body("etablissement_destinataire_id")
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage("ID établissement destinataire invalide"),
  body("groupe_sanguin")
    .isIn(["A", "B", "AB", "O"]).withMessage("Groupe sanguin invalide"),
  body("rhesus")
    .isIn(["POSITIF", "NEGATIF"]).withMessage("Rhésus invalide"),
  body("type_produit")
    .isIn(["SANG_TOTAL", "GLOBULES_ROUGES", "PLAQUETTES", "PLASMA"])
    .withMessage("Type de produit invalide"),
  body("quantite_demandee")
    .isInt({ min: 1, max: 100 })
    .withMessage("La quantité doit être entre 1 et 100"),
  body("urgence")
    .optional()
    .isBoolean().withMessage("Le champ urgence doit être un booléen"),
  body("motif")
    .isString().trim().isLength({ min: 5, max: 255 })
    .withMessage("Le motif doit contenir entre 5 et 255 caractères"),
];

const traiterRules = [
  param("id").isInt({ min: 1 }).withMessage("ID demande invalide"),
  body("commentaire")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 500 })
    .withMessage("Le commentaire ne doit pas dépasser 500 caractères"),
];

const rejeterRules = [
  param("id").isInt({ min: 1 }).withMessage("ID demande invalide"),
  body("motif")
    .isString().trim().isLength({ min: 3, max: 500 })
    .withMessage("Le motif doit contenir entre 3 et 500 caractères"),
];

const annulerRules = [
  param("id").isInt({ min: 1 }).withMessage("ID demande invalide"),
  body("motif")
    .isString().trim().isLength({ min: 3, max: 500 })
    .withMessage("Le motif doit contenir entre 3 et 500 caractères"),
];

const idRules = [
  param("id").isInt({ min: 1 }).withMessage("ID demande invalide"),
];

// ============================================
// ROUTES
// ============================================

router.get("/", controller.lister);
router.get("/:id", idRules, validate, controller.consulter);
router.get("/:id/historique", idRules, validate, controller.historique);

router.post(
  "/",
  authorize("PERSONNEL_HOPITAL"),
  creerRules,
  validate,
  controller.creer
);

router.patch(
  "/:id/accepter",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  traiterRules,
  validate,
  controller.accepter
);

router.patch(
  "/:id/rejeter",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  rejeterRules,
  validate,
  controller.rejeter
);

router.patch(
  "/:id/livrer",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  idRules,
  validate,
  controller.livrer
);

router.patch(
  "/:id/confirmer-reception",
  authorize("PERSONNEL_HOPITAL"),
  idRules,
  validate,
  controller.confirmerReception
);

router.patch(
  "/:id/annuler",
  authorize("PERSONNEL_HOPITAL", "ADMINISTRATEUR"),
  annulerRules,
  validate,
  controller.annuler
);

module.exports = router;