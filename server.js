const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 10000;

// Apply Middleware safely
app.use(cors());
app.use(express.json());

// Set up secure upload directory tracking
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
const upload = multer({ dest: "uploads/" });

// Guard API Initialization against missing environment variables
if (!process.env.OPENAI_API_KEY) {
    console.error("CRITICAL ERROR: OPENAI_API_KEY environment variable is missing!");
}
if (!process.env.DATABASE_URL) {
    console.error("CRITICAL ERROR: DATABASE_URL environment variable is missing!");
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "dummy-key-to-prevent-boot-crash",
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Database verification loop
const initDb = async () => {
    if (!process.env.DATABASE_URL) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS voice_ledger (
                id SERIAL PRIMARY KEY,
                user_name TEXT NOT NULL,
                original_text TEXT NOT NULL,
                english_translation TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Postgres SQL ledger tables verified successfully.");
    } catch (err) {
        console.error("Database connection block encountered:", err.message);
    }
};
initDb();

// Absolute Base Route to ensure Render doesn't throw a health-check timeout error
app.get("/", (req, res) => {
    res.status(200).send("Voice Memory Ledger Engine is Online and Running Flawlessly.");
});

// Main processing routing channel
app.post("/api/process-voice", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Payload empty. No audio data caught." });
        }

        const audioPath = req.file.path;
        const userName = req.body.name || "Anonymous";

        // 1. Audio Stream Transcription Capture
        const transcriptionResponse = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
        });

        let rawSpokenText = transcriptionResponse.text || "";
        console.log(`[Captured Voice Stream]: ${rawSpokenText}`);

        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }

        if (!rawSpokenText.trim()) {
            return res.json({ transcription: "Audio stream silent. retry.", type: "store" });
        }

        // 2. Clear Intent Detection Override Rule
        const lowerText = rawSpokenText.toLowerCase();
        const questionTriggers = [
            'where', 'what', 'who', 'how', 'which', 'when', '?', 
            'कुठे', 'काय', 'कोण', 'कसे', 'केव्हा', 'कहाँ', 'किधर',
            'kuthe', 'kothe', 'ahet', 'aahe', 'elley', 'ellide'
        ];
        let isQueryMode = questionTriggers.some(word => lowerText.includes(word));

        // 3. Dual-channel context refinement (Separated prompts to prevent text mutation)
        const grammarCorrection = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are a professional multi-lingual text editor. Your job is to correct punctuation and typing mistakes. IMPORTANT SCRIPT RULE: If the user input is completely in English, keep it in the English alphabet. Do not convert English sentences to Devanagari script. If it is in Marathi/Hindi, use clean Devanagari script text, keeping explicit vocabulary like 'medicines', 'box', 'bottle' in English Roman letters."
                },
                { role: "user", content: rawSpokenText }
            ]
        });

        const translationCorrection = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Translate the provided text statement accurately into plain, baseline English text. Return ONLY the translated words." },
                { role: "user", content: rawSpokenText }
            ]
        });

        const polishedText = grammarCorrection.choices[0].message.content.trim();
        const englishTranslation = translationCorrection.choices[0].message.content.trim();

        console.log(`[Processed Metrics]: Polished="${polishedText}" | Mode: ${isQueryMode ? "QUERY" : "STORE"}`);

        if (isQueryMode) {
            // --- DATA EXTRACTION RETRIEVAL SEQUENCE ---
            const dbResult = await pool.query(
                "SELECT original_text, english_translation FROM voice_ledger WHERE user_name = $1 ORDER BY created_at DESC LIMIT 40",
                [userName]
            );

            const pastMemories = dbResult.rows.map(row => 
                `- Logged Fact: "${row.original_text}" (English Core Meaning: "${row.english_translation}")`
            ).join("\n");

            const memoryRecallPrompt = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are a precise voice diary assistant. Answer the user's question accurately using their historical records ledger. CRITICAL METRIC: Formulate your answer response in the EXACT language script style used in the current question. If the question is asked in English, answer in English. If asked in Marathi/Hindi script, answer in fluent Devanagari text script, retaining English nouns where it matches conversational patterns naturally."
                    },
                    { 
                        role: "user", 
                        content: `User: ${userName}\nLedger Matrix:\n${pastMemories || "No entries logged."}\n\nCurrent Question: "${polishedText}"\nEnglish Meaning: "${englishTranslation}"` 
                    }
                ]
            });

            const finalAnswer = memoryRecallPrompt.choices[0].message.content.trim();

            return res.json({
                transcription: polishedText,
                type: "query",
                reply: finalAnswer
            });

        } else {
            // --- LEDGER DATABASE PERSISTENCE SEQUENCE ---
            await pool.query(
                "INSERT INTO voice_ledger (user_name, original_text, english_translation) VALUES ($1, $2, $3)",
                [userName, polishedText, englishTranslation]
            );

            return res.json({
                transcription: polishedText, 
                type: "store"
            });
        }

    } catch (err) {
        console.error("Internal Request Router Failure Caught:", err.message);
        res.status(500).json({ error: "Internal processing crash." });
    }
});

app.listen(PORT, () => {
    console.log(`Server actively bound and executing live on port ${PORT}`);
});