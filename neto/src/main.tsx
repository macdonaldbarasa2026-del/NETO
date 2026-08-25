import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

const splash = document.getElementById('neto-splash-screen');
if (splash) {
  const hideSplash = () => {
    window.setTimeout(() => splash.classList.add('is-hidden'), 650);
    window.setTimeout(() => splash.remove(), 1000);
  };
  if (document.readyState === 'complete') hideSplash();
  else window.addEventListener('load', hideSplash, { once: true });
}
