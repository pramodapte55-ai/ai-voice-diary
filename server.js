const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 10000;

// 1. Middleware Settings
app.use(cors());
app.use(express.json());

// Configure file storage for incoming mobile raw audio files
const upload = multer({ dest: "uploads/" });

// 2. Initialize AI API Engine & SQL Database Pool Connections
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for secure cloud database connections
});

// Database initialization helper (creates table automatically if missing)
const initDb = async () => {
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
        console.log("Database tables verified/initialized successfully.");
    } catch (err) {
        console.error("Database initialization failed:", err);
    }
};
initDb();

// 3. Absolute Root Health-Check Path
app.get("/", (req, res) => {
    res.status(200).send("Voice Memory Ledger API Engine is awake and active.");
});

// 4. CORE ENGINE: Process Voice Audio Stream with Auto-Language Detection
app.post("/api/process-voice", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No audio file payload received." });
        }

        const audioPath = req.file.path;
        const userName = req.body.name || "Anonymous";

        // Step A: Audio Transcription with Automatic Native Language Detection
        // Removing the strict 'language' filter forces Whisper to detect Marathi vs English by cadence
        const transcriptionResponse = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
        });

        const spokenText = transcriptionResponse.text;
        console.log(`[Captured Speech from ${userName}]: ${spokenText}`);

        // Clean up temporary server storage file immediately to preserve disk space
        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }

        // Step B: Intent Analysis & Automated High-Precision Cross-Language Translation
        const intentAnalysis = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are the brain of a multi-lingual voice memory ledger. Analyze the incoming text.
                    1. Determine if the user is trying to STORE information or QUERY/ASK a question.
                    2. Provide an accurate English translation of the core meaning for uniform cross-language matching.
                    Return your response strictly as a JSON object with these exact keys: 
                    {"isQuery": true/false, "englishTranslation": "text here"}`
                },
                { role: "user", content: spokenText }
            ],
            response_format: { type: "json_object" }
        });

        const analysis = JSON.parse(intentAnalysis.choices[0].message.content);
        console.log(`[Intent Analysis]: Query=${analysis.isQuery}, Translation=${analysis.englishTranslation}`);

        // Step C: Routing Infrastructure
        if (analysis.isQuery) {
            // --- CROSS LANGUAGE RECALL LOOP ---
            // Fetch all past history records from Postgres SQL ledger for this specific user profile
            const dbResult = await pool.query(
                "SELECT original_text, english_translation FROM voice_ledger WHERE user_name = $1 ORDER BY created_at DESC LIMIT 50",
                [userName]
            );

            const pastMemories = dbResult.rows.map(row => 
                `- Stored: "${row.original_text}" (English Translation meaning: "${row.english_translation}")`
            ).join("\n");

            // Direct an LLM processor to cross-reference logs and respond exclusively in English
            const aiRecall = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are a memory retrieval assistant. Look through the user's past memories listed below. 
                        Answer the user's question accurately based on their memories. 
                        **CRITICAL RULE**: Always answer the user clearly in English, even if the past memories are recorded in Marathi or Hindi.`
                    },
                    { 
                        role: "user", 
                        content: `User Profile Name: ${userName}\n\nPast Memories Matrix:\n${pastMemories || "No previous records logged."}\n\nCurrent Question Spoken: "${spokenText}"\nEnglish Meaning: "${analysis.englishTranslation}"` 
                    }
                ]
            });

            const finalAnswer = aiRecall.choices[0].message.content;

            return res.json({
                transcription: spokenText, // Displays what you spoke in Marathi on your phone screen
                type: "query",
                reply: finalAnswer // Displays the retrieved intelligence cleanly back to you in English
            });

        } else {
            // --- MULTI-LINGUAL LEDGER STORAGE LOOP ---
            // Record BOTH the raw audio transcription (Marathi text) and the structural English meaning
            await pool.query(
                "INSERT INTO voice_ledger (user_name, original_text, english_translation) VALUES ($1, $2, $3)",
                [userName, spokenText, analysis.englishTranslation]
            );

            return res.json({
                transcription: spokenText, // Shows exactly what you spoke on screen
                type: "store"
            });
        }

    } catch (error) {
        console.error("Backend pipeline crash caught:", error);
        res.status(500).json({ error: "Internal processing error running multi-lingual memory maps." });
    }
});

// 5. Start Server Engine Listener
app.listen(PORT, () => {
    console.log(`Server executing live on port ${PORT}`);
});