import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { rawEnvFromVite, validateEnv } from './lib/env';
import { createAdminClient } from './lib/supabase';
import { ConfigErrorPage } from './pages/StatusPages';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root DOM element #root not found.');
}

// Fail closed: no client at all unless the env is the v2 project with a publishable key.
const env = validateEnv(rawEnvFromVite());

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {env.ok ? (
      <BrowserRouter>
        <App client={createAdminClient(env.env)} />
      </BrowserRouter>
    ) : (
      <ConfigErrorPage problems={env.problems} />
    )}
  </React.StrictMode>,
);
