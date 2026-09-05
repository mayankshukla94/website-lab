import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { WebsitePreview } from './components/WebsitePreview.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WebsitePreview />
  </StrictMode>,
);
