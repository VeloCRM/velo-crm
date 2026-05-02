import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { OperatorProvider } from './contexts/OperatorContext'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null } }
  static getDerivedStateFromError(error) { return { hasError: true, error } }
  render() {
    if (this.state.hasError) return (
      <div style={{ padding: 40, fontFamily: 'monospace', background: '#1a1a2e', color: '#e94560', minHeight: '100vh' }}>
        <h2 style={{ color: '#e94560' }}>App Crashed</h2>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#fff', background: '#16213e', padding: 20, borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>{this.state.error?.toString()}{'\n\n'}{this.state.error?.stack}</pre>
        <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '10px 24px', background: '#e94560', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>Reload</button>
      </div>
    )
    return this.props.children
  }
}

/* Velo CRM v1.1 */
const root = createRoot(document.getElementById('root'))
root.render(<StrictMode><BrowserRouter><ErrorBoundary><OperatorProvider><App /></OperatorProvider></ErrorBoundary></BrowserRouter></StrictMode>)
