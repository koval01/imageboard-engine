import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { useLocation } from 'react-router-dom'
import type { RootState } from '@/store/store'

const MIN_MS = 280
const NAV_MS = 360

export default function LoadingBar() {
    const location = useLocation()
    const [navBusy, setNavBusy] = useState(false)
    const [visible, setVisible] = useState(false)
    const shownAt = useRef(0)

    const queryBusy = useSelector((state: RootState) => {
        const queries = Object.values(state.api.queries)
        const mutations = Object.values(state.api.mutations)
        const pendingQuery = queries.some((q) => {
            if (q?.status !== 'pending') return false
            // Hover-card fetches and 3s thread polls should not hijack the top bar.
            if (q.endpointName === 'getPost') return false
            if (q.endpointName === 'getThread' && q.data !== undefined) return false
            if (q.endpointName === 'getHome' && q.data !== undefined) return false
            return true
        })
        return pendingQuery || mutations.some((m) => m?.status === 'pending')
    })

    useEffect(() => {
        setNavBusy(true)
        const t = window.setTimeout(() => setNavBusy(false), NAV_MS)
        return () => window.clearTimeout(t)
    }, [location.pathname])

    const busy = queryBusy || navBusy

    useEffect(() => {
        if (busy) {
            if (!shownAt.current) shownAt.current = Date.now()
            setVisible(true)
            return
        }
        const left = MIN_MS - (Date.now() - (shownAt.current || Date.now()))
        const t = window.setTimeout(() => {
            shownAt.current = 0
            setVisible(false)
        }, Math.max(0, left))
        return () => window.clearTimeout(t)
    }, [busy])

    if (!visible) return null
    return (
        <div className="ib-nprogress" role="progressbar" aria-label="Завантаження" aria-live="polite">
            <span className="ib-nprogress-peg" />
        </div>
    )
}
