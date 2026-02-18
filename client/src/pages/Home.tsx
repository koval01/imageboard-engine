import { Link } from 'react-router-dom'
import { useGetHomeQuery } from '@/store/apiSlice'

export default function Home() {
    const { data, isLoading, error } = useGetHomeQuery()

    if (isLoading) return <div className="text-center mt-10">Loading...</div>
    if (error) return <div className="text-center mt-10 text-red-500">Failed to load home</div>
    if (!data) return null

    return (
        <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
                <h1 className="text-4xl font-black mb-2 text-neutral-800 dark:text-neutral-100">Welcome</h1>
                <p className="text-neutral-500">Select a board to start browsing</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-12">
                {data.boards.map((b) => (
                    <Link
                        key={b.model.slug}
                        to={`/${b.model.slug}`}
                        className="block p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 transition-colors bg-white dark:bg-neutral-900 group"
                    >
                        <div className="font-bold text-xl mb-1 group-hover:text-blue-500">/{b.model.slug}/ - {b.model.name}</div>
                        <div className="text-sm text-neutral-500 mb-2">{b.model.description}</div>
                        <div className="text-xs font-mono text-neutral-400">{b.post_count} posts</div>
                    </Link>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <h2 className="text-xl font-bold mb-4 border-b pb-2 border-neutral-200 dark:border-neutral-800">
                        Recent Threads
                    </h2>
                    <div className="space-y-2">
                        {data.recent_threads.map((t) => (
                            <Link
                                key={t.id}
                                to={`/${t.board_slug}/thread/${t.id}`}
                                className="block p-2 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded"
                            >
                                <div className="text-sm font-medium truncate">
                                    {t.subject || t.content.substring(0, 50)}...
                                </div>
                                <div className="text-xs text-neutral-400">
                                    /{t.board_slug}/ &bull; No.{t.id}
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                <div>
                    <h2 className="text-xl font-bold mb-4 border-b pb-2 border-neutral-200 dark:border-neutral-800">
                        Recent Images
                    </h2>
                    <div className="grid grid-cols-4 gap-2">
                        {data.recent_images.map((img) => (
                            <div
                                key={img.id}
                                className="block aspect-square overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800 relative group"
                            >
                                <img
                                    src={img.thumbnail_url.startsWith('http') ? img.thumbnail_url : `${data.cdn_url}/${img.thumbnail_url}`}
                                    alt={img.filename}
                                    className="w-full h-full object-cover hover:opacity-80 transition-opacity"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
