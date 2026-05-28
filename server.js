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
        console.log(`[Whisper Raw]: ${rawSpokenText}`);

        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }

        // Step B: AI Clean-up and Translation
        const grammarAndIntentAnalysis = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an expert multi-lingual voice ledger editor.
                    Fix the raw transcription into high-quality grammar. 
                    
                    CRITICAL SCRIPT RULES:
                    1. Keep explicit English words (e.g., "medicines", "box", "charger", "keys") strictly in the English alphabet (Roman script). Do NOT phonetically write them in Devanagari, Tamil, or Kannada script.
                    2. Convert the rest of the sentence into beautiful, correct native script (Devanagari for Marathi/Hindi, Tamil script for Tamil, etc.).
                    3. Determine if it is a question (isQuery: true) or a statement (isQuery: false).
                    4. Provide a flawless English translation.

                    Return ONLY JSON with these exact keys:
                    {"correctedText": "text here", "isQuery": true/false, "englishTranslation": "text here", "detectedLanguage": "language name"}`
                },
                { role: "user", content: rawSpokenText }
            ],
            response_format: { type: "json_object" }
        });

        const analysis = JSON.parse(grammarAndIntentAnalysis.choices[0].message.content);
        
        let polishedText = analysis.correctedText;
        let isQueryFlag = analysis.isQuery;
        let englishTranslation = analysis.englishTranslation;

        // ==========================================
        // HARDCODED STEVE JOBS FAILSAFE OVERRIDE TRACK
        // If the AI or Whisper makes a mistake, this hard logic catches it instantly!
        // ==========================================
        const lowerRaw = rawSpokenText.toLowerCase();
        const lowerPolished = polishedText.toLowerCase();
        
        // Comprehensive list of question triggers across English, Marathi, Hindi, Tamil, Kannada
        const questionTriggers = [
            'कुठे', 'आहेत', 'आहे', 'काय', 'kuthe', 'kotheu', 'ahet', 'aahe', 
            'where', 'what', 'where is', 'எங்கே', 'எங்க', 'எது', 'எல்லಿದೆ', 'ಯಲ್ಲಿದೆ',
            'ಕಹಾನ್', 'कहाँ', 'किधर', 'किकडे'
        ];

        const containsQuestionWord = questionTriggers.some(word => 
            lowerRaw.includes(word) || lowerPolished.includes(word)
        );

        if (containsQuestionWord) {
            console.log("[FAILSAFE TRIGGERED]: Forced intent routing to QUERY/RECALL due to keyword match.");
            isQueryFlag = true;
        }
        // ==========================================

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
                        content: `You are a memory retrieval assistant. Look through the user's past memories. Answer their question accurately.
                        
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