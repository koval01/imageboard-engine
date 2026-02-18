interface PostContentProps {
    content: string;
    boardSlug: string;
    threadId: number;
}

export function PostContent({ content }: PostContentProps) {
    // Split content by newlines to handle greentext line-by-line
    const lines = content.split('\n');

    return (
        <div className="text-sm leading-relaxed break-words whitespace-pre-wrap font-sans">
            {lines.map((line, i) => {
                // Greentext check
                if (line.trim().startsWith('>')) {
                    // Check if it's a reply link (>>12345)
                    const replyMatch = line.match(/^>>(\d+)/);

                    if (replyMatch) {
                        const targetId = replyMatch[1];
                        return (
                            <div key={i}>
                                <a
                                    href={`#p${targetId}`}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        const el = document.getElementById(`p${targetId}`);
                                        if (el) {
                                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            el.classList.add('bg-accent/30'); // Highlight effect
                                            setTimeout(() => el.classList.remove('bg-accent/30'), 2000);
                                        }
                                    }}
                                    className="text-primary hover:underline hover:text-red-600 font-medium cursor-pointer"
                                >
                                    {`>>${targetId}`}
                                </a>
                                <span className="text-green-600 dark:text-green-400 ml-1">
                  {line.replace(/^>>\d+/, '')}
                </span>
                            </div>
                        );
                    }

                    return (
                        <div key={i} className="text-green-600 dark:text-green-400 font-medium">
                            {line}
                        </div>
                    );
                }

                return <div key={i}>{line}</div>;
            })}
        </div>
    );
}
