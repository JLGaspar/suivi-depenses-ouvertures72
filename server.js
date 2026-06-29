const express = require('express');
const path = require('path');
const { lireMois, sauvegarder, genId, seedMois } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const MOIS_RE = /^\d{4}-\d{2}$/;
const STATUTS_VALIDES = ['paye', 'a_regler', 'en_cours'];

// Charge et valide le fichier du mois (utilisé par PATCH et DELETE via ?mois=)
function chargerMois(req, res) {
  const mois = req.query.mois;
  if (!mois || !MOIS_RE.test(mois)) {
    res.status(400).json({ error: 'Paramètre ?mois=YYYY-MM manquant ou invalide' });
    return null;
  }
  const data = lireMois(mois);
  if (!data) {
    res.status(404).json({ error: 'Données du mois introuvables' });
    return null;
  }
  return { mois, data };
}

// ── GET : toutes les données d'un mois ──────────────────────────────────────

app.get('/api/data/:mois', (req, res) => {
  const { mois } = req.params;
  if (!MOIS_RE.test(mois)) return res.status(400).json({ error: 'Format mois invalide (YYYY-MM)' });

  const data = seedMois(mois);

  const fixes = [...data.fixes].sort((a, b) => a.echeance_jour - b.echeance_jour || a.id - b.id);
  const variables = [...data.variables].sort((a, b) => (b.is_seed ? 1 : 0) - (a.is_seed ? 1 : 0) || a.id - b.id);
  const ponctuelles = [...data.ponctuelles].sort((a, b) => {
    if (!a.date_echeance && !b.date_echeance) return a.id - b.id;
    if (!a.date_echeance) return 1;
    if (!b.date_echeance) return -1;
    return a.date_echeance.localeCompare(b.date_echeance) || a.id - b.id;
  });

  res.json({ fixes, variables, ponctuelles, ca: data.ca });
});

// ── Charges fixes ────────────────────────────────────────────────────────────

app.post('/api/charges/fixes', (req, res) => {
  const { intitule, montant, echeance_jour, mois } = req.body;
  if (!intitule || montant == null || !echeance_jour || !mois || !MOIS_RE.test(mois))
    return res.status(400).json({ error: 'Champs manquants ou invalides' });

  const data = lireMois(mois);
  if (!data) return res.status(404).json({ error: 'Données du mois introuvables' });

  const id = genId(data);
  data.fixes.push({
    id,
    intitule,
    montant,
    echeance_jour: parseInt(echeance_jour),
    statut: 'a_regler',
    permanente: true,
  });

  sauvegarder(mois, data);
  res.json({ ok: true, id });
});

app.delete('/api/charges/fixes/:id', (req, res) => {
  const ctx = chargerMois(req, res);
  if (!ctx) return;
  const { mois, data } = ctx;

  const id = parseInt(req.params.id);
  if (!data.fixes.some(f => f.id === id)) return res.status(404).json({ error: 'Charge introuvable' });

  data.fixes = data.fixes.filter(f => f.id !== id);
  sauvegarder(mois, data);
  res.json({ ok: true });
});

app.patch('/api/charges/fixes/:id', (req, res) => {
  const ctx = chargerMois(req, res);
  if (!ctx) return;
  const { mois, data } = ctx;

  const id = parseInt(req.params.id);
  const fix = data.fixes.find(f => f.id === id);
  if (!fix) return res.status(404).json({ error: 'Charge introuvable' });

  const { montant, statut } = req.body;
  if (statut !== undefined && !STATUTS_VALIDES.includes(statut)) return res.status(400).json({ error: 'Statut invalide' });

  if (montant !== undefined) fix.montant = montant;
  if (statut !== undefined) fix.statut = statut;

  sauvegarder(mois, data);
  res.json({ ok: true });
});

// ── Charges variables ─────────────────────────────────────────────────────────

app.post('/api/charges/variables', (req, res) => {
  const { intitule, montant, date_echeance, statut, mois } = req.body;
  if (!intitule || !mois || !MOIS_RE.test(mois)) return res.status(400).json({ error: 'Champs manquants ou invalides' });

  const data = lireMois(mois);
  if (!data) return res.status(404).json({ error: 'Données du mois introuvables' });

  const id = genId(data);
  data.variables.push({
    id,
    intitule,
    montant: montant ?? null,
    date_echeance: date_echeance ?? null,
    statut: statut ?? 'a_regler',
    is_seed: false,
  });

  sauvegarder(mois, data);
  res.json({ ok: true, id });
});

app.patch('/api/charges/variables/:id', (req, res) => {
  const ctx = chargerMois(req, res);
  if (!ctx) return;
  const { mois, data } = ctx;

  const id = parseInt(req.params.id);
  const variable = data.variables.find(v => v.id === id);
  if (!variable) return res.status(404).json({ error: 'Charge introuvable' });

  const { intitule, montant, date_echeance, statut } = req.body;
  if (statut !== undefined && !STATUTS_VALIDES.includes(statut)) return res.status(400).json({ error: 'Statut invalide' });

  if (intitule      !== undefined) variable.intitule      = intitule;
  if (montant       !== undefined) variable.montant       = montant;
  if (date_echeance !== undefined) variable.date_echeance = date_echeance;
  if (statut        !== undefined) variable.statut        = statut;

  sauvegarder(mois, data);
  res.json({ ok: true });
});

app.delete('/api/charges/variables/:id', (req, res) => {
  const ctx = chargerMois(req, res);
  if (!ctx) return;
  const { mois, data } = ctx;

  const id = parseInt(req.params.id);
  const variable = data.variables.find(v => v.id === id);
  if (!variable) return res.status(404).json({ error: 'Charge introuvable' });
  if (variable.is_seed) return res.status(403).json({ error: 'Impossible de supprimer une charge pré-définie' });

  data.variables = data.variables.filter(v => v.id !== id);
  sauvegarder(mois, data);
  res.json({ ok: true });
});

// ── Charges ponctuelles ───────────────────────────────────────────────────────

app.post('/api/charges/ponctuelles', (req, res) => {
  const { fournisseur, montant, date_echeance, statut, mois } = req.body;
  if (!fournisseur || montant == null || !mois || !MOIS_RE.test(mois)) return res.status(400).json({ error: 'Champs manquants ou invalides' });

  const data = lireMois(mois);
  if (!data) return res.status(404).json({ error: 'Données du mois introuvables' });

  const id = genId(data);
  data.ponctuelles.push({
    id,
    fournisseur,
    montant,
    date_echeance: date_echeance ?? null,
    statut: statut ?? 'a_regler',
  });

  sauvegarder(mois, data);
  res.json({ ok: true, id });
});

app.patch('/api/charges/ponctuelles/:id', (req, res) => {
  const ctx = chargerMois(req, res);
  if (!ctx) return;
  const { mois, data } = ctx;

  const id = parseInt(req.params.id);
  const ponctuelle = data.ponctuelles.find(p => p.id === id);
  if (!ponctuelle) return res.status(404).json({ error: 'Charge introuvable' });

  const { fournisseur, montant, date_echeance, statut } = req.body;
  if (statut !== undefined && !STATUTS_VALIDES.includes(statut)) return res.status(400).json({ error: 'Statut invalide' });

  if (fournisseur   !== undefined) ponctuelle.fournisseur   = fournisseur;
  if (montant       !== undefined) ponctuelle.montant       = montant;
  if (date_echeance !== undefined) ponctuelle.date_echeance = date_echeance;
  if (statut        !== undefined) ponctuelle.statut        = statut;

  sauvegarder(mois, data);
  res.json({ ok: true });
});

app.delete('/api/charges/ponctuelles/:id', (req, res) => {
  const ctx = chargerMois(req, res);
  if (!ctx) return;
  const { mois, data } = ctx;

  const id = parseInt(req.params.id);
  if (!data.ponctuelles.some(p => p.id === id)) return res.status(404).json({ error: 'Charge introuvable' });

  data.ponctuelles = data.ponctuelles.filter(p => p.id !== id);
  sauvegarder(mois, data);
  res.json({ ok: true });
});

// ── CA mensuel ────────────────────────────────────────────────────────────────

app.post('/api/ca', (req, res) => {
  const { mois, montant } = req.body;
  if (!mois || montant == null || !MOIS_RE.test(mois)) return res.status(400).json({ error: 'Champs manquants ou invalides' });

  const data = lireMois(mois);
  if (!data) return res.status(404).json({ error: 'Données du mois introuvables' });

  data.ca = montant;
  sauvegarder(mois, data);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trésorerie Ouvertures72 — http://localhost:${PORT}`));
