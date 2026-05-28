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

// Database initialization helper
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

// 4. CORE ENGINE: Process Voice Audio Stream with Mixed-Language Intelligence
app.post("/api/process-voice", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No audio file payload received." });
        }

        const audioPath = req.file.path;
        const userName = req.body.name || "Anonymous";

        // Step A: Capture Raw Audio Transcription
        const transcriptionResponse = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
            prompt: "माझी medicines कुठे आहेत? माझे जेवण टेबलवर आहे. माझी चावी kapaat मध्ये आहे. Where are my keys? Multi-lingual conversational ledger handling mixed Marathi and English speech seamlessly.",
        });

        const rawSpokenText = transcriptionResponse.text;
        console.log(`[Whisper Raw Capture]: ${rawSpokenText}`);

        // Clean up temporary server storage file immediately
        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }

        // Step B: INTENT SANITIZER & MIXED-LANGUAGE INTERPRETER
        // This upgraded system instruction explicitly handles mixed language inputs.
        const grammarAndIntentAnalysis = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an expert multi-lingual editor for an advanced voice diary ledger. 
                    The user frequently mixes English words into Marathi sentences (e.g., saying "माझी medicines कुठे आहेत?" or "mobile चार्जिंगला लावला आहे").

                    Follow these strict execution steps:
                    1. Clean up the text. If they use an English word in a Marathi sentence, preserve the English word cleanly in Roman script or proper Devanagari so it reads naturally and professionally (e.g., "माझी medicines कुठे आहेत?"). Fix any messy microphone typos.
                    2. Determine if the user is trying to STORE information or QUERY/ASK a question.
                    3. Provide a high-precision English translation of the core meaning. If they ask about "medicines", ensure the English translation uses "medicines" or "medication" so it easily matches past entries.
                    4. Identify the dominant language style they used for display purposes.

                    Return your response strictly as a JSON object with these exact keys:
                    {"correctedText": "clean formatted sentence here", "isQuery": true/false, "englishTranslation": "clear core English meaning here", "detectedLanguage": "language name"}`
                },
                { role: "user", content: rawSpokenText }
            ],
            response_format: { type: "json_object" }
        });

        const analysis = JSON.parse(grammarAndIntentAnalysis.choices[0].message.content);
        const polishedText = analysis.correctedText;
        
        console.log(`[LLM Cleaned Text]: ${polishedText}`);
        console.log(`[Intent Analysis]: Query=${analysis.isQuery}, Translation Link=${analysis.englishTranslation}`);

        // Step C: Routing Infrastructure
        if (analysis.isQuery) {
            // --- CROSS LANGUAGE RECALL LOOP ---
            const dbResult = await pool.query(
                "SELECT original_text, english_translation FROM voice_ledger WHERE user_name = $1 ORDER BY created_at DESC LIMIT 50",
                [userName]
            );

            const pastMemories = dbResult.rows.map(row => 
                `- Stored Memory: "${row.original_text}" (English Meaning: "${row.english_translation}")`
            ).join("\n");

            // Direct the LLM to cross-reference conceptual meanings, ignoring any language barriers or mixed words
            const aiRecall = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are a premium memory retrieval assistant. Look through the user's past memories listed below. 
                        Answer the user's question accurately based on the conceptual meaning of their records.
                        
                        **SYSTEM RULE**: You must formulate your final response to the user in the EXACT language style they used to ask the question.
                        - If they ask using a mix of Marathi and English (e.g., "माझी medicines कुठे आहेत?"), reply back in natural conversational Marathi, incorporating English terms where it makes the sentence sound fluid and conversational (e.g., "तुमची medicines कपाटाच्या पहिल्या कप्प्यात ठेवली आहेत.").
                        - Ensure the Devanagari script is beautiful, perfectly punctuated, and grammatically flawless.`
                    },
                    { 
                        role: "user", 
                        content: `User Profile Name: ${userName}
                        Target Output Language Context: ${analysis.detectedLanguage}
                        
                        Past Memories Matrix:
                        ${pastMemories || "No previous records logged."}
                        
                        Current Question Spoken (Polished): "${polishedText}"
                        English Meaning Lookup Concept: "${analysis.englishTranslation}"` 
                    }
                ]
            });

            const finalAnswer = aiRecall.choices[0].message.content;

            return res.json({
                transcription: polishedText, // Displays the clean blended question on your screen
                type: "query",
                reply: finalAnswer // Displays the retrieved intelligence in matching conversational script
            });

        } else {
            // --- MULTI-LINGUAL LEDGER STORAGE LOOP ---
            await pool.query(
                "INSERT INTO voice_ledger (user_name, original_text, english_translation) VALUES ($1, $2, $3)",
                [userName, polishedText, analysis.englishTranslation]
            );

            return res.json({
                transcription: polishedText, 
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