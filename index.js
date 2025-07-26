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

// Create audio directory if needed
const audiosPath = path.resolve(__dirname, "audios");
await fs.mkdir(audiosPath, { recursive: true });

// Init express
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://neemba-frontend.vercel.app"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
app.use("/audios", express.static(audiosPath));

// Logging
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

// Routes
app.get("/", (_, res) => res.send("✅ Neemba backend is running."));
app.get("/health", (_, res) =>
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
);

app.post("/chat", async (req, res) => {
  const { message: userMessage, engine = "azure" } = req.body;
  if (!userMessage) return res.status(400).json({ error: "Missing message." });

  try {
    const { messages } = await answerWithRAG(userMessage);

    const processed = await Promise.all(messages.map(async (msg, index) => {
      const id = `${Date.now()}_${index}`;
      const audioPath = path.join(audiosPath, `message_${id}.wav`);
      let audio = null;
      let cues = [];

      try {
        if (engine === "azure") {
          const visemes = await synthesizeSpeechWithVisemes(msg.text, audioPath);
          audio = await audioFileToBase64(audioPath);
          cues = visemes.map((v, i, arr) => {
            const start = v.time;
            const end = arr[i + 1]?.time ? (start + arr[i + 1].time) / 2 : start + 0.15;
            return {
              value: mapAzureVisemeIdToMouthCue(v.visemeId),
              start,
              end,
            };
          });
        } else if (engine === "deepgram") {
          await generateElevenLabsAudio(msg.text, audioPath); // Placeholder
          audio = await audioFileToBase64(audioPath);
          // Add Deepgram analysis logic here if needed
        }
      } catch (err) {
        console.error(`❌ TTS error (${engine}):`, err.message);
      }

      return {
        ...msg,
        audio,
        lipsync: { mouthCues: cues },
      };
    }));

    res.status(200).json({ messages: processed });
  } catch (err) {
    console.error("❌ Internal error:", err);
    res.status(500).json({ error: "Internal server error", detail: err.message });
  }
});

// Map Azure viseme ID ➜ generic viseme code
function mapAzureVisemeIdToMouthCue(id) {
  const map = {
    0: "rest", 1: "A", 2: "B", 3: "C", 4: "D", 5: "E", 6: "F", 7: "G", 8: "H", 9: "X",
    10: "F", 11: "G", 12: "H", 13: "E", 14: "D", 15: "G", 16: "G", 17: "G", 18: "B",
    19: "B", 20: "B", 21: "C", 22: "C", 23: "B", 24: "H", 25: "H", 26: "H", 27: "H",
    28: "H", 29: "E", 30: "D", 31: "F", 32: "F", 33: "F", 34: "H", 35: "H"
  };
  return map[id] || "rest";
}

// Start server
const startServer = async () => {
  try {
    console.log("📚 Ingesting documents...");
    await ingestDocuments();
    console.log("✅ Documents ready.");
    app.listen(port, () => console.log(`🚀 Neemba API listening on port ${port}`));
  } catch (err) {
    console.error("❌ Startup failed:", err);
    process.exit(1);
  }
};

startServer();
