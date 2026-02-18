import { format } from 'date-fns'
import type { PostItem, Image as ImageType } from '@/types'
import { cn } from '@/lib/utils'

interface PostProps {
    post: PostItem
    isOp?: boolean
    className?: string
    id?: string
}

export function Post({ post, isOp = false, className, id }: PostProps) {
    const { model, images, cdn_url } = post

    return (
        <div
            id={id || `p${model.id}`}
            className={cn(
                "p-3 rounded-sm flex flex-col gap-2 relative group target:bg-orange-50 dark:target:bg-orange-950/30 transition-colors",
                isOp ? "mb-6" : "bg-muted/50 border border-border/50 inline-block min-w-[300px] max-w-full",
                className
            )}
        >
            <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                <span className="font-bold text-primary">Anonymous</span>
                {model.country_code && <span>[{model.country_code}]</span>}
                <time dateTime={model.created_at}>
                    {format(new Date(model.created_at), 'MM/dd/yy(EEE)HH:mm:ss')}
                </time>
                <span className="cursor-pointer hover:underline">No.{model.id}</span>
            </div>

            <div className={cn("flex gap-4", isOp ? "flex-col sm:flex-row" : "flex-col")}>
                {images.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-start shrink-0">
                        {images.map((img: ImageType) => (
                            <div key={img.id} className="flex flex-col gap-1">
                                <a
                                    href={`${cdn_url}/${img.url}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-blue-600 hover:underline truncate max-w-[150px]"
                                >
                                    {img.filename}
                                </a>
                                <span className="text-[10px] text-muted-foreground">
                  ({img.width}x{img.height}, {Math.round(img.size / 1024)}KB)
                </span>
                                <a href={`${cdn_url}/${img.url}`} target="_blank" rel="noreferrer">
                                    <img
                                        src={`${cdn_url}/${img.thumbnail_url}`}
                                        alt={img.filename}
                                        className="max-w-[200px] max-h-[200px] object-contain border border-border bg-background"
                                        loading="lazy"
                                    />
                                </a>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <blockquote className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {model.content}
                    </blockquote>
                </div>
            </div>
        </div>
    )
}

export default Post;
