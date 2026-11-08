import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './lib/launch';
import { initStore } from './lib/store';
import { initWidgetBridge } from './lib/widget';
import './styles/app.css';

void initStore();
// Widget de Android: escucha desde el principio, antes de que Chrome entregue el canal.
initWidgetBridge();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
