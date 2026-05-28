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

// 4. CORE ENGINE: Process Voice Audio Stream with Robust Intent Matching
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

        // Step B: BULLETPROOF LINGUISTIC SANITIZER & INTENT DETECTOR
        const grammarAndIntentAnalysis = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an expert multi-lingual editor and intent interpreter for a voice ledger. 
                    The user speaks a mix of regional Indian languages (like Marathi, Tamil, Kannada, Hindi) and English words.
                    Sometimes the microphone transcription returns garbled text or spells native words using Roman letters (e.g. "mazi ushady kotheu ahe").

                    Your job is to fix it completely based on these strict guidelines:
                    1. **Script Restoration**: If the user spoke in an Indian language but it got written in English alphabets, you MUST translate/rewrite it into its proper native script (e.g., "mazi ushady kotheu ahe" must become "माझी औषधे कुठे आहेत?").
                    2. **English Noun Preservation**: If an explicit English word is spoken (like "medicines", "box", "car", "charger"), keep that word written in clean English letters (Roman alphabet). Do not write it phonetically in Devanagari.
                    3. **Intent Detection**: Carefully analyze if the user is asking a question or trying to search their memory. Look out for question words across languages ("where", "what", "कुठे", "काये", "कहाँ", "kuthe", "kotheu"). If it is a question, "isQuery" MUST be true.
                    4. **Meaning Extraction**: Provide a clear, perfectly accurate English translation of the core meaning for back-end database matching.

                    Return your response strictly as a JSON object with these exact keys:
                    {"correctedText": "flawless native script with english words preserved", "isQuery": true/false, "englishTranslation": "clear core English meaning here", "detectedLanguage": "language name"}`
                },
                { role: "user", content: rawSpokenText }
            ],
            response_format: { type: "json_object" }
        });

        const analysis = JSON.parse(grammarAndIntentAnalysis.choices[0].message.content);
        const polishedText = analysis.correctedText;
        
        console.log(`[Sanitized Text]: ${polishedText}`);
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

            // Direct the LLM to process cross-language matching and output elegant, matching native text
            const aiRecall = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are a premium memory retrieval assistant. Look through the user's past memories listed below. 
                        Answer the user's question accurately based on the contextual meaning of their records.
                        
                        **SYSTEM RULE**: Formulate your final response to the user in the EXACT language style they used to ask the question.
                        - If they ask in Marathi or a Marathi-English blend, answer them in beautiful, grammatically correct Devanagari script, keeping any native English nouns (like medicines, box) in the English alphabet.
                        - Match the language of the query perfectly, regardless of what language the original memories were recorded in.`
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
                transcription: polishedText, // Displays clean script on screen
                type: "query",
                reply: finalAnswer // Displays answer in perfect matching language script
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