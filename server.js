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
        console.log("Database initialized successfully.");
    } catch (err) {
        console.error("Database connection failure:", err);
    }
};
initDb();

app.get("/", (req, res) => {
    res.status(200).send("API Engine Active and Listening.");
});

app.post("/api/process-voice", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No audio file payload received." });
        }

        const audioPath = req.file.path;
        const userName = req.body.name || "Anonymous";

        // Step A: Capture transcription cleanly
        const transcriptionResponse = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
        });

        let rawSpokenText = transcriptionResponse.text || "";
        console.log(`[Raw Audio Captured]: ${rawSpokenText}`);

        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }

        if (!rawSpokenText.trim()) {
            return res.json({ transcription: "Audio unclear, please repeat.", type: "store" });
        }

        // Step B: Robust String Fallback Intent Detection
        // If the spoken audio matches any core question markers, force query lookup immediately
        const lowerText = rawSpokenText.toLowerCase();
        const questionWords = [
            'where', 'what', 'who', 'how', 'which', 'when', '?', 
            'कुठे', 'काय', 'कोण', 'कसे', 'केव्हा', 'कहाँ', 'किधर',
            'kuthe', 'kothe', 'ahet', 'aahe', 'elley', 'ellide'
        ];
        
        let isQuery = questionWords.some(word => lowerText.includes(word));

        // Step C: Streamlined AI Processing (No Complex Variable Script Rules)
        const textAnalysis = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a linguistic sanitizer for a private voice diary ledger.
                    Your objective is to review the raw phrase provided and return a clean, grammatically polished version.
                    
                    STRICT SCRIPT DIRECTIVES:
                    1. If the sentence is spoken in English, preserve it ENTIRELY in the English alphabet (Roman script). Do not translate or change it to Devanagari characters.
                    2. If spoken in Marathi or mixed Hindi/Marathi, output it in clean, grammatically perfect Devanagari script, leaving explicit English nouns (like medicines, box, charger, bottle) in the English alphabet.
                    3. Provide a clear English translation translation string for back-end uniformity.`
                },
                { role: "user", content: rawSpokenText }
            ]
        });

        const cleanedTranslationPayload = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Translate the user's input phrase accurately into plain English text summary. Return ONLY the raw translated text string." },
                { role: "user", content: rawSpokenText }
            ]
        });

        const polishedText = textAnalysis.choices[0].message.content.trim();
        const englishTranslation = cleanedTranslationPayload.choices[0].message.content.trim();

        console.log(`[Routed Script]: Polished="${polishedText}" | QueryMode=${isQuery}`);

        if (isQuery) {
            // --- DATA RECALL HANDLER ---
            const dbResult = await pool.query(
                "SELECT original_text, english_translation FROM voice_ledger WHERE user_name = $1 ORDER BY created_at DESC LIMIT 40",
                [userName]
            );

            const pastMemories = dbResult.rows.map(row => 
                `- Stored Fact: "${row.original_text}" (English Concept: "${row.english_translation}")`
            ).join("\n");

            const aiRecall = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are a memory retrieval ledger assistant. Search the user's logged facts to answer their question.
                        
                        CRITICAL DISPLAY REQUIREMENT:
                        - Formulate your answer in the EXACT language script style used in the question.
                        - If the question is in pure English, answer in plain English.
                        - If the question contains Marathi or a mixed code-switch style, answer in proper Devanagari text, maintaining conversational English words in the Roman alphabet.`
                    },
                    { 
                        role: "user", 
                        content: `User Profile: ${userName}\nHistorical Records Ledger:\n${pastMemories || "No entries logged."}\n\nCurrent Question: "${polishedText}"\nEnglish Meaning: "${englishTranslation}"` 
                    }
                ]
            });

            const finalAnswer = aiRecall.choices[0].message.content.trim();

            return res.json({
                transcription: polishedText,
                type: "query",
                reply: finalAnswer
            });

        } else {
            // --- DATA STORAGE HANDLER ---
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
        console.error("Pipeline Exception Caught:", error);
        res.status(500).json({ error: "Internal architecture processing timeout." });
    }
});

app.listen(PORT, () => {
    console.log(`Execution active on port ${PORT}`);
});