import { useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import type { Image } from "@/types";

interface ImageGalleryProps {
    images: Image[];
    cdnUrl: string;
}

export function ImageGallery({ images, cdnUrl }: ImageGalleryProps) {
    const [index, setIndex] = useState(-1);

    if (!images.length) return null;

    // Prepare slides for the lightbox
    const slides = images.map((img) => ({
        src: `${cdnUrl}/${img.url}`,
        downloadUrl: `${cdnUrl}/${img.url}`,
        width: img.width,
        height: img.height,
        alt: img.filename,
    }));

    return (
        <>
            <div className="flex flex-wrap gap-2 mt-2">
                {images.map((img, i) => (
                    <div
                        key={img.id}
                        className="relative group cursor-pointer inline-block"
                        onClick={() => setIndex(i)}
                    >
                        <img
                            src={`${cdnUrl}/${img.thumbnail_url}`}
                            alt={img.filename}
                            className="w-24 h-24 object-cover rounded-md border border-border hover:opacity-90 transition-opacity"
                            loading="lazy"
                        />
                        {/* Resolution Badge */}
                        <div className="absolute bottom-0 left-0 bg-black/60 text-white text-[10px] px-1 w-full truncate rounded-b-md opacity-0 group-hover:opacity-100 transition-opacity">
                            {img.width}x{img.height}
                        </div>
                    </div>
                ))}
            </div>

            <Lightbox
                slides={slides}
                open={index >= 0}
                index={index}
                close={() => setIndex(-1)}
                plugins={[Zoom, Thumbnails]}
                zoom={{ maxZoomPixelRatio: 3 }}
            />
        </>
    );
}
