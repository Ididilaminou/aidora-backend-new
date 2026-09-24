const express = require("express");
const { body, param } = require("express-validator");
const controller = require("./poches.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const creerRules = [
  body("don_id")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 }).withMessage("L'ID du don doit être un entier positif"),

  body("code_poche")
    .optional({ nullable: true, checkFalsy: true })
    .isString().trim().isLength({ min: 3, max: 50 })
    .withMessage("Le code poche doit contenir entre 3 et 50 caractères"),

  body("groupe_sanguin")
    .isIn(["A", "B", "AB", "O"])
    .withMessage("Le groupe sanguin doit être A, B, AB ou O"),

  body("rhesus")
    .isIn(["POSITIF", "NEGATIF"])
    .withMessage("Le rhésus doit être POSITIF ou NEGATIF"),

  body("type_produit")
    .isIn(["SANG_TOTAL", "GLOBULES_ROUGES", "PLAQUETTES", "PLASMA"])
    .withMessage("Type de produit invalide"),

  body("volume")
    .isFloat({ min: 1, max: 1000 })
    .withMessage("Le volume doit être compris entre 1 et 1000 ml"),

  body("date_collecte")
    .isISO8601().withMessage("Date de collecte invalide"),

  body("date_peremption")
    .isISO8601().withMessage("Date de péremption invalide")
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.date_collecte)) {
        throw new Error("La date de péremption doit être postérieure à la date de collecte");
      }
      return true;
    }),

  body("etablissement_id")
    .isInt({ min: 1 }).withMessage("ID établissement requis"),

  body("personnel_responsable_id")
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage("ID personnel invalide"),

  body("statut")
    .optional({ nullable: true, checkFalsy: true })
    .isIn(["EN_CONTROLE", "DISPONIBLE", "RESERVEE", "VENDUE", "DISTRIBUEE", "PERIMEE", "REJETEE"])
    .withMessage("Statut invalide"),
];

const creerLotRules = [
  body("nombre")
    .isInt({ min: 1, max: 500 })
    .withMessage("Le nombre doit être entre 1 et 500"),

  body("groupe_sanguin")
    .isIn(["A", "B", "AB", "O"])
    .withMessage("Le groupe sanguin doit être A, B, AB ou O"),

  body("rhesus")
    .isIn(["POSITIF", "NEGATIF"])
    .withMessage("Le rhésus doit être POSITIF ou NEGATIF"),

  body("type_produit")
    .isIn(["SANG_TOTAL", "GLOBULES_ROUGES", "PLAQUETTES", "PLASMA"])
    .withMessage("Type de produit invalide"),

  body("volume")
    .isFloat({ min: 1, max: 1000 })
    .withMessage("Le volume doit être compris entre 1 et 1000 ml"),

  body("date_collecte")
    .isISO8601().withMessage("Date de collecte invalide"),

  body("date_peremption")
    .isISO8601().withMessage("Date de péremption invalide")
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.date_collecte)) {
        throw new Error("La date de péremption doit être postérieure à la date de collecte");
      }
      return true;
    }),

  body("statut_initial")
    .optional({ nullable: true, checkFalsy: true })
    .isIn(["EN_CONTROLE", "DISPONIBLE"])
    .withMessage("Statut initial invalide"),

  body("don_id")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 }).withMessage("L'ID du don doit être un entier positif"),
];

const changerStatutRules = [
  param("id").isInt({ min: 1 }).withMessage("ID poche invalide"),
  body("statut")
    .isIn(["EN_CONTROLE", "DISPONIBLE", "RESERVEE", "VENDUE", "DISTRIBUEE", "PERIMEE", "REJETEE"])
    .withMessage("Statut invalide"),
  body("commentaire")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 255 })
    .withMessage("Le commentaire ne doit pas dépasser 255 caractères"),
];

const vendreRules = [
  param("id").isInt({ min: 1 }).withMessage("ID poche invalide"),
  body("prix_vente")
    .isFloat({ min: 0 }).withMessage("Le prix de vente doit être un nombre positif"),
  body("date_vente")
    .optional()
    .isISO8601().withMessage("Date de vente invalide"),
];

const idRules = [
  param("id").isInt({ min: 1 }).withMessage("ID poche invalide"),
];

// ============================================
// ROUTES
// ============================================
// ⚠️ ORDRE CRITIQUE :
//   1. Routes littérales spécifiques ("/lot", "/lots")
//   2. Route racine ("/")
//   3. Routes paramétriques (":id")
// Sinon Express capture "lots" comme un ID → 422.
// ============================================

// -------- 1. Routes spécifiques (AVANT /:id) --------

// Création en lot
router.post(
  "/lot",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  creerLotRules,
  validate,
  controller.creerLot
);

// Liste des lots groupés (DOIT être avant /:id)
router.get("/lots", controller.listerLots);

// -------- 2. Liste globale --------
router.get("/", controller.lister);

// -------- 3. Routes paramétriques (:id) --------
router.get("/:id", idRules, validate, controller.consulter);
router.get("/:id/historique", idRules, validate, controller.historique);

// Création standard
router.post(
  "/",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  creerRules,
  validate,
  controller.creer
);

// Changement de statut
router.patch(
  "/:id/statut",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  changerStatutRules,
  validate,
  controller.changerStatut
);

// Vente
router.patch(
  "/:id/vendre",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  vendreRules,
  validate,
  controller.vendre
);

// Suppression
router.delete(
  "/:id",
  authorize("ADMINISTRATEUR"),
  idRules,
  validate,
  controller.supprimer
);

module.exports = router;