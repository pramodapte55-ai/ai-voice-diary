import React, { useState, useRef, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function App() {
  const [userName, setUserName] = useState('Pramod');
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready to record');
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Listen for mobile installation capability
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const triggerAppInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setStatusMessage('Processing audio transmission...');
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp4' });
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.mp4');
        formData.append('name', userName);

        try {
          // FIXED: Pointing directly to your verified active live Render database endpoint
          const response = await fetch('https://ai-voice-diary.onrender.com/api/record', {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();
          if (response.ok) {
            setStatusMessage('Voice memory saved and ledger queried successfully!');
            setApiResponse(data);
          } else {
            setStatusMessage(`Server error: ${data.error || response.statusText}`);
          }
        } catch (error) {
          console.error(error);
          setStatusMessage('Network communication error occurred.');
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatusMessage('Recording voice note...');
    } catch (err) {
      console.error('Microphone access denied:', err);
      setStatusMessage('Error: Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  return (
    <div style={{ padding: '30px 20px', fontFamily: 'sans-serif', maxWidth: '500px', margin: '0 auto' }}>
      <h2>🎙️ AI Voice Diary Ledger</h2>
      
      {/* ADDED: 3-line user instructions */}
      <div style={{ background: '#fcf8e3', border: '1px solid #fbeed5', padding: '12px', borderRadius: '6px', fontSize: '14px', color: '#c09853', marginBottom: '15px' }}>
        <p style={{ margin: '0 0 5px 0' }}>1. Enter your name in the block parameter control input box below.</p>
        <p style={{ margin: '0 0 5px 0' }}>2. Tap 'Start Recording' and log your data or query your logs verbally.</p>
        <p style={{ margin: 0 }}>3. Press 'Stop & Save Note' to synchronize and read the data engine matrix matrix response.</p>
      </div>

      {/* ADDED: Dynamic Name input element */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>User Context Name:</label>
        <input 
          type="text" 
          value={userName} 
          onChange={(e) => setUserName(e.target.value)}
          style={{ width: '100%', padding: '10px', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '5px', fontSize: '16px' }}
        />
      </div>

      {/* ADDED: Smart Native App Installer target banner */}
      {installPrompt && (
        <button 
          onClick={triggerAppInstall}
          style={{ width: '100%', padding: '12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', marginBottom: '15px' }}
        >
          📲 Click to Install AI Voice Diary App
        </button>
      )}
      
      <div style={{ margin: '15px 0', padding: '15px', background: '#f3f4f6', borderRadius: '8px' }}>
        <strong>Status:</strong> {statusMessage}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          onClick={startRecording} 
          disabled={isRecording}
          style={{ flex: 1, padding: '12px', background: isRecording ? '#ccc' : '#22c55e', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Start Recording
        </button>
        <button 
          onClick={stopRecording} 
          disabled={!isRecording}
          style={{ flex: 1, padding: '12px', background: !isRecording ? '#ccc' : '#ef4444', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Stop & Save Note
        </button>
      </div>

      {apiResponse && (
        <div style={{ padding: '15px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
          <h4 style={{ margin: '0 0 10px 0' }}>Server Response Matrix:</h4>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, background: '#fff', padding: '10px', borderRadius: '4px', border: '1px solid #dbeafe' }}>
            {JSON.stringify(apiResponse, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default App;