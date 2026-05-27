import express from "express";
import path from "path";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS middleware for browser sandboxes
app.use(cors());

// Global in-memory data store for safe serverless runtime
// Store is localized by userId: { [userId]: [ ...memories ] }
const memoryStore = {};
let memoriesIdCounter = 1;

// Helper to get or initialize user memories with an isolated array
function getUserMemories(userId) {
  const normId = (userId || "default").trim().toLowerCase();
  if (!memoryStore[normId]) {
    memoryStore[normId] = [];
  }
  return memoryStore[normId];
}

// Get user ID from incoming request headers
function getUserIdFromRequest(req) {
  const rawId = req.headers["x-user-id"];
  return (rawId || "default").trim();
}

// Setup multer for in-memory audio storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max
  },
});

app.use(express.json());

// Direct native REST API helper for Google Gemini 2.5 Flash
async function callGeminiREST(prompt, systemInstruction, apiKey) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY" || key.trim() === "") {
    throw new Error("Google Gemini API token not configured. Please supply a valid key.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key.trim()}`;
  
  const body = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [
        {
          text: systemInstruction
        }
      ]
    };
  }

  console.log("Calling Google Gemini 2.5 Flash REST API directly with native fetch...");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini REST API responded with HTTP status ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini REST API returned an empty or invalid response candidate.");
  }

  return text.trim();
}

async function callOpenaiBrain(transcription, systemPrompt, apiKey) {
  const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
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

  if (!chatResponse.ok) {
    const errorText = await chatResponse.text();
    throw new Error(`OpenAI Chat Completion failed: ${chatResponse.status} ${errorText}`);
  }

  const chatData = await chatResponse.json();
  return chatData.choices?.[0]?.message?.content?.trim() || "{}";
}

async function callOpenaiSearch(searchPrompt, apiKey) {
  const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
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

  if (!chatResponse.ok) {
    const errorText = await chatResponse.text();
    throw new Error(`OpenAI Chat (Semantic Search Matching) failed: ${chatResponse.status} ${errorText}`);
  }

  const chatData = await chatResponse.json();
  return chatData.choices?.[0]?.message?.content?.trim() || "{}";
}

// Helper: Transcribe using Gemini 2.5 Flash REST API directly
async function transcribeWithGemini(audioBuffer, mimeType, apiKey) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY" || key.trim() === "") {
    throw new Error("Gemini API key is missing.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key.trim()}`;
  const base64Data = audioBuffer.toString("base64");

  const body = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          },
          {
            text: "Transcribe this audio precisely in its original language. Avoid translating it into any other language. Return strictly the transcription in the exact script and language spoken by the user, without any introductory framing, summaries, titles, or extra comments."
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini Transcribe REST API status ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text?.trim() || "";
}

// API Endpoint: Get the list of all logged memories
app.get("/api/memories", (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const userMemories = getUserMemories(userId);
    const rows = [...userMemories].sort((a, b) => b.id - a.id);
    res.json({ success: true, memories: rows });
  } catch (error) {
    console.error("Memory retrieval error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Endpoint: Delete a memory by ID
app.delete("/api/memories/:id", (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const normId = userId.trim().toLowerCase();
    const userMemories = getUserMemories(userId);

    const targetId = parseInt(req.params.id, 10);
    const initialLength = userMemories.length;
    const filtered = userMemories.filter((m) => m.id !== targetId);

    if (filtered.length < initialLength) {
      memoryStore[normId] = filtered;
      res.json({ success: true, message: "Memory record successfully removed." });
    } else {
      res.status(404).json({ success: false, error: "Record not found." });
    }
  } catch (error) {
    console.error("Memory deletion error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API Endpoint: Process voice recording
app.post("/api/process-voice", upload.single("audio"), async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No audio payload uploaded." });
    }

    const headerOpenaiKey = req.headers["x-openai-key"];
    const useOpenaiKey = (headerOpenaiKey && headerOpenaiKey.trim()) || process.env.OPENAI_API_KEY;

    const headerGeminiKey = req.headers["x-gemini-key"];
    const useGeminiKey = (headerGeminiKey && headerGeminiKey.trim()) || process.env.GEMINI_API_KEY;

    const hasOpenai = !!(useOpenaiKey && useOpenaiKey !== "MY_OPENAI_API_KEY" && useOpenaiKey.trim() !== "");
    const hasGemini = !!(useGeminiKey && useGeminiKey !== "MY_GEMINI_API_KEY" && useGeminiKey.trim() !== "");

    if (!hasOpenai && !hasGemini) {
      return res.status(400).json({ 
        success: false, 
        error: "Sufficient API keys are missing. Please configure a valid OpenAI key or Google Gemini key in the credentials interface or .env file." 
      });
    }

    const audioBuffer = req.file.buffer;
    const mimeType = req.file.mimetype || "audio/webm";
    const originalName = req.file.originalname || "recording.webm";

    console.log(`Received audio upload: size=${audioBuffer.length} bytes, mimetype=${mimeType}`);

    // Transcription Step
    let transcription = "";
    let providerUsed = "OpenAI Whisper";

    if (hasOpenai) {
      try {
        console.log("Transcribing using OpenAI Whisper API (Step 1)...");
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

        const whisperData1 = await whisperResponse1.json();
        const detectedLanguage = (whisperData1.language || "").toLowerCase();
        console.log(`OpenAI Custom Auto-Detect Pass: Language resolved to: "${detectedLanguage}"`);

        if (detectedLanguage === "marathi" || detectedLanguage === "mr") {
          console.log("Marathi validated. Running Step 2: Special Marathi Precision Pass...");
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

          const whisperData2 = await whisperResponse2.json();
          transcription = whisperData2.text || "";
          providerUsed = "OpenAI Whisper (Auto-Detected Marathi Precision Pass)";
        } else {
          transcription = whisperData1.text || "";
          const friendlyLang = detectedLanguage ? detectedLanguage.charAt(0).toUpperCase() + detectedLanguage.slice(1) : "Auto-Detected";
          providerUsed = `OpenAI Whisper (${friendlyLang})`;
        }
      } catch (whisperError) {
        console.warn("Whisper transcribe failed, trying Gemini native transcription fallback...", whisperError.message);
        if (hasGemini) {
          transcription = await transcribeWithGemini(audioBuffer, mimeType, useGeminiKey);
          providerUsed = "Google Gemini REST Fallback";
        } else {
          return res.status(500).json({
            success: false,
            error: `Whisper transcription failed: ${whisperError.message || whisperError}`
          });
        }
      }
    } else {
      try {
        console.log("Transcribing using native Gemini REST transcription...");
        transcription = await transcribeWithGemini(audioBuffer, mimeType, useGeminiKey);
        providerUsed = "Google Gemini REST";
      } catch (geminiError) {
        return res.status(500).json({
          success: false,
          error: `Gemini transcription failed: ${geminiError.message || geminiError}`
        });
      }
    }

    transcription = transcription.trim();
    if (!transcription) {
      return res.status(422).json({
        success: false,
        error: "Transcription is empty. Check your mic, speak clearly, and ensure your API keys have credit.",
      });
    }

    console.log(`Transcribed text via [${providerUsed}]: "${transcription}"`);

    // Cognitive Routing
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
- If they are asking a question about the past or searching, output strictly inside JSON: {
    "action": "SEARCH", 
    "query": "cleaned_search_keyword_or_phrase_in_user_spoken_language_and_script"
  }`;

    let brainJsonText = "";
    if (hasGemini) {
      try {
        console.log("Analyzing text with Gemini brain controller (REST - gemini-2.5-flash)...");
        brainJsonText = await callGeminiREST(
          `Analyze this user statement or query: "${transcription}"`,
          systemPrompt,
          useGeminiKey
        );
      } catch (geminiBrainErr) {
        console.warn("Gemini REST brain controller failed, falling back to OpenAI GPT-4o...", geminiBrainErr);
        if (hasOpenai) {
          brainJsonText = await callOpenaiBrain(transcription, systemPrompt, useOpenaiKey);
        } else {
          throw geminiBrainErr;
        }
      }
    } else {
      console.log("Analyzing text with OpenAI brain controller (gpt-4o)...");
      brainJsonText = await callOpenaiBrain(transcription, systemPrompt, useOpenaiKey);
    }
    
    let planData;
    try {
      planData = JSON.parse(brainJsonText);
    } catch (parseErr) {
      console.error("Failed to parse brain decision JSON, fallback to basic SAVE", parseErr);
      planData = { action: "SAVE", category: "General", memory: transcription, message: "Saved successfully." };
    }

    const action = (planData.action || "SAVE").toUpperCase();

    if (action === "SAVE") {
      const category = (planData.category || "General").trim();
      const memory = (planData.memory || transcription).trim();

      console.log(`Saving new memory for user=${userId}: category=${category}, text="${memory}"`);
      const newRecord = {
        id: memoriesIdCounter++,
        timestamp: new Date().toISOString(),
        category,
        memory,
      };

      const userMemories = getUserMemories(userId);
      userMemories.push(newRecord);

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
      console.log(`Executing semantic search for user=${userId}: "${query}"`);

      const userMemories = getUserMemories(userId);
      const allRecords = [...userMemories].sort((a, b) => b.id - a.id);

      const searchPrompt = `You are an expert AI search engine for a personal voice memory ledger.
The user is asking a question: "${transcription}"
The extracted search intent/query keyword is: "${query}"

Here is the complete set of memory records retrieved from the database:
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

      let brainSearchJsonText = "";
      if (hasGemini) {
        try {
          console.log("Analyzing and matching memory records semantically using Gemini REST...");
          brainSearchJsonText = await callGeminiREST(
            searchPrompt,
            undefined,
            useGeminiKey
          );
        } catch (geminiSearchErr) {
          console.warn("Gemini REST search matching failed, falling back to OpenAI GPT-4o...", geminiSearchErr);
          if (hasOpenai) {
            brainSearchJsonText = await callOpenaiSearch(searchPrompt, useOpenaiKey);
          } else {
            throw geminiSearchErr;
          }
        }
      } else {
        console.log("Analyzing and matching memory records semantically using OpenAI gpt-4o...");
        brainSearchJsonText = await callOpenaiSearch(searchPrompt, useOpenaiKey);
      }

      let searchResultData = {};
      try {
        searchResultData = JSON.parse(brainSearchJsonText);
      } catch (parseErr) {
        console.error("Failed to parse search JSON, fallback to manual keyword lookup.", parseErr);
        const filterStr = query.toLowerCase();
        const fallbackMatched = allRecords.filter((r) => 
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

  } catch (error) {
    console.error("Error processing voice memory request:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve frontend using Vite in development or statically in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Voice Memory Ledger Server listening at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to bootstrap server:", err);
});

export default app;
