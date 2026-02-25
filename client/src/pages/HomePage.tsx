import { useGetHomeQuery } from '@/store/apiSlice'
import { Link } from 'react-router-dom'
import { Loader2, MessageSquare, TrendingUp, Layers } from 'lucide-react'
import { motion } from 'framer-motion'

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
}

const item = {
    hidden: { opacity: 0, scale: 0.95 },
    show: { opacity: 1, scale: 1 }
}

export default function HomePage() {
    const { data, isLoading, error } = useGetHomeQuery()

    if (isLoading) return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
    if (error) return <div className="p-8 text-center text-destructive">Не вдалося завантажити системні дані.</div>
    if (!data) return null

    return (
        <div className="space-y-12">
            {/* Hero Section */}
            <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-primary/5 p-8 md:p-12 border border-border/50">
                <div className="relative z-10 max-w-2xl">
                    <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4">
                        Ласкаво просимо до <span className="text-primary">Kryivka</span>
                    </h1>
                    <p className="text-lg text-muted-foreground mb-6">
                        Високопродуктивний, анонімний іміджборд, побудований на Rust та React.
                        Безпечно, швидко та ефемерно.
                    </p>
                </div>
                <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 opacity-10">
                    <Layers className="w-96 h-96" />
                </div>
            </section>

            {/* Stats / Recent Images */}
            <section>
                <div className="flex items-center gap-2 mb-6">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <h2 className="text-2xl font-bold tracking-tight">Свіжий контент</h2>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {data.recent_images.slice(0, 12).map((img) => (
                        <Link
                            key={img.id}
                            to={`${img.board_slug}/thread/${img.thread_id}`}
                            className="group relative aspect-square overflow-hidden rounded-lg bg-muted border border-border transition-all hover:ring-2 hover:ring-primary/50"
                        >
                            <img
                                src={`${data.cdn_url}/${img.thumbnail_url}`}
                                alt=""
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                <span className="text-[10px] text-white font-mono">{(img.size/1024).toFixed(0)}KB</span>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Boards Grid */}
            <section>
                <div className="flex items-center gap-2 mb-6">
                    <Layers className="h-5 w-5 text-primary" />
                    <h2 className="text-2xl font-bold tracking-tight">Дошки</h2>
                </div>

                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                >
                    {data.boards.map(({ model: board, post_count }) => (
                        <motion.div key={board.slug} variants={item}>
                            <Link to={`/${board.slug}`} className="block h-full group">
                                <div className="flex h-full flex-col justify-between rounded-xl border bg-card p-6 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-lg group-hover:border-primary/50">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-xl font-bold tracking-tight">/{board.slug}/</h3>
                                            <span className="text-xs font-medium bg-secondary px-2 py-1 rounded-full text-secondary-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        {board.name}
                      </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{board.description}</p>
                                    </div>

                                    <div className="mt-6 flex items-center text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
                                        <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                                        {post_count.toLocaleString()} постів
                                    </div>
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </motion.div>
            </section>
        </div>
    )
}
