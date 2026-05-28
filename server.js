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

// 4. CORE ENGINE: Process Voice Audio Stream with Auto-Language Detection & LLM Grammar Correction
app.post("/api/process-voice", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No audio file payload received." });
        }

        const audioPath = req.file.path;
        const userName = req.body.name || "Anonymous";

        // Step A: Capture Raw Audio Audio Transcription
        const transcriptionResponse = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
            prompt: "माझे जेवण टेबलवर आहे. माझी चावी कपाटात आहे. Where is my food? Multi-lingual voice memory diary tracking Marathi and English.",
        });

        const rawSpokenText = transcriptionResponse.text;
        console.log(`[Whisper Raw Capture]: ${rawSpokenText}`);

        // Clean up temporary server storage file immediately
        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }

        // Step B: LINGUISTIC SANITIZER & INTENT ANALYSIS (The Grammar Correction Engine)
        // This step completely rewrites any messy script or hallucinated typos into perfect, natural grammar.
        const grammarAndIntentAnalysis = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an expert multi-lingual editor and brain for a voice memory ledger. Your job is to analyze the raw, messy transcription text from a microphone and fix it completely.

                    Follow these strict execution steps:
                    1. Identify what language the user is speaking (e.g., "Marathi", "English").
                    2. CRITICAL: Correct the grammar, fix any spelling mistakes, remove hallucinated words, and polish the text so it looks like a natural, perfectly written sentence in that language. If it is Marathi, it must be written in flawless, grammatically accurate Devanagari script (e.g., fix bad endings, use proper words like 'कपाटात', 'टेबलवर').
                    3. Determine if the user is trying to STORE information or QUERY/ASK a question.
                    4. Provide an accurate, clear English translation of the core meaning for uniform backend lookup.

                    Return your response strictly as a JSON object with these exact keys:
                    {"correctedText": "perfectly polished text here", "isQuery": true/false, "englishTranslation": "accurate English meaning text here", "detectedLanguage": "language name"}`
                },
                { role: "user", content: rawSpokenText }
            ],
            response_format: { type: "json_object" }
        });

        const analysis = JSON.parse(grammarAndIntentAnalysis.choices[0].message.content);
        const polishedText = analysis.correctedText; // This is our clean, hallucination-free text!
        
        console.log(`[LLM Cleaned Text]: ${polishedText}`);
        console.log(`[Intent Analysis]: Query=${analysis.isQuery}, Language=${analysis.detectedLanguage}`);

        // Step C: Routing Infrastructure
        if (analysis.isQuery) {
            // --- CROSS LANGUAGE RECALL LOOP ---
            // Fetch all past history records from Postgres SQL ledger for this specific user profile
            const dbResult = await pool.query(
                "SELECT original_text, english_translation FROM voice_ledger WHERE user_name = $1 ORDER BY created_at DESC LIMIT 50",
                [userName]
            );

            const pastMemories = dbResult.rows.map(row => 
                `- Stored Memory: "${row.original_text}" (English Meaning: "${row.english_translation}")`
            ).join("\n");

            // Direct the LLM to cross-reference logs and respond in pristine, matching query language grammar
            const aiRecall = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are a premium memory retrieval assistant. Look through the user's past memories listed below. 
                        Answer the user's question accurately based on their records.
                        
                        **SYSTEM RULE**: You must formulate your final response to the user in the EXACT language they used to ask the question.
                        - If the current question is asked in Marathi, your response MUST be written in beautiful, native, grammatically flawless Devanagari script.
                        - If the current question is asked in English, your response MUST be in clear, proper English.
                        Never mix languages or return garbled text.`
                    },
                    { 
                        role: "user", 
                        content: `User Profile Name: ${userName}
                        Target Output Language: ${analysis.detectedLanguage}
                        
                        Past Memories Matrix:
                        ${pastMemories || "No previous records logged."}
                        
                        Current Question Spoken (Polished): "${polishedText}"
                        English Meaning: "${analysis.englishTranslation}"` 
                    }
                ]
            });

            const finalAnswer = aiRecall.choices[0].message.content;

            return res.json({
                transcription: polishedText, // Displays the clean, perfectly punctuated question on your phone screen
                type: "query",
                reply: finalAnswer // Displays the retrieved intelligence in pristine matching script
            });

        } else {
            // --- MULTI-LINGUAL LEDGER STORAGE LOOP ---
            // Record BOTH the polished transcription and the structural English meaning into the SQL ledger
            await pool.query(
                "INSERT INTO voice_ledger (user_name, original_text, english_translation) VALUES ($1, $2, $3)",
                [userName, polishedText, analysis.englishTranslation]
            );

            return res.json({
                transcription: polishedText, // Shows the beautiful, grammatically correct text on screen
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