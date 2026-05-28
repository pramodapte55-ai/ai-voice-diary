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
            prompt: "माझी medicines कुठे आहेत? माझे जेवण table वर आहे. Where are my keys? கார் சாவி எங்கே? ನನ್ನ ಮೆಡಿಸಿನ್ ಎಲ್ಲಿದೆ?",
        });

        let rawSpokenText = transcriptionResponse.text;
        console.log(`[Whisper Raw Capture]: ${rawSpokenText}`);

        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }

        // ==========================================
        // CRITICAL STEP B: ULTIMATE AI INTENT GATEKEEPER
        // Before parsing grammar or scripts, we force a high-accuracy check for questions.
        // ==========================================
        const intentCheck = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an absolute intent gatekeeper for a voice memory app. 
                    Analyze the user's input (which might be garbled, written in Hinglish, Marathingli, or native script).
                    Determine if the user is asking a question to find/retrieve something, or if they are just stating a fact to store.
                    
                    CRITICAL RULES:
                    - If the text contains any questioning context like "where is", "kuthe", "kothe", "ahet", "aahe", "find", "எங்கே", "ಎಲ್ಲಿದೆ", or sounds like a question, you MUST return true.
                    - Respond ONLY with a clean JSON object containing the boolean key "isQuery".`
                },
                { role: "user", content: rawSpokenText }
            ],
            response_format: { type: "json_object" }
        });

        const intentResult = JSON.parse(intentCheck.choices[0].message.content);
        const isQueryFlag = intentResult.isQuery;
        console.log(`[AI Intent Gatekeeper Decision]: isQuery = ${isQueryFlag}`);
        // ==========================================

        // Step C: Detailed Grammar Cleaning & Script Restoration
        const grammarAnalysis = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an expert multi-lingual editor. Clean the text up.
                    
                    CRITICAL SCRIPT RULES:
                    1. Keep explicit English nouns (e.g., "medicines", "box", "charger", "keys") strictly in the English alphabet (Roman letters). Do NOT write them in Devanagari or other regional scripts.
                    2. Convert all surrounding text into pristine, grammatically accurate native script (Devanagari for Marathi/Hindi, Tamil script for Tamil, etc.). Fix all spelling issues.
                    3. Provide a clear, structural English translation for uniform backend lookup.

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

        if (isQueryFlag) {
            // --- CROSS-LANGUAGE RETRIEVAL ENGINE ---
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
                        
                        **STRICT SCRIPT RULE**: Formulate the response in the exact same language style as the question.
                        - If the question contains English words mixed with an Indian language (e.g., "माझी medicines कुठे आहेत?"), reply using that exact same natural blend (e.g., "तुमची medicines त्या box मध्ये आहेत."). 
                        - Keep English words in the English alphabet, and native words in their native script (Devanagari, Tamil, etc.). Fix all grammar.`
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
            // --- LEDGER STORAGE ENGINE ---
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