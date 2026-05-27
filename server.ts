import express from "express";
import path from "path";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Enable CORS middleware for browser sandboxes
app.use(cors());

// Setup Vercel-safe in-memory memory storage interface
interface Memory {
  id: number;
  timestamp: string;
  category: string;
  memory: string;
}

// Define a clean, global in-memory array at the very top of the file, outside any handler functions.
let memoryLedger: Memory[] = [];
let memoriesIdCounter = 1;

try {
  // Wrap the entire initialization block in a try/catch, completely avoiding any fs or startup disk checks
  memoryLedger = [
    {
      id: memoriesIdCounter++,
      timestamp: new Date().toISOString(),
      category: "पुस्तके",
      memory: "माझी पुस्तके कपाटात ठेवली आहेत."
    },
    {
      id: memoriesIdCounter++,
      timestamp: new Date(Date.now() - 600000).toISOString(),
      category: "बँक",
      memory: "मी आज बँकेत गेलो होतो. पैशांचे व्यवहार व्यवस्थित झाले."
    }
  ];
} catch (initErr) {
  console.error("Graceful initialization handling:", initErr);
  memoryLedger = [];
}

// Setup multer for in-memory audio storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max file size
  },
});

app.use(express.json());

// Initialize Google Gemini SDK lazily, fallback dynamically per-request
const getGeminiClient = (apiKey?: string) => {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY") {
    throw new Error("Google Gemini API token not configured. Please supply a valid key in the UI headers or env variables.");
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// API Endpoint: Get the list of all logged memories
app.get("/api/memories", (req, res) => {
  try {
    const rows = [...memoryLedger].sort((a, b) => b.id - a.id);
    res.json({ success: true, memories: rows });
  } catch (error: any) {
    console.error("Memory retrieval error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Endpoint: Delete a memory by ID
app.delete("/api/memories/:id", (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const initialLength = memoryLedger.length;
    memoryLedger = memoryLedger.filter((m) => m.id !== targetId);
    if (memoryLedger.length < initialLength) {
      res.json({ success: true, message: "Memory record successfully removed." });
    } else {
      res.status(404).json({ success: false, error: "Record not found." });
    }
  } catch (error: any) {
    console.error("Memory deletion error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Endpoint: Process voice recording
app.post("/api/process-voice", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No audio payload uploaded." });
    }

    const headerOpenaiKey = req.headers["x-openai-key"] as string | undefined;
    const useOpenaiKey = (headerOpenaiKey && headerOpenaiKey.trim()) || process.env.OPENAI_API_KEY;

    // Completely bypass Gemini. Validate we have an OpenAI key before proceeding
    if (!useOpenaiKey || useOpenaiKey === "MY_OPENAI_API_KEY" || useOpenaiKey.trim() === "") {
      return res.status(400).json({ 
        success: false, 
        error: "OpenAI API key is missing. Please configure a valid OpenAI key in the credentials interface or .env file." 
      });
    }

    const audioBuffer = req.file.buffer;
    const mimeType = req.file.mimetype || "audio/webm";
    const originalName = req.file.originalname || "recording.webm";

    console.log(`Received audio upload: size=${audioBuffer.length} bytes, mimetype=${mimeType}`);

    // ==========================================
    // STEP A (The Ear): Transcription
    // ==========================================
    let transcription = "";
    let providerUsed = "OpenAI Whisper";

    try {
      console.log("Transcribing using OpenAI Whisper API (Step 1: Auto-detection with Verbose JSON)...");
      const formData1 = new FormData();
      const audioBlob1 = new Blob([audioBuffer], { type: mimeType });
      formData1.append("file", audioBlob1, originalName);
      formData1.append("model", "whisper-1");
      formData1.append("response_format", "verbose_json");

      const whisperResponse1 = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${useOpenaiKey.trim()}`,
        },
        body: formData1,
      });

      if (!whisperResponse1.ok) {
        const errMsg = await whisperResponse1.text();
        throw new Error(`Whisper API Step 1 responded with HTTP ${whisperResponse1.status}: ${errMsg}`);
      }

      const whisperData1: any = await whisperResponse1.json();
      const detectedLanguage = (whisperData1.language || "").toLowerCase();
      console.log(`OpenAI Custom Auto-Detect Pass: Language confidence resolved to: "${detectedLanguage}"`);

      // If Marathi is detected, initiate Step 2: Precision pass
      if (detectedLanguage === "marathi" || detectedLanguage === "mr") {
        console.log("Marathi validated and detected. Running Step 2: Special Marathi Precision Pass with exact language target...");
        const formData2 = new FormData();
        const audioBlob2 = new Blob([audioBuffer], { type: mimeType });
        formData2.append("file", audioBlob2, originalName);
        formData2.append("model", "whisper-1");
        formData2.append("language", "mr");
        formData2.append("prompt", "माझी पुस्तके कपाटात ठेवली आहेत. मी आज बँकेत गेलो होतो. पैशांचे व्यवहार व्यवस्थित झाले.");
        formData2.append("temperature", "0.2");

        const whisperResponse2 = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${useOpenaiKey.trim()}`,
          },
          body: formData2,
        });

        if (!whisperResponse2.ok) {
          const errMsg = await whisperResponse2.text();
          throw new Error(`Whisper API Step 2 Precision Pass responded with HTTP ${whisperResponse2.status}: ${errMsg}`);
        }

        const whisperData2: any = await whisperResponse2.json();
        transcription = whisperData2.text || "";
        providerUsed = "OpenAI Whisper (Auto-Detected Marathi Precision Pass)";
      } else {
        // Keep the initial transcription for match-other languages
        transcription = whisperData1.text || "";
        const friendlyLang = detectedLanguage ? detectedLanguage.charAt(0).toUpperCase() + detectedLanguage.slice(1) : "Auto-Detected";
        providerUsed = `OpenAI Whisper (${friendlyLang})`;
      }
    } catch (whisperError: any) {
      console.error("=================================================");
      console.error("CRITICAL WHISPER TRANSCRIBE FAILURE DETECTED:");
      console.error("ERROR MESSAGE:", whisperError?.message || whisperError);
      console.error("STACK TRACE:", whisperError?.stack || "No stack trace available");
      console.error("=================================================");
      
      return res.status(500).json({
        success: false,
        error: `Whisper transcription failed: ${whisperError.message || whisperError}`
      });
    }

    transcription = transcription.trim();
    if (!transcription) {
      return res.status(422).json({
        success: false,
        error: "Transcription is empty. Check your mic, speak clearly, and ensure your API keys have credit.",
      });
    }

    console.log(`Transcribed text via [${providerUsed}]: "${transcription}"`);

    // ==========================================
    // STEP B (The Brain): Cognitive Routing
    // ==========================================
    const systemPrompt = `You are an AI-powered voice memory ledger assistant. First, identify the language and script of the incoming transcription (e.g., English, Hindi, Marathi, Spanish, Urdu, etc.).
You must analyze the user's speech and output strictly a valid JSON object.
Crucially, ensure that the "category", "memory", and "query" values are extracted and saved in the EXACT same language and script that the user spoke. Never translate them to English.

Output format rules based on the detected intent:
- If they are stating a new fact to remember, output strictly inside JSON: {
    "action": "SAVE", 
    "category": "extracted_one_word_category_in_user_spoken_language_and_script", 
    "memory": "cleaned_fact_string_in_user_spoken_language_and_script", 
    "message": "polite_short_confirmation_message_indicating_success_written_in_user_spoken_language_and_script"
  }
  Example: If Hindi, "category" could be "पासवर्ड", and "message" could be "आपका पासवर्ड सुरक्षित रूप से सहेज लिया गया है।".
- If they are asking a question about the past or searching, output strictly inside JSON: {
    "action": "SEARCH", 
    "query": "cleaned_search_keyword_or_phrase_in_user_spoken_language_and_script"
  }`;

    console.log("Analyzing text with OpenAI brain controller (gpt-4o)...");
    const chatResponse1 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${useOpenaiKey.trim()}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this user statement or query: "${transcription}"` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      }),
    });

    if (!chatResponse1.ok) {
      const errorText = await chatResponse1.text();
      throw new Error(`OpenAI Chat Completion failed: ${chatResponse1.status} ${errorText}`);
    }

    const chatData1: any = await chatResponse1.json();
    const brainJsonText = chatData1.choices?.[0]?.message?.content?.trim() || "{}";
    console.log("OpenAI routed decision:", brainJsonText);
    
    let planData: { action: string; category?: string; memory?: string; query?: string; message?: string };
    try {
      planData = JSON.parse(brainJsonText);
    } catch (parseErr) {
      console.error("Failed to parse OpenAI decision JSON, fallback to basic SAVE", parseErr);
      planData = { action: "SAVE", category: "General", memory: transcription, message: "Saved successfully." };
    }

    // Ensure action is standard uppercase
    const action = (planData.action || "SAVE").toUpperCase();

    // ==========================================
    // STEP C (The Handler / Data Layer)
    // ==========================================
    if (action === "SAVE") {
      const category = (planData.category || "General").trim();
      const memory = (planData.memory || transcription).trim();

      console.log(`Saving new memory in-memory: category=${category}, text="${memory}"`);
      const newRecord: Memory = {
        id: memoriesIdCounter++,
        timestamp: new Date().toISOString(),
        category,
        memory,
      };
      memoryLedger.push(newRecord);

      // Extract generated multilingual confirmation message or fallback
      const finalMsg = planData.message && planData.message.trim()
        ? planData.message.trim()
        : `Memory safely logged under [${category}].`;

      return res.json({
        success: true,
        action: "SAVE",
        transcription,
        providerUsed,
        data: {
          id: newRecord.id,
          category,
          memory,
        },
        message: finalMsg,
      });
    } else {
      // SEARCH action
      const query = (planData.query || transcription).trim();
      console.log(`Executing semantic search for query keyword: "${query}"`);

      // Retrieve all records to let GPT-4o perform semantic search & inflection resolution
      const allRecords = [...memoryLedger].sort((a, b) => b.id - a.id);

      const searchPrompt = `You are an expert AI search engine for a personal voice memory ledger.
The user is asking a question: "${transcription}"
The extracted search intent/query keyword is: "${query}"

Here is the complete set of memory records retrieved from the SQLite database:
${JSON.stringify(allRecords, null, 2)}

Instructions:
1. Perform a CONCEPTUAL and SEMANTIC matching of these memory records against the user's spoken question and search query keyword.
2. Crucially, ensure you dynamically match words regardless of grammatical inflections, case variations, or language-specific suffixes in Marathi, Hindi, or English (for example, in Marathi: matching 'सेल्फोन' or 'फोन' against records containing 'सेल्फोनची', matching 'कपाट' against records containing 'कपाटात' or 'कपाटाजवळ', matching 'ड्रावर' against records containing 'ड्रावरमध्ये' etc.).
3. Filter the records list to include ONLY those records that are actually relevant or conceptually answer the user's query.
4. Formulate a natural, polite, and helpful answer for the user based strictly on the semantically matched records.
5. Write the answer/message strictly in the EXACT same language and script used by the user in their spoken question. Do NOT translate it back to English. Avoid making up any facts. Be concise and conversational, ideal for transcription delivery.
6. Return your response strictly as a valid JSON object matching the following TypeScript interface:
{
  "matchedRecords": Array<{ id: number; timestamp: string; category: string; memory: string }>;
  "message": string;
}`;

      console.log("Analyzing and matching memory records semantically using OpenAI gpt-4o...");
      const chatResponse2 = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${useOpenaiKey.trim()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "user", content: searchPrompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2
        }),
      });

      if (!chatResponse2.ok) {
        const errorText = await chatResponse2.text();
        throw new Error(`OpenAI Chat Completion (Secondary - Semantic Search) failed: ${chatResponse2.status} ${errorText}`);
      }

      const chatData2: any = await chatResponse2.json();
      const brainSearchJsonText = chatData2.choices?.[0]?.message?.content?.trim() || "{}";
      console.log("OpenAI semantic search output:", brainSearchJsonText);

      let searchResultData: { matchedRecords?: any[]; message?: string } = {};
      try {
        searchResultData = JSON.parse(brainSearchJsonText);
      } catch (parseErr) {
        console.error("Failed to parse OpenAI search JSON, fallback to manual keyword lookup.", parseErr);
        // Fallback to manual keyword filter if AI JSON fails
        const filterStr = query.toLowerCase();
        const fallbackMatched = allRecords.filter((r: any) => 
          r.memory.toLowerCase().includes(filterStr) || r.category.toLowerCase().includes(filterStr)
        );
        searchResultData = {
          matchedRecords: fallbackMatched,
          message: fallbackMatched.length > 0 
            ? `येथे काही संदर्भ सापडले आहेत जे "${query}" शी जुळतात.` 
            : `मला तुमच्या माहितीमध्ये "${query}" बद्दल काही सापडले नाही.`
        };
      }

      const matchedRecords = searchResultData.matchedRecords || [];
      const formulatedAnswer = searchResultData.message || "मला काही संदर्भ सापडले नाहीत.";

      return res.json({
        success: true,
        action: "SEARCH",
        transcription,
        providerUsed,
        query,
        matchedCount: matchedRecords.length,
        message: formulatedAnswer,
      });
    }

  } catch (error: any) {
    console.error("Error processing voice memory request:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: Transcribe using Gemini 3.5 Flash directly
async function transcribeWithGemini(ai: GoogleGenAI, audioBuffer: Buffer, mimeType: string): Promise<string> {
  try {
    const base64Data = audioBuffer.toString("base64");
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        "Transcribe this audio precisely in its original language. Avoid translating it into any other language. Return strictly the transcription in the exact script and language spoken by the user, without any introductory framing, summaries, titles, or extra comments.",
      ],
    });
    return response.text || "";
  } catch (err) {
    console.error("Gemini Native Transcription failed:", err);
    throw new Error("Failed to transcribe audio using both OpenAI Whisper and Gemini Fallback.");
  }
}

// Vite and static asset configuration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start full stack server on port 3000 if not in a serverless function environment
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Voice Memory Ledger Server listening at http://localhost:${PORT}`);
    });
  }
}

startServer().catch((err) => {
  console.error("Failed to bootstrap server:", err);
});

export default app;
