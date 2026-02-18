import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ImageGallery } from '@/components/ImageGallery'
import { cn } from '@/lib/utils'
import type { PostItem, Thread } from '@/types'
import { format } from 'date-fns'

interface PostCardProps {
    post: PostItem | { model: Thread; images: any[] } // Hacky union to support ThreadItem as OP
    isOp?: boolean
    cdnUrl: string
    onReply?: (id: number) => void
    boardSlug?: string
}

export function PostCard({ post, isOp, cdnUrl, onReply }: PostCardProps) {
    const model = 'subject' in post.model ? post.model : post.model // Thread or Post model
    const id = model.id
    const date = new Date(model.created_at + 'Z') // Ensure UTC parsing
    const formattedDate = format(date, "dd/MM/yy(EEE)HH:mm:ss")

    // Helper to format text content (simple newlines)
    const content = model.content.split('\n').map((line, i) => (
        <p key={i} className={cn("min-h-[1em]", line.startsWith('>') && "text-green-600 dark:text-green-400 font-medium")}>
            {line}
        </p>
    ))

    return (
        <Card className={cn("w-full overflow-hidden", isOp ? "border-primary/20 mb-4" : "bg-muted/30 border-none mb-2")}>
            <CardHeader className="p-3 pb-0 flex flex-row items-center gap-2 text-sm text-muted-foreground bg-muted/10">
                {'subject' in model && model.subject && (
                    <span className="font-bold text-primary text-base mr-2">{model.subject}</span>
                )}
                <span className="font-semibold text-foreground">Anonymous</span>
                {model.country_code && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1">{model.country_code}</Badge>
                )}
                <span>{formattedDate}</span>
                <span className="cursor-pointer hover:underline" onClick={() => onReply?.(id)}>No.{id}</span>
            </CardHeader>
            <CardContent className="p-3 pt-2">
                <ImageGallery images={'images' in post ? post.images : []} cdnUrl={cdnUrl} />
                <div className="text-sm leading-relaxed break-words">
                    {content}
                </div>
            </CardContent>
        </Card>
    )
}