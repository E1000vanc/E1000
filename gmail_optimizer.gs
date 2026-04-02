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
 * GESTION DU TIMEOUT (6 min max) :
 *  - La progression est sauvegardée dans PropertiesService
 *  - Un trigger automatique relance le script toutes les 5 min jusqu'à la fin
 *  - Exécuter startOptimizer() UNE SEULE FOIS pour tout lancer
 *
 * Installation :
 *  1. Ouvrir https://script.google.com
 *  2. Créer un nouveau projet et coller ce code
 *  3. Services (icône +) > ajouter Gmail API (v1)
 *  4. Exécuter startOptimizer() — autoriser les permissions
 *  5. Suivre la progression dans Exécutions (icône horloge à gauche)
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

const RULES = [
  // ── ADMIN ─────────────────────────────────────────────────────────────────
  { name: "eBox IRISbox",            from: ["noreply-irisbox@paradigm.brussels", "myebox.noreply@bosa.fgov.be"], label: LABELS.ADMIN,       archive: true,  unsubscribe: false },
  { name: "AXA – documents",         from: ["notification@services.axa.be"],                                    label: LABELS.ADMIN,       archive: true,  unsubscribe: false },
  { name: "Banque Transatlantique",  from: ["evenements@banquetransatlantique.be"],                             label: LABELS.ADMIN,       archive: true,  unsubscribe: false },
  { name: "Google Security",         from: ["no-reply@accounts.google.com"],                                    label: LABELS.ADMIN,       archive: true,  unsubscribe: false },
  // ── EVENTS ────────────────────────────────────────────────────────────────
  { name: "Paylogic – billets",      from: ["no-reply@paylogic.com"],                                           label: LABELS.EVENTS,      archive: true,  unsubscribe: false },
  { name: "Jeux d'Hiver",           from: ["no-reply@anykrowd.app"],                                           label: LABELS.EVENTS,      archive: true,  unsubscribe: false },
  // ── FINANCE ───────────────────────────────────────────────────────────────
  { name: "Uber – reçus",           from: ["noreply@uber.com"],                                                label: LABELS.FINANCE,     archive: true,  unsubscribe: false },
  { name: "Revolut",                 from: ["no-reply@revolut.com"],                                            label: LABELS.FINANCE,     archive: true,  unsubscribe: false },
  { name: "Bankin'",                from: ["ne-pas-repondre@bankin.com"],                                      label: LABELS.FINANCE,     archive: true,  unsubscribe: true  },
  // ── LINKEDIN ──────────────────────────────────────────────────────────────
  { name: "LinkedIn",                fromDomain: ["linkedin.com"],                                              label: LABELS.LINKEDIN,    archive: true,  unsubscribe: false },
  // ── NEWSLETTERS ───────────────────────────────────────────────────────────
  { name: "OpenAI",                  from: ["noreply@email.openai.com"],                                        label: LABELS.NEWSLETTERS, archive: true,  unsubscribe: false },
  { name: "Fitbit",                  from: ["noreply@fitbit.com"],                                              label: LABELS.NEWSLETTERS, archive: true,  unsubscribe: true  },
  { name: "AXA – marketing",         from: ["info@campaigns.axa.be"],                                          label: LABELS.NEWSLETTERS, archive: true,  unsubscribe: true  },
  // ── NOISE ─────────────────────────────────────────────────────────────────
  { name: "Glassdoor",               from: ["noreply@glassdoor.com"],                                           label: LABELS.NOISE,       archive: true,  unsubscribe: true  },
  { name: "Discord",                 from: ["noreply@discord.com"],                                             label: LABELS.NOISE,       archive: true,  unsubscribe: true  },
  { name: "Freeletics",              fromDomain: ["updates.freeletics.com"],                                    label: LABELS.NOISE,       archive: true,  unsubscribe: true  },
  { name: "Ryanair",                 fromDomain: ["marketing.ryanairemail.com"],                                label: LABELS.NOISE,       archive: true,  unsubscribe: true  },
  { name: "TradingView",             from: ["hello@tradingview.com"],                                           label: LABELS.NOISE,       archive: true,  unsubscribe: true  },
  { name: "Ivey MSc",                from: ["msc@ivey.ca"],                                                     label: LABELS.NOISE,       archive: true,  unsubscribe: true  },
  { name: "Fromagerie Le Chat-Bo",   fromDomain: ["news.fromagerie-lechatbo.fr"],                               label: LABELS.NOISE,       archive: true,  unsubscribe: true  },
  { name: "MODUL'AIR",              from: ["tickets@modul-air.com"],                                           label: LABELS.NOISE,       archive: true,  unsubscribe: true  },
  { name: "Hangar",                  from: ["info@thehangar.be"],                                               label: LABELS.NOISE,       archive: true,  unsubscribe: true  },
];

// Durée max par tranche (ms) — s'arrête avant le timeout de 6 min
const MAX_RUNTIME_MS = 300000; // 5 minutes

// ─── POINT D'ENTRÉE — exécuter UNE SEULE FOIS ────────────────────────────────

function startOptimizer() {
  const props = PropertiesService.getScriptProperties();
  props.deleteAllProperties();

  // Étape 0 : créer les labels et les filtres (rapide, fait une seule fois)
  createLabels();
  createGmailFilters();

  // Construire la liste de toutes les tâches (query, labelName, unsubscribe)
  const tasks = buildTaskList();
  // Ajouter l'archivage général en dernier
  tasks.push({ type: "archiveAll", start: 0 });

  props.setProperty("tasks", JSON.stringify(tasks));
  props.setProperty("taskIndex", "0");
  props.setProperty("taskStart", "0");

  Logger.log("Optimizer initialisé. " + tasks.length + " tâches planifiées.");
  Logger.log("Démarrage du premier batch...");

  // Lancer le trigger automatique toutes les 5 min
  scheduleNextRun();

  // Exécuter le premier batch immédiatement
  runBatch();
}

// ─── BATCH PRINCIPAL (appelé par le trigger) ─────────────────────────────────

function runBatch() {
  const props = PropertiesService.getScriptProperties();
  const tasks = JSON.parse(props.getProperty("tasks") || "[]");
  let taskIndex = parseInt(props.getProperty("taskIndex") || "0");
  let taskStart = parseInt(props.getProperty("taskStart") || "0");

  if (taskIndex >= tasks.length) {
    Logger.log("✅ Toutes les tâches terminées. Suppression du trigger.");
    deleteTriggers();
    props.deleteAllProperties();
    return;
  }

  const deadline = Date.now() + MAX_RUNTIME_MS;
  const labelMap = getLabelMap();

  while (taskIndex < tasks.length && Date.now() < deadline) {
    const task = tasks[taskIndex];

    if (task.type === "archiveAll") {
      taskStart = processArchiveAll(taskStart, deadline);
      if (Date.now() >= deadline) {
        // Pas encore fini, reprendre au prochain batch
        props.setProperty("taskIndex", String(taskIndex));
        props.setProperty("taskStart", String(taskStart));
        Logger.log("⏸ Timeout — reprise à l'archivage général (offset " + taskStart + ")");
        return;
      }
    } else {
      taskStart = processRuleTask(task, labelMap, taskStart, deadline);
      if (Date.now() >= deadline) {
        props.setProperty("taskIndex", String(taskIndex));
        props.setProperty("taskStart", String(taskStart));
        Logger.log("⏸ Timeout — reprise tâche " + taskIndex + " (" + task.query + ") offset " + taskStart);
        return;
      }
    }

    // Tâche terminée, passer à la suivante
    taskIndex++;
    taskStart = 0;
    props.setProperty("taskIndex", String(taskIndex));
    props.setProperty("taskStart", "0");
  }

  if (taskIndex >= tasks.length) {
    Logger.log("✅ Optimisation terminée ! Inbox vidée, labels appliqués.");
    deleteTriggers();
    props.deleteAllProperties();
  }
}

// ─── TRAITEMENT D'UNE RÈGLE ───────────────────────────────────────────────────

function processRuleTask(task, labelMap, start, deadline) {
  const batchSize = 50;
  const label = labelMap[task.labelName];

  while (Date.now() < deadline) {
    const threads = GmailApp.search(task.query, start, batchSize);
    if (threads.length === 0) break;

    for (const thread of threads) {
      if (label) thread.addLabel(label);
      thread.moveToArchive();
      if (task.unsubscribe) tryUnsubscribe(thread);
    }

    Logger.log("  [" + task.ruleName + "] " + (start + threads.length) + " traités");

    if (threads.length < batchSize) break;
    start += batchSize;
  }

  return start;
}

// ─── ARCHIVAGE GÉNÉRAL (tout ce qui reste dans l'inbox) ──────────────────────

function processArchiveAll(start, deadline) {
  const batchSize = 50;

  while (Date.now() < deadline) {
    const threads = GmailApp.search("in:inbox", 0, batchSize); // toujours offset 0 car archive retire de l'inbox
    if (threads.length === 0) break;

    for (const thread of threads) {
      thread.moveToArchive();
    }

    Logger.log("  [Archivage général] " + threads.length + " threads archivés");

    if (threads.length < batchSize) break;
  }

  return 0;
}

// ─── CONSTRUCTION DE LA LISTE DE TÂCHES ──────────────────────────────────────

function buildTaskList() {
  const tasks = [];
  for (const rule of RULES) {
    if (rule.from) {
      for (const addr of rule.from) {
        tasks.push({ type: "rule", query: "from:" + addr, ruleName: rule.name, labelName: rule.label, unsubscribe: rule.unsubscribe });
      }
    }
    if (rule.fromDomain) {
      for (const domain of rule.fromDomain) {
        tasks.push({ type: "rule", query: "from:@" + domain, ruleName: rule.name, labelName: rule.label, unsubscribe: rule.unsubscribe });
      }
    }
  }
  return tasks;
}

// ─── CRÉATION DES LABELS ─────────────────────────────────────────────────────

function createLabels() {
  for (const key in LABELS) {
    const name = LABELS[key];
    if (!GmailApp.getUserLabelByName(name)) {
      GmailApp.createLabel(name);
      Logger.log("Label créé : " + name);
    }
  }
}

function getLabelMap() {
  const map = {};
  for (const key in LABELS) {
    const name = LABELS[key];
    map[name] = GmailApp.getUserLabelByName(name);
  }
  return map;
}

// ─── CRÉATION DES FILTRES GMAIL (futurs emails) ──────────────────────────────

function createGmailFilters() {
  // Nécessite l'API Gmail avancée : Services > Gmail API (v1)
  // Si non activée, les filtres sont ignorés — le tri sur l'existant fonctionne quand même.
  if (typeof Gmail === "undefined") {
    Logger.log("⚠️  Gmail Advanced Service non activé — filtres ignorés.");
    Logger.log("   Pour l'activer : Services (icône +) > Gmail API > Ajouter");
    return;
  }

  for (const rule of RULES) {
    const senders = [];
    if (rule.from) senders.push(...rule.from);
    if (rule.fromDomain) {
      for (const d of rule.fromDomain) senders.push("@" + d);
    }

    const labelId = getLabelIdByName(rule.label);
    if (!labelId) continue;

    for (const sender of senders) {
      try {
        Gmail.Users.Settings.Filters.create({
          criteria: { from: sender },
          action: {
            addLabelIds: [labelId],
            removeLabelIds: rule.archive ? ["INBOX"] : [],
          },
        }, "me");
        Logger.log("Filtre créé : " + sender + " → " + rule.label);
      } catch (e) {
        // Filtre déjà existant — ignorer
      }
    }
  }
}

function getLabelIdByName(name) {
  // Utilise GmailApp (toujours disponible, sans API avancée)
  const label = GmailApp.getUserLabelByName(name);
  if (!label) return null;

  // L'ID réel n'est exposé que via l'API avancée — fallback sur le nom si Gmail n'est pas activé
  if (typeof Gmail !== "undefined") {
    const labels = (Gmail.Users.Labels.list("me").labels || []);
    const found = labels.find(function(l) { return l.name === name; });
    return found ? found.id : null;
  }

  return null; // Sans API avancée, les filtres sont ignorés
}

// ─── DÉSABONNEMENT VIA LIST-UNSUBSCRIBE ──────────────────────────────────────

function tryUnsubscribe(thread) {
  const messages = thread.getMessages();
  if (!messages.length) return;

  const header = messages[0].getHeader("List-Unsubscribe") || "";
  if (!header) return;

  const mailtoMatch = header.match(/<mailto:([^>]+)>/i);
  if (mailtoMatch) {
    const addr    = mailtoMatch[1].split("?")[0];
    const subject = (header.match(/\?subject=([^&>]+)/) || [])[1] || "unsubscribe";
    try {
      GmailApp.sendEmail(addr, decodeURIComponent(subject), "");
    } catch (e) { /* ignore */ }
  }
}

// ─── GESTION DES TRIGGERS ────────────────────────────────────────────────────

function scheduleNextRun() {
  deleteTriggers();
  ScriptApp.newTrigger("runBatch")
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log("Trigger créé : runBatch toutes les 5 min");
}

function deleteTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "runBatch") {
      ScriptApp.deleteTrigger(t);
    }
  });
}

// ─── UTILITAIRES ─────────────────────────────────────────────────────────────

/** Arrêter et réinitialiser complètement */
function resetOptimizer() {
  deleteTriggers();
  PropertiesService.getScriptProperties().deleteAllProperties();
  Logger.log("Optimizer réinitialisé.");
}

/** Voir l'état actuel */
function checkStatus() {
  const props = PropertiesService.getScriptProperties().getProperties();
  Logger.log(JSON.stringify(props, null, 2));
}
