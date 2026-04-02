/**
 * Gmail Inbox Optimizer — emil.vancutsem@gmail.com
 *
 * Ce script Google Apps Script :
 *  1. Crée des labels personnalisés
 *  2. Archive et labellise tous les emails existants selon des règles
 *  3. Crée des filtres Gmail pour les futurs emails
 *  4. Désabonne des sources de bruit via List-Unsubscribe
 *  5. Vide complètement l'inbox
 *
 * Installation :
 *  1. Ouvrir https://script.google.com
 *  2. Créer un nouveau projet et coller ce code
 *  3. Activer le service Gmail (Services > Gmail API)
 *  4. Exécuter runAll() — autoriser les permissions
 */

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

const LABELS = {
  ADMIN:       "📋 Admin",
  EVENTS:      "🎫 Events",
  FINANCE:     "💰 Finance",
  LINKEDIN:    "💼 LinkedIn",
  NEWSLETTERS: "📢 Newsletters",
  NOISE:       "🗑️ Noise",
};

// Règles de tri : { pattern (regex sur from/subject), label, archive, unsubscribe }
const RULES = [
  // ── ADMIN (gouvernement, assurances, banques) ──────────────────────────────
  {
    name: "eBox IRISbox",
    from: ["noreply-irisbox@paradigm.brussels", "myebox.noreply@bosa.fgov.be"],
    label: LABELS.ADMIN,
    archive: true,
    unsubscribe: false,
  },
  {
    name: "AXA Belgium – documents officiels",
    from: ["notification@services.axa.be"],
    label: LABELS.ADMIN,
    archive: true,
    unsubscribe: false,
  },
  {
    name: "Banque Transatlantique",
    from: ["evenements@banquetransatlantique.be"],
    label: LABELS.ADMIN,
    archive: true,
    unsubscribe: false,
  },
  {
    name: "Google Security",
    from: ["no-reply@accounts.google.com"],
    label: LABELS.ADMIN,
    archive: true,
    unsubscribe: false,
  },

  // ── EVENTS (billets, concerts) ─────────────────────────────────────────────
  {
    name: "Paylogic – billets",
    from: ["no-reply@paylogic.com"],
    label: LABELS.EVENTS,
    archive: true,
    unsubscribe: false,
  },
  {
    name: "Jeux d'Hiver",
    from: ["no-reply@anykrowd.app"],
    label: LABELS.EVENTS,
    archive: true,
    unsubscribe: false,
  },

  // ── FINANCE (reçus, transactions) ─────────────────────────────────────────
  {
    name: "Uber – reçus",
    from: ["noreply@uber.com"],
    label: LABELS.FINANCE,
    archive: true,
    unsubscribe: false,
  },
  {
    name: "Revolut – transactionnel",
    from: ["no-reply@revolut.com"],
    label: LABELS.FINANCE,
    archive: true,
    unsubscribe: false,
  },
  {
    name: "Bankin'",
    from: ["ne-pas-repondre@bankin.com"],
    label: LABELS.FINANCE,
    archive: true,
    unsubscribe: true,  // marketing
  },

  // ── LINKEDIN ───────────────────────────────────────────────────────────────
  {
    name: "LinkedIn – toutes notifications",
    fromDomain: ["linkedin.com"],
    label: LABELS.LINKEDIN,
    archive: true,
    unsubscribe: false, // géré manuellement dans les settings LinkedIn
  },

  // ── NEWSLETTERS ───────────────────────────────────────────────────────────
  {
    name: "OpenAI",
    from: ["noreply@email.openai.com"],
    label: LABELS.NEWSLETTERS,
    archive: true,
    unsubscribe: false,
  },
  {
    name: "Fitbit",
    from: ["noreply@fitbit.com"],
    label: LABELS.NEWSLETTERS,
    archive: true,
    unsubscribe: true,
  },
  {
    name: "AXA Belgium – marketing",
    from: ["info@campaigns.axa.be"],
    label: LABELS.NEWSLETTERS,
    archive: true,
    unsubscribe: true,
  },

  // ── NOISE (désabonnement + archivage) ─────────────────────────────────────
  {
    name: "Glassdoor – alertes emploi",
    from: ["noreply@glassdoor.com"],
    label: LABELS.NOISE,
    archive: true,
    unsubscribe: true,
  },
  {
    name: "Discord – notifications MEE6",
    from: ["noreply@discord.com"],
    label: LABELS.NOISE,
    archive: true,
    unsubscribe: true,
  },
  {
    name: "Freeletics",
    fromDomain: ["updates.freeletics.com"],
    label: LABELS.NOISE,
    archive: true,
    unsubscribe: true,
  },
  {
    name: "Ryanair",
    fromDomain: ["marketing.ryanairemail.com"],
    label: LABELS.NOISE,
    archive: true,
    unsubscribe: true,
  },
  {
    name: "TradingView",
    from: ["hello@tradingview.com"],
    label: LABELS.NOISE,
    archive: true,
    unsubscribe: true,
  },
  {
    name: "Ivey MSc",
    from: ["msc@ivey.ca"],
    label: LABELS.NOISE,
    archive: true,
    unsubscribe: true,
  },
  {
    name: "Fromagerie Le Chat-Bo",
    fromDomain: ["news.fromagerie-lechatbo.fr"],
    label: LABELS.NOISE,
    archive: true,
    unsubscribe: true,
  },
  {
    name: "MODUL'AIR",
    from: ["tickets@modul-air.com"],
    label: LABELS.NOISE,
    archive: true,
    unsubscribe: true,
  },
  {
    name: "Hangar",
    from: ["info@thehangar.be"],
    label: LABELS.NOISE,
    archive: true,
    unsubscribe: true,
  },
];

// ─── ENTRÉE PRINCIPALE ────────────────────────────────────────────────────────

function runAll() {
  Logger.log("=== Démarrage de l'optimisation Gmail ===");
  const labelMap = createLabels();
  applyRulesToExistingEmails(labelMap);
  createGmailFilters(labelMap);
  archiveRemainingInbox();
  Logger.log("=== Optimisation terminée ===");
}

// ─── 1. CRÉATION DES LABELS ───────────────────────────────────────────────────

function createLabels() {
  Logger.log("Étape 1 : Création des labels...");
  const labelMap = {};

  for (const key in LABELS) {
    const name = LABELS[key];
    let label = GmailApp.getUserLabelByName(name);
    if (!label) {
      label = GmailApp.createLabel(name);
      Logger.log("  ✅ Label créé : " + name);
    } else {
      Logger.log("  ⏭️  Label existant : " + name);
    }
    labelMap[name] = label;
  }

  return labelMap;
}

// ─── 2. APPLICATION DES RÈGLES SUR L'EXISTANT ────────────────────────────────

function applyRulesToExistingEmails(labelMap) {
  Logger.log("Étape 2 : Application des règles sur les emails existants...");

  for (const rule of RULES) {
    const queries = buildSearchQueries(rule);

    for (const query of queries) {
      let start = 0;
      const batchSize = 100;

      while (true) {
        const threads = GmailApp.search(query, start, batchSize);
        if (threads.length === 0) break;

        Logger.log(`  📌 Règle "${rule.name}" : ${threads.length} threads (depuis ${start})`);

        for (const thread of threads) {
          const label = labelMap[rule.label];
          if (label) thread.addLabel(label);

          if (rule.archive) {
            thread.moveToArchive();
          }

          if (rule.unsubscribe) {
            tryUnsubscribe(thread);
          }
        }

        if (threads.length < batchSize) break;
        start += batchSize;
      }
    }
  }
}

function buildSearchQueries(rule) {
  const queries = [];

  if (rule.from) {
    for (const addr of rule.from) {
      queries.push(`in:inbox from:${addr}`);
    }
  }

  if (rule.fromDomain) {
    for (const domain of rule.fromDomain) {
      queries.push(`in:inbox from:@${domain}`);
    }
  }

  return queries;
}

// ─── 3. CRÉATION DE FILTRES GMAIL (futurs emails) ────────────────────────────

function createGmailFilters(labelMap) {
  Logger.log("Étape 3 : Création des filtres Gmail via Advanced Service...");

  // Les filtres nécessitent l'API Gmail avancée (Gmail.Users.Settings.Filters)
  // Activer : Services > Gmail API (v1)

  for (const rule of RULES) {
    const senders = [];
    if (rule.from) senders.push(...rule.from);
    if (rule.fromDomain) {
      for (const d of rule.fromDomain) senders.push(`@${d}`);
    }

    for (const sender of senders) {
      try {
        const labelId = getLabelIdByName(rule.label);
        if (!labelId) continue;

        const filter = {
          criteria: { from: sender },
          action: {
            addLabelIds: [labelId],
            removeLabelIds: rule.archive ? ["INBOX"] : [],
          },
        };

        Gmail.Users.Settings.Filters.create(filter, "me");
        Logger.log(`  ✅ Filtre créé : ${sender} → ${rule.label}`);
      } catch (e) {
        Logger.log(`  ⚠️  Filtre déjà existant ou erreur (${sender}) : ${e.message}`);
      }
    }
  }
}

function getLabelIdByName(name) {
  const response = Gmail.Users.Labels.list("me");
  const labels = response.labels || [];
  const found = labels.find((l) => l.name === name);
  return found ? found.id : null;
}

// ─── 4. DÉSABONNEMENT VIA LIST-UNSUBSCRIBE ────────────────────────────────────

function tryUnsubscribe(thread) {
  const messages = thread.getMessages();
  if (messages.length === 0) return;

  const msg = messages[0];
  const rawHeaders = msg.getHeader("List-Unsubscribe") || msg.getHeader("list-unsubscribe") || "";

  if (!rawHeaders) return;

  // Extraire mailto: en priorité
  const mailtoMatch = rawHeaders.match(/<mailto:([^>]+)>/i);
  if (mailtoMatch) {
    const unsubAddr = mailtoMatch[1].split("?")[0];
    const subject = (rawHeaders.match(/\?subject=([^&>]+)/) || [])[1] || "unsubscribe";

    try {
      GmailApp.sendEmail(unsubAddr, decodeURIComponent(subject), "");
      Logger.log(`  📧 Unsubscribe envoyé à : ${unsubAddr}`);
    } catch (e) {
      Logger.log(`  ⚠️  Échec unsubscribe (${unsubAddr}) : ${e.message}`);
    }
    return;
  }

  // Sinon, URL HTTP — logguer pour traitement manuel
  const urlMatch = rawHeaders.match(/<(https?:\/\/[^>]+)>/i);
  if (urlMatch) {
    Logger.log(`  🔗 Unsubscribe URL (manuel) : ${urlMatch[1]}`);
  }
}

// ─── 5. ARCHIVER TOUT CE QUI RESTE DANS L'INBOX ──────────────────────────────

function archiveRemainingInbox() {
  Logger.log("Étape 4 : Archivage de tout ce qui reste dans l'inbox...");

  let start = 0;
  const batchSize = 100;
  let totalArchived = 0;

  while (true) {
    const threads = GmailApp.search("in:inbox", start, batchSize);
    if (threads.length === 0) break;

    for (const thread of threads) {
      thread.moveToArchive();
    }

    totalArchived += threads.length;
    Logger.log(`  📦 ${totalArchived} threads archivés...`);

    if (threads.length < batchSize) break;
    // Ne pas incrémenter start car moveToArchive retire les threads de l'inbox
  }

  Logger.log(`  ✅ Inbox vidée. Total archivé : ${totalArchived} threads.`);
}

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────

/**
 * Exécuter uniquement la création de labels (test rapide)
 */
function testCreateLabels() {
  createLabels();
}

/**
 * Exécuter uniquement l'archivage de l'inbox (sans labels)
 */
function testArchiveInbox() {
  archiveRemainingInbox();
}

/**
 * Aperçu des règles sans les appliquer (dry run)
 */
function dryRun() {
  Logger.log("=== DRY RUN — Aucune modification ===");
  for (const rule of RULES) {
    const queries = buildSearchQueries(rule);
    for (const query of queries) {
      const threads = GmailApp.search(query, 0, 10);
      Logger.log(`Règle "${rule.name}" (${query}) : ~${threads.length} threads trouvés`);
    }
  }
}
