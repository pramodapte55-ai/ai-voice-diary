import React, { useState, useRef } from 'react';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready to record');
  const [apiResponse, setApiResponse] = useState<any>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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
        formData.append('name', 'Pramod');

        try {
          const response = await fetch('https://ai-voice-diary.onrender.com/api/process-voice', {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();
          if (response.ok) {
            setStatusMessage('Voice memory saved successfully!');
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
      // Stop all microphone tracks to clean up the hardware access indicator
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h2>🎙️ AI Voice Diary Ledger</h2>
      <hr />
      
      <div style={{ margin: '20px 0', padding: '15px', background: '#f3f4f6', borderRadius: '8px' }}>
        <strong>Status:</strong> {statusMessage}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          onClick={startRecording} 
          disabled={isRecording}
          style={{ padding: '10px 20px', background: isRecording ? '#ccc' : '#22c55e', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
          Start Recording
        </button>
        <button 
          onClick={stopRecording} 
          disabled={!isRecording}
          style={{ padding: '10px 20px', background: !isRecording ? '#ccc' : '#ef4444', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
          Stop & Save Note
        </button>
      </div>

      {apiResponse && (
        <div style={{ padding: '15px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
          <h4>Server Response Matrix:</h4>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(apiResponse, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default App;