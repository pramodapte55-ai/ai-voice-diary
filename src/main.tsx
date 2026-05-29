import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Disabled broken stylesheet link that was crashing the Vite production pipeline
// import './index.css'; 

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);