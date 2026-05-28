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

// 4. CORE ENGINE: Process Voice Audio Stream with Hybrid Script Preservation
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
            prompt: "माझी medicines कुठे आहेत? माझे जेवण table वर आहे. माझी चावी box मध्ये आहे. Where are my things? Multi-lingual conversational ledger handling mixed script environments flawlessly.",
        });

        const rawSpokenText = transcriptionResponse.text;
        console.log(`[Whisper Raw Capture]: ${rawSpokenText}`);

        // Clean up temporary server storage file immediately
        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }

        // Step B: LINGUISTIC SCRIPT SANITIZER
        // CRITICAL UPDATE: Instructs the AI to leave English words in the English script (Roman alphabet)
        const grammarAndIntentAnalysis = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an expert multi-lingual editor for a voice ledger. The user speaks a mix of regional Indian languages (Marathi, Tamil, Kannada, Hindi) and inserts English words naturally.

                    Follow these strict script rules for "correctedText":
                    1. If the user speaks an English word (like "medicines", "box", "car", "keys", "charger"), you MUST keep that word written in the English alphabet (Roman script). Do NOT translate it to the native language and do NOT write it phonetically in Devanagari or other native scripts.
                    2. Keep the surrounding regional language words in their proper native script (Devanagari, Tamil script, Kannada script, etc.) with flawless grammar.
                    3. Example Input: "mazi medicines box madhe ahe" -> Corrected Output: "माझी medicines box मध्ये आहे."
                    4. Identify if it is a storage event or a query question, and provide an accurate English translation of the overall meaning for backend mapping.

                    Return your response strictly as a JSON object with these exact keys:
                    {"correctedText": "clean hybrid script sentence here", "isQuery": true/false, "englishTranslation": "clear core English meaning here", "detectedLanguage": "language name"}`
                },
                { role: "user", content: rawSpokenText }
            ],
            response_format: { type: "json_object" }
        });

        const analysis = JSON.parse(grammarAndIntentAnalysis.choices[0].message.content);
        const polishedText = analysis.correctedText;
        
        console.log(`[Script Preserved Text]: ${polishedText}`);
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

            // Instruct the AI to also use mixed scripts in its final answers if appropriate
            const aiRecall = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are a premium memory retrieval assistant. Look through the user's past memories listed below. 
                        Answer the user's question accurately.
                        
                        **SCRIPT PRESIDER RULE**: Formulate your response in the exact language style of the current question.
                        - If the user uses English words mixed with an Indian language script, you must mirror that exact behavior in the answer. Keep English words written in the English alphabet, and native words written in their native script.
                        - Example style response: "तुमची medicines त्या box मध्ये ठेवली आहेत."`
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
                transcription: polishedText, // Displays the clean blended scripts on your screen
                type: "query",
                reply: finalAnswer // Displays the retrieved intelligence in matching mixed scripts
            });

        } else {
            // --- MULTI-LINGUAL LEDGER STORAGE LOOP ---
            await pool.query(
                "INSERT INTO voice_ledger (user_name, original_text, english_translation) VALUES ($1, $2, $3)",
                [userName, polishedText, analysis.englishTranslation]
            );

            return res.json({
                transcription: polishedText, // Saves and shows the perfect multi-script sentence
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