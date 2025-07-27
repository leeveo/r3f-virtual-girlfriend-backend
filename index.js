// index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

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

// Validation des clés Azure
const validateAzureConfig = async () => {
  const requiredVars = ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION', 'AZURE_SPEECH_VOICE'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.warn(`⚠️ Variables Azure manquantes: ${missing.join(', ')}`);
    return false;
  }
  
  // Valider l'endpoint si fourni
  if (process.env.AZURE_SPEECH_ENDPOINT) {
    console.log("🔐 AZURE ENDPOINT:", process.env.AZURE_SPEECH_ENDPOINT);
  } else {
    console.log("ℹ️ Endpoint Azure non défini, utilisation de l'endpoint par défaut");
  }
  
  console.log("✅ Configuration Azure validée");
  console.log("🔐 AZURE VOICE:", process.env.AZURE_SPEECH_VOICE);
  console.log("🔐 REGION:", process.env.AZURE_SPEECH_REGION);
  
  // Test de fonctionnement du module Azure TTS
  try {
    console.log("🧪 Test du module Azure TTS...");
    // Test simple d'import sans exécution
    const testPath = path.join(audiosPath, "test_azure.wav");
    await synthesizeSpeechWithVisemes("Test", testPath);
    console.log("✅ Module Azure TTS fonctionnel");
    return true;
  } catch (err) {
    console.error("❌ Erreur module Azure TTS:", err.message);
    console.error("🔍 Détails:", err.code || err.name);
    return false;
  }
};

const azureConfigValid = await validateAzureConfig();

// Audio folder
const audiosPath = path.resolve(__dirname, "audios");
await fs.mkdir(audiosPath, { recursive: true });

// Init express
const app = express();
const port = process.env.PORT || 3000;

// CORS
app.options("*", cors());
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

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;
    const engine = req.body.engine || "azure";
    if (!userMessage) return res.status(400).json({ error: "Missing message." });

    console.log(`💬 Message reçu: ${userMessage}`);
    
    const { messages } = await answerWithRAG(userMessage);
    console.log(`🤖 Réponse générée: ${messages.length} messages`);

    const processed = await Promise.all(
      messages.map(async (msg, index) => {
        const id = `${Date.now()}_${index}`;
        const audioPath = path.join(audiosPath, `message_${id}.wav`);
        let audio = null;
        let cues = [];

        try {
          if (engine === "azure" && azureConfigValid) {
            console.log(`🎵 Génération audio Azure pour: "${msg.text.substring(0, 50)}..."`);
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
            console.log(`✅ Audio Azure généré pour: "${msg.text.substring(0, 30)}..."`);
          } else if (engine === "deepgram") {
            await generateElevenLabsAudio(msg.text, audioPath);
            audio = await audioFileToBase64(audioPath);
            cues = await analyzeVisemesWithDeepgram(audioPath);
          } else {
            console.warn(`⚠️ Engine ${engine} non disponible ou config invalide, réponse text-only`);
          }

          return {
            ...msg,
            audio,
            lipsync: { mouthCues: cues },
          };
        } catch (err) {
          console.error(`❌ TTS error (${engine}):`, {
            message: err.message || err,
            code: err.code,
            name: err.name,
            stack: err.stack?.split('\n')[0]
          });
          // Retourner quand même le message texte, même si l'audio échoue
          return { 
            ...msg, 
            audio: null, 
            lipsync: { mouthCues: [] }, 
            error: `TTS failed: ${err.message || 'Module import error'}` 
          };
        }
      })
    );

    console.log(`📤 Envoi de ${processed.length} messages traités`);
    res.status(200).json({ messages: processed });
  } catch (err) {
    console.error("❌ Internal error:", err);
    res.status(500).json({ 
      error: "Internal server error", 
      detail: err.message,
      messages: [{ text: "Désolé, une erreur s'est produite.", audio: null, lipsync: null }]
    });
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
