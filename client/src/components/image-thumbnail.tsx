import { useState } from "react"
import type { Image as ImageType } from "@/types" // Fixed: Added 'type'
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"

interface Props {
    image: ImageType
    cdnUrl: string
}

export function ImageThumbnail({ image, cdnUrl }: Props) {
    const [isOpen, setIsOpen] = useState(false)

    // Construct URLs
    const thumbUrl = `${cdnUrl}/${image.thumbnail_url}`
    const fullUrl = `${cdnUrl}/src/${image.url}`

    return (
        <div className="inline-block mr-4 mb-2 align-top">
            <div className="text-xs text-muted-foreground mb-1 truncate max-w-[200px]">
                {image.filename} <span className="opacity-70">({(image.size / 1024).toFixed(0)}KB, {image.width}x{image.height})</span>
            </div>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                    <img
                        src={thumbUrl}
                        alt={image.filename}
                        className="rounded-md border cursor-pointer hover:opacity-90 transition-opacity max-h-[200px] max-w-[200px] object-cover"
                        loading="lazy"
                    />
                </DialogTrigger>
                <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-transparent shadow-none flex items-center justify-center">
                    <a href={fullUrl} target="_blank" rel="noopener noreferrer">
                        <img
                            src={fullUrl}
                            alt={image.filename}
                            className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
                        />
                    </a>
                </DialogContent>
            </Dialog>
        </div>
    )
}
