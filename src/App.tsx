import React, { useState, useEffect, useRef } from "react";
import { 
  Mic, 
  Square, 
  Loader2, 
  Database, 
  Trash2, 
  Sparkles, 
  Info, 
  Clock, 
  Search, 
  Bookmark, 
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Terminal,
  KeyRound,
  Sliders
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Memory {
  id: number;
  timestamp: string;
  category: string;
  memory: string;
}

interface SystemResponse {
  success: boolean;
  action: "SAVE" | "SEARCH";
  transcription: string;
  providerUsed: string;
  category?: string;
  memory?: string;
  query?: string;
  message: string;
  matchedCount?: number;
}

// @ts-ignore
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "";

export default function App() {
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "processing">("idle");
  const [systemResponse, setSystemResponse] = useState<SystemResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isFetchingMemories, setIsFetchingMemories] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // User Profile multi-tenancy identification key
  const [userId, setUserId] = useState(() => localStorage.getItem("voice_ledger_user_id") || "");
  const [isEditingName, setIsEditingName] = useState(() => !localStorage.getItem("voice_ledger_user_id"));
  const [tempName, setTempName] = useState(() => localStorage.getItem("voice_ledger_user_id") || "");

  // API Key local persistence states
  const [openAiKey, setOpenAiKey] = useState(() => localStorage.getItem("voice_ledger_openai_key") || "");
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem("voice_ledger_gemini_key") || "");
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showApiKeysSetting, setShowApiKeysSetting] = useState(false);

  // Status logs console terminal states
  const [statusLogs, setStatusLogs] = useState<string[]>([]);
  
  // Mobile UI Tab selection state (for low-height responsive scaling)
  const [activeMobileTab, setActiveMobileTab] = useState<"insights" | "ledger">("insights");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<any>(null);
  const logTerminalEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll log console terminal to bottom on change
  useEffect(() => {
    if (logTerminalEndRef.current) {
      logTerminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [statusLogs]);

  // Logging utility helper
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setStatusLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tempName.trim();
    if (!clean) {
      alert("Please provide a valid session profile ID.");
      return;
    }
    setUserId(clean);
    localStorage.setItem("voice_ledger_user_id", clean);
    setIsEditingName(false);
    addLog(`Status: Connected to isolated sandbox profile "[${clean}]"`);
  };

  const clearSessionProfile = () => {
    localStorage.removeItem("voice_ledger_user_id");
    setUserId("");
    setTempName("");
    setIsEditingName(true);
    addLog("Status: Logged out from current session profile.");
  };

  const handleOpenAiKeyChange = (val: string) => {
    setOpenAiKey(val);
    localStorage.setItem("voice_ledger_openai_key", val);
  };

  const handleGeminiKeyChange = (val: string) => {
    setGeminiKey(val);
    localStorage.setItem("voice_ledger_gemini_key", val);
  };

  const clearLogsConsole = () => {
    setStatusLogs([]);
  };

  // Fetch SQLite memory ledger list based on current active user
  const fetchMemories = async () => {
    if (!userId.trim()) return;
    setIsFetchingMemories(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/memories`, {
        headers: {
          "x-user-id": userId.trim()
        }
      });
      const resText = await res.text();
      let data: any;
      try {
        data = JSON.parse(resText);
      } catch (parseErr) {
        if (resText.includes("<html") || resText.includes("<!DOCTYPE")) {
          const cleanText = resText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          throw new Error(`Server HTML error: ${cleanText.substring(0, 150)}`);
        }
        throw new Error(`Invalid format returned: ${resText.substring(0, 150)}`);
      }
      if (data.success) {
        setMemories(data.memories);
      }
    } catch (err) {
      console.error("Failed to load memory ledger:", err);
    } finally {
      setIsFetchingMemories(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchMemories();
    }
  }, [userId]);

  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, []);

  // Format Unix seconds to readable mm:ss format
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Begin capturing native microphone stream
  const startRecording = async () => {
    if (!userId.trim()) {
      setErrorMessage("Please set a valid session profile at the top first.");
      return;
    }
    setErrorMessage(null);
    setSystemResponse(null);
    audioChunksRef.current = [];
    setRecordingDuration(0);
    
    addLog(`Status: Recording session for [${userId}] active! Speak clearly into the microphone.`);

    try {
      // Capture mono stream to reduce initial recording overhead
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { channelCount: 1 } 
      });
      
      // Select browser standard supported container format with low bitrate compression
      let options: any = {};
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        options = { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 24000 };
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        options = { mimeType: "audio/webm", audioBitsPerSecond: 24000 };
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        options = { mimeType: "audio/ogg;codecs=opus", audioBitsPerSecond: 24000 };
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        options = { mimeType: "audio/mp4", audioBitsPerSecond: 24000 };
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        addLog("Status: Speech capture completed. Processing audio tracks...");
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: recorder.mimeType || "audio/webm" 
        });
        await uploadAndProcessAudio(audioBlob);
        
        // Disable tracks to preserve microphone privacy indicator light
        stream.getTracks().forEach((track) => track.stop());
      };

      // Launch recorder
      recorder.start(250);
      setRecordingState("recording");

      // Set up recording time counter
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error("Mic Capture Error:", err);
      const captureErrorMsg = "Microphone capture aborted. Check browser security settings in your URL domain lock.";
      setErrorMessage(captureErrorMsg);
      addLog(`Status: Mic Error - ${captureErrorMsg}`);
      setRecordingState("idle");
    }
  };

  // Cease recording and trigger the stop callback (which fires the AI pipeline)
  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState === "recording") {
      addLog("Status: Finalizing speech payload. Sending buffers...");
      mediaRecorderRef.current.stop();
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    }
  };

  // Transmit raw audio data blob to backend Express REST controller
  const uploadAndProcessAudio = async (audioBlob: Blob) => {
    setRecordingState("processing");
    addLog("Status: Uploading audio buffer payload to cloud engine endpoint /api/process-voice...");
    
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      // Set dynamic header configurations
      const headers: Record<string, string> = {
        "x-user-id": userId.trim() || "default"
      };
      if (openAiKey.trim()) {
        headers["x-openai-key"] = openAiKey.trim();
      }
      if (geminiKey.trim()) {
        headers["x-gemini-key"] = geminiKey.trim();
      }

      const response = await fetch(`${API_BASE_URL}/api/process-voice`, {
        method: "POST",
        headers,
        body: formData,
      });

      const responseText = await response.text();
      let result: any;
      try {
        result = JSON.parse(responseText);
      } catch (parseErr) {
        if (responseText.includes("<html") || responseText.includes("<!DOCTYPE")) {
          const cleanText = responseText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          const displayError = cleanText.substring(0, 150) || "Received HTML page from server instead of JSON.";
          throw new Error(`Server returned HTML error page (timeout or quota lock): ${displayError}`);
        } else {
          throw new Error(`Server responded with non-JSON format: ${responseText.substring(0, 150)}`);
        }
      }

      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Voice parsing cognitive pipeline failed.");
      }

      // Add dynamic terminal feedback based on returned backend transaction properties
      addLog(`Status: Resolved transcription: "${result.transcription}"`);
      addLog(`Status: Cognitive routing active. Target action: ${result.action}`);

      if (result.action === "SAVE") {
        addLog(`Status: Memory persisted under category "[${result.category}]" successfully.`);
      } else if (result.action === "SEARCH") {
        addLog(`Status: Search resolved. Found ${result.matchedCount || 0} relational records.`);
      }

      setSystemResponse(result);
      
      // Auto toggle to insights tab so the user sees the cognitive outputs instantly on mobile
      setActiveMobileTab("insights");
      
      // Instantly synchronize UI sqlite table logs
      fetchMemories();
    } catch (err: any) {
      console.error("Upload failure:", err);
      const errTxt = err.message || "An unexpected error occurred during transcription.";
      setErrorMessage(errTxt);
      addLog(`Status: Cognitive Pipeline Error - ${errTxt}`);
      setRecordingState("idle");
    } finally {
      setRecordingState("idle");
    }
  };

  // Delete an individual memory row
  const deleteMemory = async (id: number) => {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/memories/${id}`, { 
        method: "DELETE",
        headers: {
          "x-user-id": userId.trim() || "default"
        }
      });
      const respText = await resp.text();
      let data: any;
      try {
        data = JSON.parse(respText);
      } catch (pe) {
        if (respText.includes("<html") || respText.includes("<!DOCTYPE")) {
          const cleanText = respText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
          throw new Error(`Server HTML error: ${cleanText.substring(0, 150)}`);
        }
        throw new Error(`Invalid format returned: ${respText.substring(0, 150)}`);
      }
      if (data.success) {
        addLog(`Status: Successfully deleted entry ID [${id}] from SQLite registry files.`);
        setMemories((prev) => prev.filter((m) => m.id !== id));
      } else {
        alert(data.error || "Could not delete record.");
      }
    } catch (err: any) {
      console.error("Delete call aborted:", err);
      alert(err.message || "An unexpected error occurred during record deletion.");
    }
  };

  return (return (
  <div className="fixed inset-0 bg-white flex flex-col justify-between p-6 overflow-hidden select-none">
    
    {/* TOP: Crisp, Minimal Name Input Box */}
    <div className="w-full max-w-md mx-auto pt-4">
      <input 
        type="text" 
        placeholder="Enter your name..." 
        className="w-full p-3 border border-gray-200 rounded-xl text-center focus:outline-none focus:border-black text-lg shadow-sm"
        // Keep your existing name state binding here if applicable, e.g., value={name} onChange={(e) => setName(e.target.value)}
      />
    </div>

    {/* CENTER: The Giant Locked Speaker Symbol */}
    <div className="flex-1 flex flex-col items-center justify-center">
      <button className="w-28 h-28 bg-black rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform">
        {/* A beautiful, clean vector Microphone/Speaker icon */}
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-white">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
        </svg>
      </button>
      <p className="text-gray-400 text-sm mt-4 tracking-wide font-medium">Tap to Record</p>
    </div>

    {/* BOTTOM: Minimal balancing spacer to keep layout centered */}
    <div className="h-10"></div>

  </div>
););
}
// Build Fix May 27 
// Build Fix May 27 
