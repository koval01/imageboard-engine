import { useState } from 'react';
import { format } from 'date-fns';
import type {PostItem} from '@/types';
import { PostContent } from './PostContent';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

interface PostProps {
    post: PostItem;
    isOp?: boolean;
    onReply: (id: number) => void;
}

export function Post({ post, isOp = false, onReply }: PostProps) {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [imgIndex, setImgIndex] = useState(0);

    const slides = post.images.map(img => ({ src: `${post.cdn_url}/${img.url}` }));

    return (
        <Card
            id={`p${post.model.id}`}
            className={cn(
                "mb-4 p-4 transition-colors duration-500 scroll-mt-20",
                isOp ? "border-primary/50 bg-secondary/10" : "bg-card hover:bg-accent/5"
            )}
        >
            {/* Header */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
        <span className="font-bold text-primary text-sm">
          {post.model.country_code && (
              <span className={`fi fi-${post.model.country_code.toLowerCase()} mr-1`}></span>
          )}
            Anonymous
        </span>
                <span>{format(new Date(post.model.created_at), "MM/dd/yy(EEE)HH:mm:ss")}</span>
                <span
                    className="cursor-pointer hover:text-primary hover:underline"
                    onClick={() => onReply(post.model.id)}
                >
          No.{post.model.id}
        </span>

                {/* Admin/Mod Info (Only visible if role > 0) */}
                {post.model.ip_address && (
                    <span className="text-[10px] bg-destructive/10 text-destructive px-1 rounded">
            [{post.model.ip_address}]
          </span>
                )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
                {/* Images */}
                {post.images.length > 0 && (
                    <div className="flex flex-col gap-2 shrink-0">
                        <div className="flex flex-wrap gap-2 max-w-[300px]">
                            {post.images.map((img, idx) => (
                                <div key={img.id} className="relative group">
                                    <div className="text-[10px] text-muted-foreground truncate max-w-[150px] mb-1">
                                        {img.filename}
                                    </div>
                                    <img
                                        src={`${post.cdn_url}/${img.thumbnail_url}`}
                                        alt={img.filename}
                                        className="w-auto h-auto max-w-[200px] max-h-[200px] rounded-sm cursor-zoom-in border border-border"
                                        onClick={() => {
                                            setImgIndex(idx);
                                            setLightboxOpen(true);
                                        }}
                                    />
                                </div>
                            ))}
                        </div>

                        <Lightbox
                            open={lightboxOpen}
                            close={() => setLightboxOpen(false)}
                            index={imgIndex}
                            slides={slides}
                        />
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <PostContent
                        content={post.model.content}
                        boardSlug={post.board_slug}
                        threadId={post.thread_id}
                    />
                </div>
            </div>
        </Card>
    );
}
