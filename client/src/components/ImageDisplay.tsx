import { useState } from 'react'
import type { Image } from '@/types'

interface ImageDisplayProps {
    image: Image
    cdnUrl: string
}

export default function ImageDisplay({ image, cdnUrl }: ImageDisplayProps) {
    const [expanded, setExpanded] = useState(false)

    // Construct URLs - fallback to local if cdnUrl is relative/empty
    const thumbSrc = image.thumbnail_url.startsWith('http')
        ? image.thumbnail_url
        : `${cdnUrl}/${image.thumbnail_url}`

    const fullSrc = image.url.startsWith('http')
        ? image.url
        : `${cdnUrl}/${image.url}`

    const toggle = (e: React.MouseEvent) => {
        e.preventDefault()
        setExpanded(!expanded)
    }

    return (
        <div className="mb-2">
            <div className="text-xs text-neutral-500 mb-1 flex gap-2">
                <a href={fullSrc} target="_blank" rel="noreferrer" className="hover:underline">
                    {image.filename}
                </a>
                <span>({image.width}x{image.height}, {Math.round(image.size / 1024)}KB)</span>
            </div>

            {expanded ? (
                <img
                    src={fullSrc}
                    alt={image.filename}
                    onClick={toggle}
                    className="max-w-full max-h-[90vh] object-contain cursor-zoom-out block my-2"
                />
            ) : (
                <img
                    src={thumbSrc}
                    alt={image.filename}
                    onClick={toggle}
                    className="max-w-[200px] max-h-[200px] object-cover cursor-zoom-in rounded-sm border border-neutral-200 dark:border-neutral-800 hover:opacity-90"
                />
            )}
        </div>
    )
}
