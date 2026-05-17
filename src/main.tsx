import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from 'react-oauth2-code-pkce'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Analytics } from "@vercel/analytics/react"
import { getAuthConfig } from '@/core/auth'
import '@fontsource-variable/geist/index.css'
import '@/global.css'
import App from '@/App.tsx'

const authConfig = getAuthConfig();
const isProduction = import.meta.env.PROD;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider authConfig={authConfig}>
      <App />
    </AuthProvider>
    {isProduction ? (
      <>
        <SpeedInsights />
        <Analytics />
      </>
    ) : null}
  </StrictMode>,
)
