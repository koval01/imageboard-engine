import { useState } from 'react'
import type { Image } from '@/types'
import { X, ExternalLink } from 'lucide-react'

interface ImageViewerProps {
    images: Image[]
    cdnUrl: string
}

export default function ImageViewer({ images, cdnUrl }: ImageViewerProps) {
    const [selectedImage, setSelectedImage] = useState<Image | null>(null)

    if (!images || images.length === 0) return null

    // Ensure CDN URL doesn't have trailing slash for consistency
    const baseUrl = cdnUrl.endsWith('/') ? cdnUrl.slice(0, -1) : cdnUrl

    return (
        <div className="my-2 flex flex-wrap gap-2">
            {images.map((img) => (
                <div key={img.id} className="relative group">
                    <img
                        src={`${baseUrl}/${img.thumbnail_url}`}
                        alt={img.filename}
                        className="h-32 w-auto max-w-[200px] cursor-pointer rounded-md border border-border object-cover transition-all hover:brightness-90"
                        onClick={() => setSelectedImage(img)}
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 truncate">
                        {img.width}x{img.height} • {(img.size / 1024).toFixed(0)}KB
                    </div>
                </div>
            ))}

            {/* Lightbox Modal */}
            {selectedImage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm p-4" onClick={() => setSelectedImage(null)}>
                    <div className="relative max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute -top-10 right-0 p-2 text-foreground hover:text-primary md:-right-10 md:top-0"
                        >
                            <X className="h-8 w-8" />
                        </button>

                        <a
                            href={`${baseUrl}/${selectedImage.url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="absolute -top-10 left-0 flex items-center gap-2 p-2 text-foreground hover:text-primary md:-left-10 md:top-0"
                        >
                            <ExternalLink className="h-6 w-6" />
                            <span className="text-sm font-bold">{selectedImage.filename}</span>
                        </a>

                        <img
                            src={`${baseUrl}/${selectedImage.url}`}
                            alt={selectedImage.filename}
                            className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
