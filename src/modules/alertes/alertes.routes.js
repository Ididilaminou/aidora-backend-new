const express = require("express");
const router = express.Router();
// TODO: module alertes — à implémenter (voir cahier des charges Aidora)

router.get("/", (req, res) => {
  res.status(501).json({ success: false, message: "Module alertes pas encore implémenté" });
});

module.exports = router;
