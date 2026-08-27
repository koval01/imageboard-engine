import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { store } from './store/store'
import './index.css'

import '@fontsource/pt-sans/400.css'
import '@fontsource/pt-sans/700.css'
import '@fontsource/open-sans/400.css'
import '@fontsource/open-sans/700.css'
import '@fontsource/jetbrains-mono/400.css'

import AdminLayout from '@/features/admin/AdminLayout'

const router = createBrowserRouter(
    [
        { path: '/', element: <AdminLayout /> },
        { path: '*', element: <AdminLayout /> },
    ],
    { basename: '/admin' },
)

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Provider store={store}>
            <RouterProvider router={router} />
            <Toaster richColors position="top-right" />
        </Provider>
    </React.StrictMode>,
)
