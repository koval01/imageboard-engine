import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { store } from './store/store'
import './index.css'

import Layout from './components/Layout.tsx'
import HomePage from './pages/HomePage'
import BoardPage from './pages/BoardPage'
import ThreadPage from './pages/ThreadPage'
import NotFoundPage from './pages/NotFoundPage'

const router = createBrowserRouter([
    {
        element: <Layout />,
        errorElement: <NotFoundPage />,
        children: [
            {
                path: "/",
                element: <HomePage />,
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
