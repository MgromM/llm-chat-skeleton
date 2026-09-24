import { pomocCommand } from './commands/pomoc.js';
import { kosztDzisiajCommand } from './commands/kosztDzisiaj.js';
import { analizaBigqueryCommand } from './commands/analizaBigquery.js';
import { briefKreatywnyCommand } from './commands/briefKreatywny.js';
import { tekstReklamowyCommand } from './commands/tekstReklamowy.js';
import { pomyslyNaPostyCommand } from './commands/pomyslyNaPosty.js';
import { analizaKonkurencjiCommand } from './commands/analizaKonkurencji.js';
import { planKampaniiCommand } from './commands/planKampanii.js';
import { emailOfertowyCommand } from './commands/emailOfertowy.js';
import { podsumowanieSpotkaniaCommand } from './commands/podsumowanieSpotkania.js';
import { personaKlientaCommand } from './commands/personaKlienta.js';
import { kampanieAdsCommand } from './commands/kampanieAds.js';

// Central slash-command registry, mirroring the bypass/continue split used in
// the sister pongo-monorepo project's slash_dispatch.py:
// - "bypass": returns a canned answer directly, no LLM call, cost = 0.
// - "continue": rewrites/enriches the prompt and hands it off to the LLM pipeline.
const COMMANDS = {
  '/pomoc': pomocCommand,
  '/koszt-dzisiaj': kosztDzisiajCommand,
  '/analiza-bigquery': analizaBigqueryCommand,
  '/brief-kreatywny': briefKreatywnyCommand,
  '/tekst-reklamowy': tekstReklamowyCommand,
  '/pomysly-na-posty': pomyslyNaPostyCommand,
  '/analiza-konkurencji': analizaKonkurencjiCommand,
  '/plan-kampanii': planKampaniiCommand,
  '/email-ofertowy': emailOfertowyCommand,
  '/podsumowanie-spotkania': podsumowanieSpotkaniaCommand,
  '/persona-klienta': personaKlientaCommand,
  '/kampanie-ads': kampanieAdsCommand,
};

// Slash commands whose reply is a full deliverable, materialized as a
// persisted `artifacts` row (see pipeline.js's finishAssistantReply) instead
// of being just chat chatter — single source of truth shared with the
// frontend via GET /chat/conversations/:id/messages (`artifactTitle`).
export const ARTIFACT_COMMANDS = {
  '/brief-kreatywny': 'Brief kreatywny',
  '/tekst-reklamowy': 'Teksty reklamowe',
  '/pomysly-na-posty': 'Pomysły na posty',
  '/analiza-konkurencji': 'Analiza konkurencji',
  '/plan-kampanii': 'Plan kampanii',
  '/email-ofertowy': 'E-mail ofertowy',
  '/podsumowanie-spotkania': 'Podsumowanie spotkania',
  '/persona-klienta': 'Persona klienta',
};

export function parseCommand(rawMessage) {
  const trimmed = rawMessage.trim();
  const match = trimmed.match(/^(\S+)([\s\S]*)$/);
  if (!match) return null;
  const [, name, rest] = match;
  const command = COMMANDS[name.toLowerCase()];
  if (!command) return null;
  return { command, name: name.toLowerCase(), args: rest.trim() };
}

/**
 * Dispatches a parsed command. Returns either
 *   { mode: 'bypass', reply: string }
 * or
 *   { mode: 'continue', prompt: string }
 * for the caller to hand off to the normal Claude pipeline.
 */
export async function dispatchCommand({ command, args, context }) {
  return command.run({ args, context });
}

export function listCommands() {
  return Object.keys(COMMANDS);
}
