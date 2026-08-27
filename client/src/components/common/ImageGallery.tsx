import { useState } from "react";
import { Link } from "react-router-dom";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import type { Image } from "@/types/models";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ImageGalleryProps {
    images: Image[];
    cdnUrl: string;
    interactive?: boolean;
    to?: string;
}

function Thumb({
    img,
    cdnUrl,
    ready,
    onReady,
}: {
    img: Image
    cdnUrl: string
    ready: boolean
    onReady: () => void
}) {
    return (
        <span className={cn("ib-thumb", ready && "ib-thumb-ready")}>
            {!ready && <span className="ib-spinner" aria-hidden />}
            <img
                src={`${cdnUrl}/${img.thumbnail_url}`}
                alt={img.filename}
                className={cn("ib-img h-auto max-h-[250px] w-auto max-w-[250px]", ready && "ib-img-ready")}
                loading="lazy"
                onLoad={onReady}
                onError={onReady}
                ref={(el) => {
                    if (!ready && el?.complete && el.naturalWidth > 0) onReady()
                }}
            />
        </span>
    )
}

export function ImageGallery({ images, cdnUrl, interactive = true, to }: ImageGalleryProps) {
    const [index, setIndex] = useState(-1);
    const [ready, setReady] = useState<Record<number, boolean>>({});

    if (!images.length) return null;

    const slides = images.map((img) => ({
        src: `${cdnUrl}/${img.url}`,
        downloadUrl: `${cdnUrl}/${img.url}`,
        width: img.width,
        height: img.height,
        alt: img.filename,
    }));

    const multi = images.length > 1;
    const markReady = (id: number) => setReady((prev) => (prev[id] ? prev : { ...prev, [id]: true }))

    return (
        <>
            <div className={cn("post__images", multi && "post__images_type_multi")}>
                {images.map((img, i) => {
                    const full = `${cdnUrl}/${img.url}`
                    const search = `https://www.google.com/searchbyimage?image_url=${encodeURIComponent(full)}`
                    return (
                        <figure key={img.id} className="post__image m-0 max-w-[250px]">
                            <figcaption className="post__file-attr">
                                <a href={full} target="_blank" rel="noreferrer" className="post__filename" title={img.filename}>
                                    {img.filename}
                                </a>
                                <a href={search} target="_blank" rel="noreferrer" className="post__file-ico" title="Шукати зображення">⌕</a>
                                <a href={full} download={img.filename} className="post__file-ico" title="Завантажити">↓</a>
                                <span className="post__filesize">
                                    {formatFileSize(img.size)}, {img.width}×{img.height}
                                </span>
                            </figcaption>
                            {to ? (
                                <Link to={to} className="block">
                                    <Thumb img={img} cdnUrl={cdnUrl} ready={!!ready[img.id]} onReady={() => markReady(img.id)} />
                                </Link>
                            ) : (
                                <button
                                    type="button"
                                    className="block"
                                    onClick={(e) => {
                                        if (!interactive) return;
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setIndex(i);
                                    }}
                                >
                                    <Thumb img={img} cdnUrl={cdnUrl} ready={!!ready[img.id]} onReady={() => markReady(img.id)} />
                                </button>
                            )}
                        </figure>
                    )
                })}
            </div>

            {interactive && (
                <Lightbox
                    slides={slides}
                    open={index >= 0}
                    index={index}
                    close={() => setIndex(-1)}
                    plugins={[Zoom, Thumbnails]}
                    zoom={{ maxZoomPixelRatio: 3 }}
                />
            )}
        </>
    );
}
