const express = require("express");
const { body, param } = require("express-validator");
const controller = require("./notifications.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const creerRules = [
  body("utilisateur_id")
    .isInt({ min: 1 }).withMessage("ID utilisateur requis"),
  body("titre")
    .isString().trim().isLength({ min: 3, max: 150 })
    .withMessage("Le titre doit contenir entre 3 et 150 caractères"),
  body("message")
    .isString().trim().isLength({ min: 3, max: 1000 })
    .withMessage("Le message doit contenir entre 3 et 1000 caractères"),
  body("type")
    .optional()
    .isIn(["INFO", "ALERTE", "URGENCE", "SYSTEME", "DEMANDE", "DON"])
    .withMessage("Type de notification invalide"),
];

const diffuserRules = [
  body("utilisateur_ids")
    .isArray({ min: 1, max: 500 })
    .withMessage("La liste doit contenir entre 1 et 500 utilisateurs"),
  body("utilisateur_ids.*")
    .isInt({ min: 1 }).withMessage("Chaque ID utilisateur doit être un entier positif"),
  body("titre")
    .isString().trim().isLength({ min: 3, max: 150 })
    .withMessage("Le titre doit contenir entre 3 et 150 caractères"),
  body("message")
    .isString().trim().isLength({ min: 3, max: 1000 })
    .withMessage("Le message doit contenir entre 3 et 1000 caractères"),
  body("type")
    .optional()
    .isIn(["INFO", "ALERTE", "URGENCE", "SYSTEME", "DEMANDE", "DON"]),
];

const idRules = [
  param("id").isInt({ min: 1 }).withMessage("ID notification invalide"),
];

// ============================================
// ROUTES
// ============================================

router.get("/", controller.lister);
router.get("/non-lues", controller.nonLues);
router.get("/compteur", controller.compteur);
router.get("/:id", idRules, validate, controller.consulter);

router.patch("/:id/lue", idRules, validate, controller.marquerCommeLue);
router.patch("/toutes-lues", controller.marquerToutesCommeLues);
router.delete("/:id", idRules, validate, controller.supprimer);

router.post(
  "/",
  authorize("ADMINISTRATEUR"),
  creerRules,
  validate,
  controller.creer
);

router.post(
  "/diffusion",
  authorize("ADMINISTRATEUR"),
  diffuserRules,
  validate,
  controller.diffuser
);

module.exports = router;