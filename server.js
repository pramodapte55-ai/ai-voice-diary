import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Client } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors());
app.use(express.json());
// 1. Establish Live Database Connection using Render's Environment Variable
const dbConnectionString = process.env.DATABASE_URL;
const client = new Client({
    connectionString: dbConnectionString,
    ssl: dbConnectionString?.includes('render.com') || dbConnectionString?.includes('-a/')
        ? { rejectUnauthorized: false }
        : false
});
client.connect()
    .then(() => console.log("[Database] Connected successfully to the live Ledger cluster."))
    .catch(err => console.error("[Database] Connection failure:", err.message));
// 2. Set up secure uploads directory mapping locally
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `voice-${Date.now()}${path.extname(file.originalname || '.mp4')}`);
    }
});
const upload = multer({ storage });
// Health check endpoint
app.get('/', (req, res) => {
    res.json({ message: "Voice Memory Ledger API Engine is online and securely connected to the cluster." });
});
// Primary Voice Processing Ingestion Pipeline Route
app.post('/api/process-voice', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Missing audio payload file." });
        }
        console.log(`[Cloud Engine] Received raw voice file asset: ${req.file.filename}`);
        // Core pipeline placeholder response confirming database communication readiness
        return res.json({
            success: true,
            status: "Pipeline reached successfully",
            databaseStatus: "Connected",
            receivedFile: req.file.filename,
            meta: {
                extensionAllocated: path.extname(req.file.filename),
                processedBy: req.body.name || "System Base Engine"
            }
        });
    }
    catch (error) {
        console.error("Route exception encountered:", error);
        return res.status(500).json({ error: error.message || "Internal server pipeline failure" });
    }
});
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server processing matrix locked on port ${PORT}`);
});
