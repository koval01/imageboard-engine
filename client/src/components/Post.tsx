import type { PostItem, Image } from '@/types'
import ImageDisplay from './ImageDisplay'

interface PostProps {
    post: PostItem
    isOp?: boolean
    cdnUrl: string
}

export default function Post({ post, isOp, cdnUrl }: PostProps) {
    const date = new Date(post.model.created_at + 'Z').toLocaleString()

    return (
        <div
            id={`p${post.model.id}`}
            className={`p-3 rounded mb-2 overflow-hidden ${
                isOp ? '' : 'bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 inline-block max-w-full'
            }`}
        >
            <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-2 flex flex-wrap items-baseline gap-2">
                <span className="font-bold text-green-700 dark:text-green-500">Anonymous</span>
                {post.model.country_code && (
                    <span className="text-xs border border-neutral-300 px-1 rounded uppercase">
            {post.model.country_code}
          </span>
                )}
                <time dateTime={post.model.created_at}>{date}</time>
                <a href={`#p${post.model.id}`} className="hover:underline">No.{post.model.id}</a>

                {/* Reply Link context for Thread Page */}
                {!isOp && (
                    <span className="cursor-pointer text-blue-500 text-xs" onClick={() => {
                        const area = document.querySelector('textarea')
                        if(area) area.value += `>>${post.model.id}\n`
                    }}>
             Reply
           </span>
                )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
                {post.images.length > 0 && (
                    <div className="shrink-0">
                        {post.images.map((img: Image) => (
                            <ImageDisplay key={img.id} image={img} cdnUrl={cdnUrl} />
                        ))}
                    </div>
                )}

                <div className="whitespace-pre-wrap text-sm leading-relaxed min-w-0 break-words">
                    {/* Simple greentext parsing */}
                    {post.model.content.split('\n').map((line, i) => (
                        <div key={i} className={line.startsWith('>') && !line.startsWith('>>') ? 'text-green-600 dark:text-green-400' : ''}>
                            {line}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
