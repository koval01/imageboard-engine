import { useGetHomeQuery } from '@/store/api/boardApi'
import { Link } from 'react-router-dom'
import { Loader2, MessageSquare, TrendingUp, Layers } from 'lucide-react'
import { motion } from 'framer-motion'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } }
const item = { hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1 } }

export default function HomePage() {
    const { data, isLoading, error } = useGetHomeQuery()

    if (isLoading) return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
    if (error) return <div className="p-8 text-center text-destructive">Не вдалося завантажити дані.</div>
    if (!data) return null

    return (
        <div className="space-y-12">
            <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-primary/5 p-8 md:p-12 border border-border/50">
                <div className="relative z-10 max-w-2xl">
                    <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4">
                        <span className="text-primary">Kryivka</span>
                    </h1>
                    <p className="text-lg text-muted-foreground mb-6">Анонімний український іміджборд.</p>
                </div>
            </section>

            <section>
                <div className="flex items-center gap-2 mb-6"><TrendingUp className="h-5 w-5 text-primary" /><h2 className="text-2xl font-bold tracking-tight">Свіжий контент</h2></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {data.recent_images.slice(0, 12).map((img) => (
                        <Link key={img.id} to={`${img.board_slug}/thread/${img.thread_id}`} className="group relative aspect-square overflow-hidden rounded-lg bg-muted border border-border">
                            <img src={`${data.cdn_url}/${img.thumbnail_url}`} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                        </Link>
                    ))}
                </div>
            </section>

            <section>
                <div className="flex items-center gap-2 mb-6"><Layers className="h-5 w-5 text-primary" /><h2 className="text-2xl font-bold tracking-tight">Дошки</h2></div>
                <motion.div variants={container} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {data.boards.map(({ model: board, post_count }) => (
                        <motion.div key={board.slug} variants={item}>
                            <Link to={`/${board.slug}`} className="block h-full group">
                                <div className="flex h-full flex-col justify-between rounded-xl border bg-card p-6 transition-all hover:shadow-lg hover:border-primary/50">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-xl font-bold">/{board.slug}/</h3>
                                            <span className="text-xs bg-secondary px-2 py-1 rounded-full">{board.name}</span>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{board.description}</p>
                                    </div>
                                    <div className="mt-6 flex items-center text-xs font-medium text-muted-foreground">
                                        <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> {post_count} постів
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
