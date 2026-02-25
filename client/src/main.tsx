import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom'
import { store } from './store/store'
import './index.css'
import { Loader2 } from 'lucide-react'

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

// ⚡ LAZY LOADING: Адмінка завантажиться тільки тоді, коли юзер перейде на /admin
const AdminPage = React.lazy(() => import('@/pages/Admin'));

// Лоадер для лінивих компонентів
const PageLoader = () => (
    <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
    </div>
);

const LayoutWrapper = () => (
    <Layout>
        <Suspense fallback={<PageLoader />}>
            <Outlet />
        </Suspense>
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
                path: "/admin",
                element: <AdminPage /> // Тут тепер lazy компонент
            },
            {
                path: "/:slug",
                element: <BoardPage />,
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
