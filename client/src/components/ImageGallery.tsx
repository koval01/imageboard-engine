import { useState } from 'react'
import type { Image } from '@/types'
import { cn } from '@/lib/utils'

interface ImageGalleryProps {
    images: Image[]
    cdnUrl: string
}

export function ImageGallery({ images, cdnUrl }: ImageGalleryProps) {
    const [expandedId, setExpandedId] = useState<number | null>(null)

    if (!images || images.length === 0) return null

    return (
        <div className="flex flex-wrap gap-4 my-2">
            {images.map((img) => {
                const isExpanded = expandedId === img.id

                // Handle local vs s3 paths if necessary, assuming cdnUrl is base
                const thumbSrc = img.thumbnail_url.startsWith('http') ? img.thumbnail_url : `${cdnUrl}/${img.thumbnail_url}`
                const fullSrc = img.url.startsWith('http') ? img.url : `${cdnUrl}/${img.url}`

                return (
                    <div key={img.id} className="relative group">
                        <div className="text-xs text-muted-foreground mb-1">
                            {img.filename}
                            <span className="ml-1 opacity-70">({img.width}x{img.height}, {Math.round(img.size / 1024)}KB)</span>
                        </div>

                        <div
                            className={cn("cursor-pointer transition-all", isExpanded ? "max-w-full" : "max-w-[200px]")}
                            onClick={() => setExpandedId(isExpanded ? null : img.id)}
                        >
                            <img
                                src={isExpanded ? fullSrc : thumbSrc}
                                alt={img.filename}
                                className={cn(
                                    "rounded-md border bg-muted object-contain",
                                    isExpanded ? "max-h-[90vh] max-w-full" : "max-h-48 hover:opacity-90"
                                )}
                                loading="lazy"
                            />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}