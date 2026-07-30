import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/lexend/500.css';
import '@fontsource/lexend/600.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyDisplaySettings, getInitialDisplaySettings, subscribeToDisplaySettings } from './displaySettings';
import './ui/app.css';

// Stamp theme/accent/text-size onto <html> before the first paint so a
// non-default Home setting does not flash the defaults for a frame on load.
applyDisplaySettings(getInitialDisplaySettings());
subscribeToDisplaySettings(applyDisplaySettings);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
