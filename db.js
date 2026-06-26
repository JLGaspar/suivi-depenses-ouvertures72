const fs = require('fs');
const path = require('path');

// Sur Railway : monter un volume persistant sur /data et définir DB_DIR=/data
const DATA_DIR = process.env.DB_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const FIXES_TEMPLATE = [
  { intitule: 'Loyer magasin',         montant: 1928, echeance_jour: 1  },
  { intitule: 'Loyer dépôt',           montant: 1983, echeance_jour: 1  },
  { intitule: 'LLD BMW',               montant: 534,  echeance_jour: 5  },
  { intitule: 'LLD Clio',              montant: 1367, echeance_jour: 5  },
  { intitule: 'LLD Renault Master',    montant: 414,  echeance_jour: 5  },
  { intitule: 'Crédit-bail Ford',      montant: 238,  echeance_jour: 5  },
  { intitule: 'Location Hilti',        montant: 484,  echeance_jour: 10 },
  { intitule: 'Assurance décennale',   montant: 1054, echeance_jour: 15 },
  { intitule: 'Assurance transport',   montant: 725,  echeance_jour: 15 },
  { intitule: 'Assurance hommes clés', montant: 201,  echeance_jour: 15 },
  { intitule: 'Linkeo site internet',  montant: 150,  echeance_jour: 15 },
  { intitule: 'Licence Elcia',         montant: 348,  echeance_jour: 20 },
];

const VARIABLES_TEMPLATE = [
  'Salaires',
  'Cotisations sociales (URSSAF)',
  'Carburant',
  'Téléphone',
  'Entretien matériel roulant',
];

function filePath(mois) {
  return path.join(DATA_DIR, `${mois}.json`);
}

function lireMois(mois) {
  const fp = filePath(mois);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return null;
  }
}

function sauvegarder(mois, data) {
  fs.writeFileSync(filePath(mois), JSON.stringify(data, null, 2), 'utf8');
}

function genId(data) {
  data._nextId = (data._nextId || 0) + 1;
  return data._nextId;
}

function getMoisPrecedent(mois) {
  const [year, month] = mois.split('-').map(Number);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

function seedMois(mois) {
  let data = lireMois(mois) || { fixes: [], variables: [], ponctuelles: [], ca: null, _nextId: 0 };

  if (data.fixes.length === 0) {
    const prevData = lireMois(getMoisPrecedent(mois));
    for (const tpl of FIXES_TEMPLATE) {
      const prev = prevData && prevData.fixes.find(f => f.intitule === tpl.intitule);
      data.fixes.push({
        id: genId(data),
        intitule: tpl.intitule,
        montant: prev ? prev.montant : tpl.montant,
        echeance_jour: tpl.echeance_jour,
        statut: 'a_regler',
      });
    }
  }

  if (!data.variables.some(v => v.is_seed)) {
    for (const intitule of VARIABLES_TEMPLATE) {
      data.variables.push({
        id: genId(data),
        intitule,
        montant: null,
        date_echeance: null,
        statut: 'a_regler',
        is_seed: true,
      });
    }
  }

  sauvegarder(mois, data);
  return data;
}

module.exports = { lireMois, sauvegarder, genId, seedMois };
