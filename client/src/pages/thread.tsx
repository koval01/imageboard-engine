import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useGetThreadQuery, usePostReplyMutation } from "@/store/apiSlice"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { ImageThumbnail } from "@/components/image-thumbnail"
import { Separator } from "@/components/ui/separator"
import { Loader2, ArrowLeft } from "lucide-react"
import { format } from "date-fns"

export default function ThreadPage() {
    const { slug, id } = useParams<{ slug: string; id: string }>()
    const threadId = parseInt(id || "0")
    const { data, isLoading } = useGetThreadQuery({ slug: slug || "", id: threadId })
    const [postReply, { isLoading: isPosting }] = usePostReplyMutation()

    const [content, setContent] = useState("")
    const [file, setFile] = useState<File | null>(null)

    if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
    if (!data || !slug) return <div>Thread not found</div>

    const handleReply = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!content && !file) return

        const formData = new FormData()
        formData.append("content", content)
        if (file) formData.append("file", file)

        try {
            await postReply({ slug, id: threadId, formData }).unwrap()
            setContent("")
            setFile(null)
        } catch (err) {
            console.error("Failed to reply", err)
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <Link to={`/${slug}`}>
                <Button variant="ghost" size="sm" className="mb-2">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to /{slug}/
                </Button>
            </Link>

            {/* OP Post */}
            <Card className="border-primary/20 bg-accent/20">
                <CardContent className="p-6">
                    <div className="flex gap-2 items-baseline text-sm text-muted-foreground mb-4">
                        {data.thread.subject && <span className="font-bold text-foreground text-lg mr-2">{data.thread.subject}</span>}
                        <span className="font-medium text-foreground">Anonymous</span>
                        <span>{format(new Date(data.thread.created_at), "PPpp")}</span>
                        <span>No. {data.thread.id}</span>
                    </div>

                    <div className="mt-2">
                        {data.op_images.map(img => (
                            <ImageThumbnail key={img.id} image={img} cdnUrl={data.cdn_url} />
                        ))}
                        <div className="whitespace-pre-wrap mt-2 text-base leading-relaxed">
                            {data.thread.content}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Separator className="my-6" />

            {/* Replies */}
            <div className="space-y-4">
                {data.replies.map(reply => (
                    <div key={reply.model.id} className="bg-card rounded-lg p-4 border shadow-sm" id={`p${reply.model.id}`}>
                        <div className="flex gap-2 items-baseline text-xs text-muted-foreground mb-2 bg-muted/50 p-1 rounded w-fit">
                            <span className="font-medium text-foreground">Anonymous</span>
                            <span>{format(new Date(reply.model.created_at), "MM/dd/yy HH:mm:ss")}</span>
                            <a href={`#p${reply.model.id}`} className="hover:underline">No. {reply.model.id}</a>
                        </div>

                        <div className="ml-2 md:ml-4">
                            {reply.images.map(img => (
                                <ImageThumbnail key={img.id} image={img} cdnUrl={data.cdn_url} />
                            ))}
                            <div className="whitespace-pre-wrap text-sm">
                                {reply.model.content}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <Separator className="my-6" />

            {/* Quick Reply Form */}
            <Card className="sticky bottom-4 shadow-xl border-t-4 border-t-primary">
                <CardContent className="p-4">
                    <form onSubmit={handleReply} className="flex flex-col gap-4">
                        <h4 className="font-semibold text-sm">Reply to Thread</h4>
                        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                            <Textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                placeholder="Write your reply..."
                                className="min-h-[100px]"
                            />
                            <div className="flex flex-col gap-2">
                                <Input
                                    type="file"
                                    onChange={e => setFile(e.target.files?.[0] || null)}
                                    className="w-full max-w-[250px]"
                                />
                                <Button type="submit" disabled={isPosting}>
                                    {isPosting ? <Loader2 className="animate-spin" /> : "Post Reply"}
                                </Button>
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
