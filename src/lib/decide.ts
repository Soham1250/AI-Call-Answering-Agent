// Decision module: never let LLM author final text.
// The AI agent will fill TODOs and wire to KB retrieval.
export type NLU = { intent: 'faq'|'leave_message'|'request_handoff'|'small_talk'; entities: any; topics: string[]; urgency: 'low'|'normal'|'high' };
export type KBHit = { id:string; score:number; template:Record<string,string>; answer_present:boolean };

export function fallback(locale: string): string {
  if (locale.startsWith('hi')) return 'मैं ImperialX को बता दूँगा/दूँगी और आपको जवाब दिलवाऊँगा/दिलवाऊँगी.';
  if (locale.startsWith('mr')) return 'मी ImperialX ला कळवेन आणि परत संपर्क करेन.';
  return 'I’ll let ImperialX know about it and get back to you.';
}

export function decideReply(nlu: NLU, locale: string, kbHits: KBHit[]) {
  if (nlu.intent === 'faq') {
    const top = kbHits.sort((a,b)=>b.score-a.score)[0];
    if (top && top.score >= 0.82 && top.answer_present) {
      const tpl = top.template[locale] ?? top.template['en-IN'];
      // TODO: safe placeholder fill (no promises)
      return { text: tpl, mode: 'template', kb_id: top.id };
    }
    return { text: fallback(locale), mode: 'fallback' as const };
  }
  if (nlu.intent === 'request_handoff') return { text: fallback(locale), mode: 'capture' as const };
  if (nlu.intent === 'leave_message')   return { text: fallback(locale), mode: 'capture' as const };
  return { text: fallback(locale), mode: 'capture' as const };
}