import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from 'react-oauth2-code-pkce'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { getAuthConfig } from '@/core/auth'
import '@fontsource-variable/geist/index.css'
import '@/global.css'
import App from '@/App.tsx'

const authConfig = getAuthConfig();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider authConfig={authConfig}>
      <App />
    </AuthProvider>
    <SpeedInsights />
  </StrictMode>,
)
