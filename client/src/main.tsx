import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom'
import { store } from './store/store'
import './index.css'

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';

import Layout from '@/components/common/Layout'
import HomePage from '@/pages/HomePage'
import BoardPage from '@/pages/BoardPage'
import ThreadPage from '@/pages/ThreadPage'
import NotFoundPage from '@/pages/NotFoundPage'
import AdminPage from "@/pages/Admin"

const LayoutWrapper = () => (<Layout><Outlet /></Layout>)

const router = createBrowserRouter([
    {
        element: <LayoutWrapper />,
        errorElement: <Layout><NotFoundPage /></Layout>,
        children: [
            { path: "/", element: <HomePage /> },
            { path: "/home", element: <Navigate to="/" replace /> },
            { path: "/admin", element: <AdminPage /> },
            { path: "/:slug", element: <BoardPage /> },
            { path: "/:slug/thread/:id", element: <ThreadPage /> },
        ],
    },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Provider store={store}>
            <RouterProvider router={router} />
        </Provider>
    </React.StrictMode>,
)
