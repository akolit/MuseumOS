import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './i18n';
import './index.css';

// Restore persisted theme as early as possible so the first paint matches.
// First-time visitors with no saved preference default to 'modern' — same
// behaviour as the admin web (see apps/web/index.html).
document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') ?? 'modern');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
