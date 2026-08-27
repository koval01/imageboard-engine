import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom'
import { store } from './store/store'
import './index.css'

import '@fontsource/pt-sans/400.css'
import '@fontsource/pt-sans/700.css'
import '@fontsource/open-sans/400.css'
import '@fontsource/open-sans/700.css'
import '@fontsource/jetbrains-mono/400.css'

import Layout from '@/components/common/Layout'
import HomePage from '@/pages/HomePage'
import BoardPage from '@/pages/BoardPage'
import ThreadPage from '@/pages/ThreadPage'
import CatalogPage from '@/pages/CatalogPage'
import NotFoundPage from '@/pages/NotFoundPage'

const LayoutWrapper = () => (
    <Layout>
        <Outlet />
    </Layout>
)

const router = createBrowserRouter([
    {
        element: <LayoutWrapper />,
        errorElement: <Layout><NotFoundPage /></Layout>,
        children: [
            {
                path: "/",
                element: <HomePage />,
            },
            {
                path: "/home",
                element: <Navigate to="/" replace />
            },
            {
                path: "/:slug",
                element: <BoardPage />,
            },
            {
                path: "/:slug/catalog",
                element: <CatalogPage />,
            },
            {
                path: "/:slug/thread/:id",
                element: <ThreadPage />,
            },
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
