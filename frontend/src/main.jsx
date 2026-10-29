import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/cairo';
import '@fontsource-variable/readex-pro';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
