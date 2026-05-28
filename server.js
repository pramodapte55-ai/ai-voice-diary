const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { OpenAI } = require("openai");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

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
        console.log("Database initialized.");
    } catch (err) {
        console.error("Database failed:", err);
    }
};
initDb();

app.get("/", (req, res) => {
    res.status(200).send("API Engine Active.");
});

app.post("/api/process-voice", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No audio received." });
        }

        const audioPath = req.file.path;
        const userName = req.body.name || "Anonymous";

        // Step A: Capture transcription
        const transcriptionResponse = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
            prompt: "माझी medicines कुठे आहेत? माझे जेवण table वर आहे. Where are my clothes? My bottle is here.",
        });

        let rawSpokenText = transcriptionResponse.text;
        console.log(`[Whisper Raw Capture]: ${rawSpokenText}`);

        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }

        // ==========================================
        // STEP B: CORE AI INTENT GATEKEEPER
        // ==========================================
        const intentCheck = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an intent gatekeeper for a voice memory ledger app. 
                    Analyze the text input. Determine if the user is asking a question to FIND/RETRIEVE something, or if they are just stating a fact to store.
                    
                    CRITICAL: If the sentence asks "where is", "where are", "कुठे", "kuthe", "kothe", "ahet", "aahe", "find", or has a question mark, you MUST flag it as a query.
                    Respond ONLY with a JSON object containing the boolean key "isQuery".`
                },
                { role: "user", content: rawSpokenText }
            ],
            response_format: { type: "json_object" }
        });

        const intentResult = JSON.parse(intentCheck.choices[0].message.content);
        const isQueryFlag = intentResult.isQuery;
        console.log(`[AI Intent Gatekeeper]: isQuery = ${isQueryFlag}`);

        // ==========================================
        // STEP C: GRAMMAR SCRIPT PRESERVATION ENGINE
        // ==========================================
        const grammarAnalysis = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an expert multi-lingual editor. Clean the text up into flawless grammar based on these strict script rules:
                    
                    1. PURE ENGLISH RULE: If the user spoke entirely in English (e.g., "My clothes are in the cupboard" or "where is my bottle"), you MUST keep the output entirely in the English alphabet (Roman script). Do NOT convert English words into Devanagari script.
                    2. MIXED LANGUAGE RULE: If the user speaks a mix of an Indian language and English words (e.g., "माझी medicines कुठे आहेत?"), keep the English nouns in English alphabet letters, and keep the surrounding native words in their true native script (Devanagari, Tamil, etc.).
                    3. PURE REGIONAL RULE: If they speak completely in Marathi/Hindi, use pure, beautiful Devanagari script characters.
                    4. Provide a clear, standard English translation for backend lookup data uniformization.

                    Return ONLY JSON with these exact keys:
                    {"correctedText": "text here", "englishTranslation": "text here", "detectedLanguage": "language name"}`
                },
                { role: "user", content: rawSpokenText }
            ],
            response_format: { type: "json_object" }
        });

        const analysis = JSON.parse(grammarAnalysis.choices[0].message.content);
        let polishedText = analysis.correctedText;
        let englishTranslation = analysis.englishTranslation;

        console.log(`[Polished Text Output]: ${polishedText}`);

        if (isQueryFlag) {
            // --- RECALL LOOP ---
            const dbResult = await pool.query(
                "SELECT original_text, english_translation FROM voice_ledger WHERE user_name = $1 ORDER BY created_at DESC LIMIT 50",
                [userName]
            );

            const pastMemories = dbResult.rows.map(row => 
                `- Stored Memory: "${row.original_text}" (English Meaning: "${row.english_translation}")`
            ).join("\n");

            const aiRecall = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are a premium memory retrieval assistant. Look through the user's past memories and answer their question accurately.
                        
                        **SCRIPT RULE**: Formulate the response in the exact same language style as the question.
                        - If the question is asked in pure English, reply in pure English.
                        - If the question is a blend of Marathi and English, reply using that same natural spoken blend, keeping English words in English letters.`
                    },
                    { 
                        role: "user", 
                        content: `User: ${userName}\nPast Records:\n${pastMemories || "None"}\n\nQuestion: "${polishedText}"\nEnglish Meaning: "${englishTranslation}"` 
                    }
                ]
            });

            const finalAnswer = aiRecall.choices[0].message.content;

            return res.json({
                transcription: polishedText,
                type: "query",
                reply: finalAnswer
            });

        } else {
            // --- STORAGE LOOP ---
            await pool.query(
                "INSERT INTO voice_ledger (user_name, original_text, english_translation) VALUES ($1, $2, $3)",
                [userName, polishedText, englishTranslation]
            );

            return res.json({
                transcription: polishedText, 
                type: "store"
            });
        }

    } catch (error) {
        console.error("Crash caught:", error);
        res.status(500).json({ error: "Processing error." });
    }
});

app.listen(PORT, () => {
    console.log(`Live on port ${PORT}`);
});