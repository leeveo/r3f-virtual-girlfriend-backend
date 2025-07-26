// index.js origin
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import pkg from 'pg';
const { Pool } = pkg;
import { v4 as uuidv4 } from 'uuid';

import { answerWithRAG } from "./rag/qa.js";
import { ingestDocuments } from "./rag/ingest.js";
import { audioFileToBase64 } from "./lib/audioUtils.js";
import { generateElevenLabsAudio } from "./lib/elevenLabsTTS.js";
import { synthesizeSpeechWithVisemes } from "./lib/azureTTS.js";

// Setup __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables
dotenv.config({ path: "./.env" });
console.log("🔐 AZURE VOICE:", process.env.AZURE_SPEECH_VOICE);
console.log("🔐 REGION:", process.env.AZURE_SPEECH_REGION);

// PostgreSQL connection
const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT,
  ssl: true
});

// Test database connection
pool.connect()
  .then(() => console.log('✅ Connected to PostgreSQL'))
  .catch(err => console.error('❌ PostgreSQL connection error:', err));

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

// Audio folder
const audiosPath = path.resolve(__dirname, "audios");
await fs.mkdir(audiosPath, { recursive: true });

// Init express
const app = express();
const port = process.env.PORT || 3000;

// CORS
// CORS - remplacement complet
app.use(cors({
  origin: [
    "https://neemba-frontend.vercel.app"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));


app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
});

app.use(express.json());
app.use("/audios", express.static(audiosPath));

// Logs
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

// Healthcheck
app.get("/", (_, res) => res.send("✅ Neemba backend is running."));
app.get("/health", (_, res) =>
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
);

// Session creation endpoint
app.post("/session/create", async (req, res) => {
  try {
    const sessionId = uuidv4();
    const userId = req.body.userId || null; // optionnel pour les utilisateurs anonymes
    
    const query = 'INSERT INTO user_sessions (session_id, user_id) VALUES ($1, $2) RETURNING *';
    const result = await pool.query(query, [sessionId, userId]);
    
    console.log('📝 New session created:', sessionId);
    res.status(201).json({ 
      sessionId: sessionId,
      createdAt: result.rows[0].created_at 
    });
  } catch (err) {
    console.error('❌ Session creation error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Session end endpoint
app.post("/session/end", async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId." });
    
    const query = 'UPDATE user_sessions SET ended_at = NOW() WHERE session_id = $1 RETURNING *';
    const result = await pool.query(query, [sessionId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found." });
    }
    
    console.log('📝 Session ended:', sessionId);
    res.status(200).json({ 
      message: 'Session ended successfully',
      sessionId: sessionId 
    });
  } catch (err) {
    console.error('❌ Session end error:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// Get session info endpoint
app.get("/session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const query = 'SELECT * FROM user_sessions WHERE session_id = $1';
    const result = await pool.query(query, [sessionId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found." });
    }
    
    res.status(200).json({ session: result.rows[0] });
  } catch (err) {
    console.error('❌ Session get error:', err);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;
    const sessionId = req.body.sessionId; // Récupérer l'ID de session
    const engine = req.body.engine || "azure";
    
    if (!userMessage) return res.status(400).json({ error: "Missing message." });
    if (!sessionId) return res.status(400).json({ error: "Missing sessionId." });

    // Vérifier que la session existe
    const sessionCheck = await pool.query('SELECT id FROM user_sessions WHERE session_id = $1', [sessionId]);
    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: "Session not found." });
    }

    const { messages } = await answerWithRAG(userMessage);

    const processed = await Promise.all(
      messages.map(async (msg, index) => {
        const id = `${Date.now()}_${index}`;
        const audioPath = path.join(audiosPath, `message_${id}.wav`);
        let audio, cues;

        try {
          if (engine === "azure") {
            const visemes = await synthesizeSpeechWithVisemes(msg.text, audioPath);
            audio = await audioFileToBase64(audioPath);
            cues = visemes.map((v, idx, arr) => {
              const start = v.time;
              const nextStart = arr[idx + 1]?.time;
              const end = nextStart ? (start + nextStart) / 2 : start + 0.15;
              return {
                value: mapAzureVisemeIdToMouthCue(v.visemeId),
                start,
                end,
              };
            });
          } else if (engine === "deepgram") {
            // ici tu peux utiliser ElevenLabs pour générer l'audio, puis Deepgram pour analyser
            await generateElevenLabsAudio(msg.text, audioPath); // à implémenter
            audio = await audioFileToBase64(audioPath);
            cues = await analyzeVisemesWithDeepgram(audioPath);
          }

          return {
            ...msg,
            audio,
            lipsync: { mouthCues: cues },
          };
        } catch (err) {
          console.error(`❌ TTS error (${engine}):`, err.message);
          return { ...msg, audio: null, lipsync: null, error: err.message };
        }
      })
    );

    res.status(200).json({ messages: processed });
  } catch (err) {
    console.error("❌ Internal error:", err);
    res.status(500).json({ error: "Internal server error", detail: err.message });
  }
});
// Map Azure viseme ID ➜ generic viseme code
function mapAzureVisemeIdToMouthCue(id) {
  const map = {
    0: "rest",      // silence
    1: "A",         // ae
    2: "B",         // ah
    3: "C",         // aw
    4: "D",         // ay
    5: "E",         // b
    6: "F",         // ch
    7: "G",         // d
    8: "H",         // eh
    9: "X",         // ey
    10: "F",        // f
    11: "G",        // g
    12: "H",        // h
    13: "E",        // ih
    14: "D",        // iy
    15: "G",        // j
    16: "G",        // k
    17: "G",        // l
    18: "B",        // m
    19: "B",        // n
    20: "B",        // ng
    21: "C",        // ow
    22: "C",        // oy
    23: "B",        // p
    24: "H",        // r
    25: "H",        // s
    26: "H",        // sh
    27: "H",        // t
    28: "H",        // th
    29: "E",        // uh
    30: "D",        // uw
    31: "F",        // v
    32: "F",        // w
    33: "F",        // y
    34: "H",        // z
    35: "H",        // zh
  };
  return map[id] || "rest";
}

// Launch
const startServer = async () => {
  try {
    console.log("📚 Ingesting documents...");
    await ingestDocuments();
    console.log("✅ Documents ready.");
    app.listen(port, () => {
      console.log(`🚀 Neemba API listening on port ${port}`);
    });
  } catch (err) {
    console.error("❌ Startup failed:", err);
    process.exit(1);
  }
};

startServer();
