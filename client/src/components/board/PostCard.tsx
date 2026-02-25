import type { PostItem } from "@/types";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

interface PostCardProps {
    post: PostItem;
    isOp?: boolean;
}

export function PostCard({ post, isOp }: PostCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={cn(
                "group relative flex flex-col gap-3 rounded-lg border p-4 transition-all hover:border-primary/50",
                isOp ? "bg-card border-border shadow-sm" : "bg-muted/30 border-transparent hover:bg-muted/50"
            )}
        >
            {/* Header Meta */}
            <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                <div className="flex items-center gap-2">
          <span className={cn("font-bold", isOp ? "text-primary" : "text-foreground")}>
            {isOp ? "OP" : "Anonymous"}
          </span>
                    {post.model.country_code && (
                        <span>[{post.model.country_code}]</span>
                    )}
                    <span>No. {post.model.id}</span>
                </div>
                <time dateTime={post.model.created_at}>
                    {formatDistanceToNow(new Date(post.model.created_at), { addSuffix: true })}
                </time>
            </div>

            {/* Image Grid */}
            {post.images.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {post.images.map((img) => (
                        <div key={img.id} className="relative aspect-square overflow-hidden rounded-md bg-muted">
                            <img
                                src={`${post.cdn_url}/${img.thumbnail_url}`}
                                alt={img.filename}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                loading="lazy"
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Content */}
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground/90">
                {/* Render content with greentext support */}
                {post.model.content.split('\n').map((line, i) => (
                    <p key={i} className={cn("min-h-[1.25em]", line.startsWith('>') && "text-green-600 dark:text-green-400 font-medium")}>
                        {line}
                    </p>
                ))}
            </div>

            {/* Action Bar */}
            <div className="absolute bottom-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button className="text-xs font-medium text-muted-foreground hover:text-primary">
                    Reply
                </button>
            </div>
        </motion.div>
    );
}
