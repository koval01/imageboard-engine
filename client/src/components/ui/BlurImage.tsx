import { useState } from "react";
import { cn } from "@/lib/utils";

interface BlurImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    src: string;
}

export function BlurImage({ src, className, alt, ...props }: BlurImageProps) {
    const [isLoading, setLoading] = useState(true);

    return (
        <div className={cn("overflow-hidden bg-muted", className)}>
            <img
                src={src}
                alt={alt}
                className={cn(
                    "duration-700 ease-in-out",
                    isLoading ? "scale-110 blur-xl grayscale" : "scale-100 blur-0 grayscale-0",
                    className
                )}
                onLoad={() => setLoading(false)}
                {...props}
            />
        </div>
    );
}
