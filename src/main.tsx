import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import WebsiteImporter from './components/WebsiteImporter.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WebsiteImporter />
  </StrictMode>,
)
