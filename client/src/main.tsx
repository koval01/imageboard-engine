import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { store } from '@/store/store'
import { ThemeProvider } from '@/components/theme-provider'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Provider store={store}>
            <HelmetProvider>
                <ThemeProvider defaultTheme="dark" storageKey="ebala-ui-theme">
                    <BrowserRouter>
                        <App />
                    </BrowserRouter>
                </ThemeProvider>
            </HelmetProvider>
        </Provider>
    </React.StrictMode>,
)
