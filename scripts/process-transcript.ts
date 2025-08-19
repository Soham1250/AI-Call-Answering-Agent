import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import mongoose, { ClientSession } from 'mongoose';

// Shared types
interface Turn { speaker: 'USER' | 'ASSISTANT'; timestamp: string; text: string }
interface TranscriptDoc {
    _id: mongoose.Types.ObjectId;
    fileName: string;
    jsonName: string;
    callId: mongoose.Types.ObjectId | null;
    from: string | null;
    to: string | null;
    Language: string[];
    turns: Turn[];
    text: string;
    createdAt: Date;
}

interface CallSessionDoc {
    _id?: mongoose.Types.ObjectId;
    from: string | null;
    to: string | null;
    startedAt: Date;
    endedAt: Date;
    durationSec: number;
    Language: string[];
    meta: { source: 'sim' | 'twilio'; transcriptId: mongoose.Types.ObjectId };
}

interface MessageDoc {
    _id?: mongoose.Types.ObjectId;
    callId: mongoose.Types.ObjectId;
    caller: string | null;
    Language: string[];
    messageText: string;
    rawTranscript: string;
    summary: {
        overview: string;
        highlights: string[];
        nextActions: string[];
        entities: {
            phones: string[];
            emails: string[];
            dates: string[];
            times: string[];
        };
    };
    createdAt: Date;
}

function exitWith(code: number, msg?: string): never {
    if (msg) console.error(msg);
    process.exit(code);
}

function parseArgs(): { file: string; from: string | null; to: string | null } {
    const argv = process.argv;
    const fileIdx = argv.indexOf('--file');
    const fromIdx = argv.indexOf('--from');
    const toIdx = argv.indexOf('--to');
    const file = fileIdx !== -1 ? argv[fileIdx + 1] : undefined;
    const from = fromIdx !== -1 ? argv[fromIdx + 1] : null;
    const to = toIdx !== -1 ? argv[toIdx + 1] : null;
    if (!file) exitWith(2, 'Usage: tsx scripts/process-transcript.ts --file <path> [--from "+91..."] [--to "+1..."]');
    return { file, from, to };
}

function normSpeaker(label: string): 'USER' | 'ASSISTANT' | null {
    const l = label.trim().toLowerCase();
    if (l === 'user' || l === 'caller') return 'USER';
    if (l === 'assistant' || l === 'agent') return 'ASSISTANT';
    return null;
}

function parseLinesToTurns(raw: string): Turn[] {
    const lines = raw.split(/\r?\n/);
    const turns: Turn[] = [];
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // [USER 00:00] Text  OR  [ASSISTANT 00:00:12] Text
        let m = line.match(/^\[(?<sp>[^\]\s:]+)\s+(?<ts>\d{1,2}:\d{2}(?::\d{2})?)\]\s*(?<tx>.*)$/);
        if (m && m.groups) {
            const sp = normSpeaker(m.groups.sp);
            if (sp) {
                turns.push({ speaker: sp, timestamp: m.groups.ts, text: m.groups.tx.trim() });
                continue;
            }
        }

        // [USER] Text (no timestamp)
        m = line.match(/^\[(?<sp>[^\]\s:]+)\]\s*(?<tx>.*)$/);
        if (m && m.groups) {
            const sp = normSpeaker(m.groups.sp);
            if (sp) {
                turns.push({ speaker: sp, timestamp: '', text: m.groups.tx.trim() });
                continue;
            }
        }

        // USER: Text  or  ASSISTANT: Text (no timestamp)
        m = line.match(/^(?<sp>[^:]+):\s*(?<tx>.*)$/);
        if (m && m.groups) {
            const sp = normSpeaker(m.groups.sp);
            if (sp) {
                turns.push({ speaker: sp, timestamp: '', text: m.groups.tx.trim() });
                continue;
            }
        }

        // Continuation line
        if (turns.length > 0) {
            const last = turns[turns.length - 1];
            last.text = (last.text + ' ' + line).trim();
        } else {
            turns.push({ speaker: 'USER', timestamp: '', text: line });
        }
    }
    return turns;
}

function detectLanguages(text: string): string[] {
    const langs = new Set<string>();
    const hasDevanagari = /[\u0900-\u097F]/.test(text);
    if (hasDevanagari) {
        if (/(\bहै\b|\bकब\b|\bकहाँ\b|कृपया)/.test(text)) langs.add('hi');
        if (/(\bआहे\b|\bकुठे\b|\bकधी\b|कृपया|तुमचा)/.test(text)) langs.add('mr');
    }
    const latinWords = (text.match(/[A-Za-z]{2,}/g) || []).length;
    if (latinWords >= 20) langs.add('en');
    if (langs.size === 0) langs.add('en');
    return Array.from(langs).sort();
}

function joinTurns(turns: Turn[]): string {
    return turns
        .map((t) => {
            const head = `[${t.speaker}${t.timestamp ? ' ' + t.timestamp : ''}]`;
            return `${head} ${t.text}`.trim();
        })
        .join('\n');
}

// Analysis helpers (copied from analyze script)
type TurnRole = { speaker: 'user' | 'assistant'; text: string };

function segmentTurnsForAnalysis(raw: string): TurnRole[] {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const turns: TurnRole[] = [];
    const explicit = lines.every((l) => l.startsWith('[USER]') || l.startsWith('[ASSISTANT]'));
    for (const line of lines) {
        if (explicit) {
            if (line.startsWith('[USER]')) {
                turns.push({ speaker: 'user', text: line.replace(/^\[USER\]\s*/, '').trim() });
            } else if (line.startsWith('[ASSISTANT]')) {
                turns.push({ speaker: 'assistant', text: line.replace(/^\[ASSISTANT\]\s*/, '').trim() });
            }
            continue;
        }

        const l = line.toLowerCase();
        const isAck = /^(ok(ay)?|sure|hmm|uh-huh|right|got it|thanks|thank you)[.!]?$/i.test(l);
        const isQuestion = /\?\s*$/.test(line);
        const hasFirstPersonI = /\bI\b/.test(line);

        if (!isAck && (isQuestion || hasFirstPersonI)) {
            turns.push({ speaker: 'user', text: line });
        } else if (isAck) {
            turns.push({ speaker: 'assistant', text: line });
        } else {
            turns.push({ speaker: 'user', text: line });
        }
    }
    return turns;
}

function lastMeaningfulUser(turns: TurnRole[]): string {
    const ignore = /\b(thanks|thank you|bye|goodbye|see you)\b/i;
    for (let i = turns.length - 1; i >= 0; i--) {
        const t = turns[i];
        if (t.speaker === 'user' && t.text && !ignore.test(t.text)) return t.text;
    }
    return '';
}

function extractEntities(text: string) {
    const phones = (text.match(/\+?\d[\d\s\-]{7,}/g) || []).map((s) => s.trim());
    const emails = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((s) => s.trim());
    const datesWord = (text.match(/\b(today|tomorrow|mon|tue|wed|thu|fri|sat|sun)\b/gi) || []).map((s) => s.toLowerCase());
    const datesNum = (text.match(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g) || []);
    const times = (text.match(/\b\d{1,2}(:\d{2})?\s?(am|pm)?\b/gi) || []);
    return {
        phones: Array.from(new Set(phones)),
        emails: Array.from(new Set(emails)),
        dates: Array.from(new Set([...datesWord, ...datesNum])),
        times: Array.from(new Set(times)),
    };
}

function buildSummary(turns: TurnRole[], entities: ReturnType<typeof extractEntities>) {
    const firstUser = turns.find((t) => t.speaker === 'user' && t.text.trim().length > 0);
    const overviewRaw = firstUser?.text || '';
    const overview = overviewRaw.slice(0, 160);

    const highlightCandidates: string[] = [];
    const raw = turns.map((t) => t.text).join(' \n ');
    const topics = [
        { key: 'membership', rx: /member(ship)?|subscribe|plan/i },
        { key: 'pricing', rx: /price|cost|fee|charge|\bRs\.?\b|\$|\d+\s?(rs|usd)/i },
        { key: 'timings', rx: /time|hours|open|close|schedule/i },
        { key: 'location', rx: /address|location|where|कहाँ|कुठे/i },
        { key: 'callback', rx: /call\s?back|return\s?call/i },
        { key: 'appointment', rx: /appoint(ment)?|book|slot|meeting/i },
    ];
    for (const t of topics) if (t.rx.test(raw)) highlightCandidates.push(t.key);
    highlightCandidates.push(...entities.dates, ...entities.times);
    const highlights = Array.from(new Set(highlightCandidates)).slice(0, 6);

    const actions: string[] = [];
    const lines = raw.split(/\n/);
    for (const line of lines) {
        const l = line.trim();
        if (/^call me back/i.test(l)) actions.push('Call back');
        if (/\bsend (me )?details\b/i.test(l)) actions.push('Send details');
        const after = l.match(/after\s+([\d: ]+(am|pm)?)/i);
        if (after) actions.push(`Follow up after ${after[1].trim()}`);
        const toEmail = l.match(/to\s+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
        if (toEmail) actions.push(`Email details to ${toEmail[1]}`);
    }
    const nextActions = Array.from(new Set(actions));

    return { overview, highlights, nextActions, entities };
}

function computeTimestamps(text: string, createdAt: Date) {
    const ts1 = Array.from(text.matchAll(/\[(\d{2}):(\d{2}):(\d{2})\]/g)).map((m) => {
        const h = parseInt(m[1], 10), mi = parseInt(m[2], 10), s = parseInt(m[3], 10);
        return { h, mi, s };
    });
    const ts2 = Array.from(text.matchAll(/\[(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\]/g)).map((m) => {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    });

    let startedAt: Date;
    let endedAt: Date;
    let durationSec: number;

    if (ts2.length > 0) {
        const min = new Date(Math.min(...ts2.map((d) => d.getTime())));
        const max = new Date(Math.max(...ts2.map((d) => d.getTime())));
        startedAt = min;
        endedAt = max;
        durationSec = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
    } else if (ts1.length > 0) {
        const secs = ts1.map((t) => t.h * 3600 + t.mi * 60 + t.s);
        const minS = Math.min(...secs);
        const maxS = Math.max(...secs);
        durationSec = Math.max(1, maxS - minS);
        endedAt = createdAt;
        startedAt = new Date(endedAt.getTime() - durationSec * 1000);
    } else {
        const wordCount = (text.match(/\S+/g) || []).length;
        durationSec = Math.max(30, Math.min(900, Math.round(wordCount / 2.5)));
        endedAt = createdAt;
        startedAt = new Date(endedAt.getTime() - durationSec * 1000);
    }

    return { startedAt, endedAt, durationSec };
}

async function ensureIndexes() {
    const db = mongoose.connection.db;
    if (!db) return;
    await db.collection('callsessions').createIndex({ startedAt: -1 });
    try {
        await db.collection('callsessions').createIndex(
            { 'meta.transcriptId': 1 },
            { unique: true, partialFilterExpression: { 'meta.transcriptId': { $exists: true } } }
        );
    } catch { }
    await db.collection('messages').createIndex({ callId: 1 }, { unique: true });
    await db.collection('transcripts').createIndex({ fileName: 1 }, { unique: true });
    await db.collection('transcripts').createIndex({ createdAt: -1 });
}

async function upsertTranscript(filePath: string, from: string | null, to: string | null) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const turns = parseLinesToTurns(raw);
    const text = joinTurns(turns);
    const Language = detectLanguages(raw);
    const fileName = path.basename(filePath);
    const jsonName = fileName.replace(/\.txt$/i, '.json');
    const transcripts = mongoose.connection.db!.collection<TranscriptDoc>('transcripts');

    const now = new Date();
    await transcripts.updateOne(
        { fileName },
        { $set: { jsonName, callId: null, from: from ?? null, to: to ?? null, Language, turns, text }, $setOnInsert: { createdAt: now } },
        { upsert: true }
    );
    const saved = await transcripts.findOne({ fileName }, { projection: { _id: 1 } });
    if (!saved?._id) throw new Error('Transcript upsert failed to return _id');
    return { transcriptId: saved._id, raw, text, Language };
}

async function upsertAnalysis(transcriptId: mongoose.Types.ObjectId) {
    const db = mongoose.connection.db!;
    const transcriptsCol = db.collection<TranscriptDoc>('transcripts');
    const sessionsCol = db.collection<CallSessionDoc>('callsessions');
    const messagesCol = db.collection<MessageDoc>('messages');

    const transcript = await transcriptsCol.findOne({ _id: transcriptId });
    if (!transcript) throw new Error(`Transcript ${transcriptId.toHexString()} not found`);

    // Resilient analysis
    let Language: string[] = ['en'];
    let startedAt = new Date(transcript.createdAt);
    let endedAt = new Date(transcript.createdAt);
    let durationSec = 60;
    let turnsA = [] as TurnRole[];
    let entities = { phones: [] as string[], emails: [] as string[], dates: [] as string[], times: [] as string[] };
    let summary = { overview: '', highlights: [] as string[], nextActions: [] as string[], entities };
    let messageText = '';
    try {
        Language = transcript.Language && transcript.Language.length ? transcript.Language : detectLanguages(transcript.text);
        turnsA = segmentTurnsForAnalysis(transcript.text);
        entities = extractEntities(transcript.text);
        summary = buildSummary(turnsA, entities);
        messageText = lastMeaningfulUser(turnsA);
        const t = computeTimestamps(transcript.text, new Date(transcript.createdAt));
        startedAt = t.startedAt; endedAt = t.endedAt; durationSec = t.durationSec;
    } catch { }

    // callsessions
    let callId = transcript.callId || undefined;
    if (callId) {
        await sessionsCol.updateOne(
            { _id: callId },
            {
                $setOnInsert: { from: transcript.from ?? null, to: transcript.to ?? null, meta: { source: 'sim', transcriptId: transcript._id } },
                $set: { Language, startedAt, endedAt, durationSec },
            },
            { upsert: true }
        );
    } else {
        const ins = await sessionsCol.insertOne({
            from: transcript.from ?? null,
            to: transcript.to ?? null,
            startedAt,
            endedAt,
            durationSec,
            Language,
            meta: { source: 'sim', transcriptId: transcript._id },
        });
        callId = ins.insertedId as unknown as mongoose.Types.ObjectId;
    }

    // messages upsert
    const messageDoc: MessageDoc = {
        callId: callId!,
        caller: transcript.from ?? null,
        Language,
        messageText,
        rawTranscript: transcript.text,
        summary,
        createdAt: new Date(),
    };
    const up = await messagesCol.updateOne(
        { callId: callId! },
        { $set: { callId: messageDoc.callId, caller: messageDoc.caller, Language: messageDoc.Language, messageText: messageDoc.messageText, rawTranscript: messageDoc.rawTranscript, summary: messageDoc.summary }, $setOnInsert: { createdAt: messageDoc.createdAt } },
        { upsert: true }
    );

    await transcriptsCol.updateOne({ _id: transcript._id }, { $set: { callId } });

    let messageId: mongoose.Types.ObjectId | undefined = (up.upsertedId as any) || (await messagesCol.findOne({ callId: callId! }, { projection: { _id: 1 } }))?._id as any;
    return { callId: callId!, messageId: messageId! };
}

async function main() {
    const { file, from, to } = parseArgs();
    if (!fs.existsSync(file)) exitWith(2, `File not found: ${file}`);

    const rawUri = process.env.MONGO_URL || process.env.MONGODB_URI;
    if (!rawUri) exitWith(3, 'MONGO_URL (or MONGODB_URI) missing');
    let uri = rawUri;
    try {
        const u = new URL(rawUri);
        if (!u.pathname || u.pathname === '/' || u.pathname === '') { u.pathname = '/ai-call-agent'; uri = u.toString(); }
    } catch {
        if (!/\/[A-Za-z0-9_-]+(\?|$)/.test(rawUri)) { uri = rawUri.replace(/\/?$/, '/ai-call-agent'); }
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    await ensureIndexes();

    const { transcriptId } = await upsertTranscript(file, from, to);
    const { callId, messageId } = await upsertAnalysis(transcriptId);

    console.log(JSON.stringify({ transcriptId: String(transcriptId), callId: String(callId), messageId: String(messageId) }, null, 2));
    await mongoose.connection.close();
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
