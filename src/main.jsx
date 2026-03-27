import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// Global styles
const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease; }
  body { font-family: 'Nunito Sans', sans-serif; background: #0d1117; color: #e6edf3; }
  button, [role="button"] { transition: all 0.15s ease; }
  button:active, [role="button"]:active { transform: scale(0.97); }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
  input, textarea, select, button { font-family: 'Nunito Sans', sans-serif; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  .fade-in { animation: fadeIn 0.2s ease-out forwards; }
  @keyframes shake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(16px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .slide-up { animation: slideUp 0.25s ease-out forwards; }
  .slide-in { animation: slideIn 0.2s ease forwards; }
  .skeleton { animation: pulse 1.5s ease-in-out infinite; background: #1c2333; border-radius: 6px; }
  .glass-card {
    background: rgba(28, 35, 51, 0.7);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(48, 54, 61, 0.5);
  }
  .card-hover:hover {
    box-shadow: 0 0 20px rgba(249, 115, 22, 0.08);
  }
  .tab-active {
    position: relative;
  }
  .tab-active::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 20%;
    width: 60%;
    height: 2px;
    background: #f97316;
    border-radius: 2px;
  }
  @media print {
    .no-print { display: none !important; }
    body { background: white; color: black; }
  }
  @media (max-width: 768px) {
    .desktop-only { display: none !important; }
  }
  @media (min-width: 769px) {
    .mobile-only { display: none !important; }
  }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
