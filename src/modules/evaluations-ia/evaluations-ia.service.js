const repository = require("./evaluations-ia.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");

// ============================================
// RÈGLES MÉDICALES (pré-évaluation)
// ============================================
// Ces règles remplacent la décision médicale. Elles donnent un
// AVIS de pré-éligibilité et NE REMPLACENT PAS le personnel de santé.

const REGLES = {
  AGE_MIN: 18,
  AGE_MAX: 65,
  POIDS_MIN_KG: 50,
  DELAI_MIN_JOURS_ENTRE_DONS: 56, // 8 semaines
  DUREE_VALIDITE_JOURS: 90,       // 3 mois
};

/**
 * Calcule l'âge en années à partir d'une date de naissance.
 */
function calculerAge(dateNaissance) {
  if (!dateNaissance) return null;
  const naissance = new Date(dateNaissance);
  const diff = Date.now() - naissance.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

/**
 * Évalue les réponses du donneur et retourne un résultat.
 *
 * @returns { resultat: "ELIGIBLE"|"NON_ELIGIBLE"|"A_VERIFIER", analyse, raisons }
 */
function evaluer(reponses, contexte) {
  const raisons = [];
  let resultat = "ELIGIBLE";
  let aVerifier = false;

  // ------------------------------
  // 1. Âge
  // ------------------------------
  const age = calculerAge(contexte.date_naissance);
  if (age !== null) {
    if (age < REGLES.AGE_MIN) {
      raisons.push(`Âge minimum requis : ${REGLES.AGE_MIN} ans (vous avez ${age} ans).`);
      resultat = "NON_ELIGIBLE";
    } else if (age > REGLES.AGE_MAX) {
      raisons.push(`Âge maximum : ${REGLES.AGE_MAX} ans (vous avez ${age} ans).`);
      resultat = "NON_ELIGIBLE";
    }
  } else {
    raisons.push("Date de naissance non renseignée dans votre profil.");
    aVerifier = true;
  }

  // ------------------------------
  // 2. Poids
  // ------------------------------
  const poids = Number(reponses.poids);
  if (!poids || isNaN(poids)) {
    raisons.push("Poids non renseigné.");
    aVerifier = true;
  } else if (poids < REGLES.POIDS_MIN_KG) {
    raisons.push(`Poids minimum requis : ${REGLES.POIDS_MIN_KG} kg (vous avez ${poids} kg).`);
    resultat = "NON_ELIGIBLE";
  }

  // ------------------------------
  // 3. Délai depuis le dernier don
  // ------------------------------
  if (contexte.dernier_don) {
    const dernier = new Date(contexte.dernier_don);
    const joursEcoules = Math.floor((Date.now() - dernier.getTime()) / (24 * 3600 * 1000));
    if (joursEcoules < REGLES.DELAI_MIN_JOURS_ENTRE_DONS) {
      raisons.push(
        `Délai minimum entre 2 dons : ${REGLES.DELAI_MIN_JOURS_ENTRE_DONS} jours. ` +
        `Votre dernier don date de ${joursEcoules} jours.`
      );
      resultat = "NON_ELIGIBLE";
    }
  }

  // ------------------------------
  // 4. Questions médicales (checklist)
  // ------------------------------
  const questionsEliminatoires = [
    { cle: "a_ete_malade_recemment",   message: "Vous avez été malade récemment (moins de 7 jours)." },
    { cle: "a_pris_antibiotiques",     message: "Vous avez pris des antibiotiques dans les 7 derniers jours." },
    { cle: "a_subi_chirurgie_recente", message: "Vous avez subi une chirurgie dans les 6 derniers mois." },
    { cle: "est_enceinte",             message: "Vous êtes enceinte ou avez accouché depuis moins de 6 mois." },
    { cle: "a_transfusion_recente",    message: "Vous avez reçu une transfusion dans les 12 derniers mois." },
    { cle: "a_hepatite_ou_vih",        message: "Vous avez une hépatite B/C ou le VIH." },
    { cle: "a_voyage_zone_risque",     message: "Vous avez voyagé dans une zone à risque dans les 6 derniers mois." },
    { cle: "consomme_drogues",         message: "Consommation de drogues injectables." },
  ];

  for (const q of questionsEliminatoires) {
    if (reponses[q.cle] === true) {
      raisons.push(q.message);
      resultat = "NON_ELIGIBLE";
    }
  }

  // ------------------------------
  // 5. Questions à vérifier (non éliminatoires)
  // ------------------------------
  const questionsAVerifier = [
    { cle: "a_pris_medicament_regular", message: "Vous prenez des médicaments régulièrement — avis médical conseillé." },
    { cle: "a_tatouage_recent",         message: "Tatouage ou piercing récent — vérification nécessaire." },
  ];

  for (const q of questionsAVerifier) {
    if (reponses[q.cle] === true) {
      raisons.push(q.message);
      aVerifier = true;
    }
  }

  // ------------------------------
  // Résultat final
  // ------------------------------
  if (resultat === "ELIGIBLE" && aVerifier) {
    resultat = "A_VERIFIER";
  }

  // Analyse textuelle
  let analyse;
  if (resultat === "ELIGIBLE") {
    analyse = "Aucun critère éliminatoire détecté. Vous semblez éligible au don de sang. " +
              "Un contrôle médical final sera effectué sur place.";
  } else if (resultat === "A_VERIFIER") {
    analyse = "Certains éléments nécessitent une vérification par le personnel de santé :\n- " +
              raisons.join("\n- ");
  } else {
    analyse = "Don non recommandé pour les raisons suivantes :\n- " + raisons.join("\n- ");
  }

  return { resultat, analyse, raisons };
}

// ============================================
// API
// ============================================

async function lister(filtres, utilisateur) {
  if (utilisateur.role === "DONNEUR") {
    filtres.donneur_id = utilisateur.id;
  }
  return repository.findAll(filtres);
}

async function consulter(id, utilisateur) {
  const e = await repository.findById(Number(id));
  if (!e) throw new AppError("Évaluation introuvable", 404, "NOT_FOUND");

  if (utilisateur.role === "DONNEUR" && e.donneur_id !== utilisateur.id) {
    throw new AppError("Accès refusé", 403, "FORBIDDEN");
  }
  return e;
}

/**
 * Effectue une pré-évaluation pour le donneur connecté.
 */
async function evaluerPour(utilisateur, reponses) {
  const donneurId = utilisateur.id;

  // Récupère le contexte du donneur
  const contexte = await repository.findDonneurContexte(donneurId);
  if (!contexte) {
    throw new AppError("Profil donneur introuvable", 404, "NOT_FOUND");
  }

  const dernierDon = await repository.findDernierDon(donneurId);
  contexte.dernier_don = dernierDon?.date_don || null;

  // Évalue
  const { resultat, analyse } = evaluer(reponses, contexte);

  // Date d'expiration : +90 jours
  const expiration = new Date();
  expiration.setDate(expiration.getDate() + REGLES.DUREE_VALIDITE_JOURS);

  // Invalide les anciennes évaluations
  const ancienne = await repository.findDerniere(donneurId);
  if (ancienne) {
    await repository.invalider(ancienne.id, "Nouvelle évaluation effectuée");
  }

  // Crée la nouvelle
  const evaluation = await repository.create({
    donneur_id: donneurId,
    reponses,
    resultat,
    analyse,
    date_expiration: expiration,
  });

  logger.info(`Évaluation #${evaluation.id} pour donneur #${donneurId} : ${resultat}`);

  return evaluation;
}

async function derniere(utilisateur) {
  return repository.findDerniere(utilisateur.id);
}

module.exports = { lister, consulter, evaluerPour, derniere };