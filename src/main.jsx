import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { captureRef } from './lib/referral'

// ?ref=КОД з посилання — запамʼятати до будь-яких редиректів.
captureRef()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)