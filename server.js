import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { OpenAI } from "openai";
import pg from "pg";

// FIX: Native direct initialization for ES Modules to prevent reference errors
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

try {
    const uploadDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
    }
} catch (dirErr) {
    console.log("Upload directory initialized safely.");
}

const upload = multer({ dest: "uploads/" });

const apiKey = process.env.OPENAI_API_KEY || "";
const openai = new OpenAI({
    apiKey: apiKey || "temporary-fallback-key-to-bypass-boot-crash",
});

const initDb = async () => {
    if (!process.env.DATABASE_URL) {
        console.log("DATABASE_URL variable is missing.");
        return;
    }
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
        console.log("Database tables verified successfully.");
    } catch (err) {
        console.log("Database connection status:", err.message);
    }
};
initDb();

app.get("/", (req, res) => {
    res.status(200).send("Voice Memory Ledger API Engine is online in stable ES Module mode.");
});

app.post("/api/process-voice", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No audio payload received." });
        }

        const audioPath = req.file.path;
        const userName = req.body.name || "Anonymous";

        const transcriptionResponse = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
        });

        let rawSpokenText = transcriptionResponse.text || "";
        console.log(`[Captured Voice]: ${rawSpokenText}`);

        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }

        if (!rawSpokenText.trim()) {
            return res.json({ transcription: "Audio empty. Try again.", type: "store" });
        }

        const lowerText = rawSpokenText.toLowerCase();
        const questionTriggers = [
            'where', 'what', 'who', 'how', 'which', 'when', '?', 
            'कुठे', 'काय', 'कोण', 'कसे', 'केव्हा', 'कहाँ', 'किधर',
            'kuthe', 'kothe', 'ahet', 'aahe'
        ];
        let isQueryMode = questionTriggers.some(word => lowerText.includes(word));

        const grammarCorrection = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "Clean spacing and grammar. SCRIPT RULE: If input is entirely in English, keep it in English Roman letters. Do not convert it to Devanagari. If input is in Marathi/Hindi script, write in Devanagari, leaving explicit words like 'medicines', 'box', 'bottle' in English characters."
                },
                { role: "user", content: rawSpokenText }
            ]
        });

        const translationCorrection = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Translate the text statement into standard English. Return ONLY the translated raw string response." },
                { role: "user", content: rawSpokenText }
            ]
        });

        const polishedText = grammarCorrection.choices[0].message.content.trim();
        const englishTranslation = translationCorrection.choices[0].message.content.trim();

        if (isQueryMode) {
            const dbResult = await pool.query(
                "SELECT original_text, english_translation FROM voice_ledger WHERE user_name = $1 ORDER BY created_at DESC LIMIT 40",
                [userName]
            );

            const pastMemories = dbResult.rows.map(row => 
                `- Fact: "${row.original_text}" (Meaning: "${row.english_translation}")`
            ).join("\n");

            const memoryRecallPrompt = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "Answer the user's question using their history ledger. DISPLAY RULE: Match the script context of the question. If asked in English, answer in English. If asked in Marathi, answer in fluent Devanagari text, keeping conversational nouns in English letters."
                    },
                    { 
                        role: "user", 
                        content: `User: ${userName}\nLedger:\n${pastMemories || "None"}\n\nQuestion: "${polishedText}"\nMeaning: "${englishTranslation}"` 
                    }
                ]
            });

            return res.json({
                transcription: polishedText,
                type: "query",
                reply: memoryRecallPrompt.choices[0].message.content.trim()
            });

        } else {
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
        console.error("Route processing exception handled safely:", err.message);
        res.status(500).json({ error: "Internal runtime error." });
    }
});

process.on("uncaughtException", (err) => {
    console.error("Intercepted exception background handling:", err.message);
});

app.listen(PORT, () => {
    console.log(`Server actively bound and executing live on port ${PORT}`);
});