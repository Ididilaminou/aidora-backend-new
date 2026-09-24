const express = require("express");
const { body } = require("express-validator");
const controller = require("./evaluations-ia.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

// Règles de validation
const evalRules = [
  body("poids")
    .isFloat({ min: 20, max: 300 })
    .withMessage("Le poids doit être entre 20 et 300 kg"),
  // Les autres champs sont optionnels (booléens ou nombres)
];

// Routes
router.get("/", controller.lister);
router.get("/derniere", authorize("DONNEUR"), controller.derniere);
router.get("/:id", controller.consulter);
router.post("/", authorize("DONNEUR"), evalRules, validate, controller.evaluer);

module.exports = router;