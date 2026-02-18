import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
    useLazyInvestigateQuery,
    useVisualSearchMutation,
    useGetReportsQuery,
    useResolveReportMutation
} from "@/store/apiSlice";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Search, Image as ImageIcon, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

export default function AdminPanel() {
    const [searchParams] = useSearchParams();
    const urlTarget = searchParams.get("target");

    const [target, setTarget] = useState(urlTarget || "");
    const [triggerInvestigate, { data: invData, isFetching: invLoading }] = useLazyInvestigateQuery();

    const [uploadVisual, { data: visData, isLoading: visLoading }] = useVisualSearchMutation();

    const { data: reports, refetch: refetchReports } = useGetReportsQuery();
    const [resolveReport] = useResolveReportMutation();

    // Auto-trigger investigation if target provided in URL
    useEffect(() => {
        if (urlTarget) {
            triggerInvestigate({ target: urlTarget });
        }
    }, [urlTarget, triggerInvestigate]);

    const handleVisualSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const fd = new FormData();
            fd.append("file", e.target.files[0]);
            uploadVisual(fd);
        }
    };

    const handleResolve = async (id: number, status: string) => {
        try {
            await resolveReport({ report_id: id, status }).unwrap();
            toast.success(`Report marked as ${status}`);
            refetchReports();
        } catch (e) {
            toast.error("Failed to update report");
        }
    };

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
                    <p className="text-muted-foreground">Monitor reports, trace users, and analyze content.</p>
                </div>
            </div>

            <Tabs defaultValue={urlTarget ? "investigate" : "reports"} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="reports" className="flex gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Reports
                        {reports && reports.length > 0 && (
                            <Badge variant="destructive" className="ml-1 px-1 py-0 h-5 text-[10px]">
                                {reports.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="investigate" className="flex gap-2">
                        <Search className="w-4 h-4" /> Investigation
                    </TabsTrigger>
                    <TabsTrigger value="visual" className="flex gap-2">
                        <ImageIcon className="w-4 h-4" /> Visual Search
                    </TabsTrigger>
                </TabsList>

                {/* REPORTS TAB */}
                <TabsContent value="reports">
                    <div className="grid gap-4">
                        {reports?.map(r => (
                            <Card key={r.id} className="border-l-4 border-l-destructive/50">
                                <CardHeader className="flex flex-row items-start justify-between py-4">
                                    <div className="space-y-1">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <span>Report #{r.id}</span>
                                            <Badge variant="outline" className="font-normal">{r.reason}</Badge>
                                        </CardTitle>
                                        <CardDescription>
                                            Reporter IP: <span className="font-mono text-xs">{r.reporter_ip}</span> • {new Date(r.created_at).toLocaleString()}
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" onClick={() => handleResolve(r.id, "RESOLVED")}>
                                            <CheckCircle className="w-4 h-4 mr-1" /> Resolve
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => handleResolve(r.id, "REJECTED")}>
                                            <XCircle className="w-4 h-4 mr-1" /> Reject
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="bg-muted/50 p-4 rounded-md">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs font-semibold uppercase text-muted-foreground">Reported Content (Post #{r.post?.id})</span>
                                            <Button
                                                variant="link"
                                                size="sm"
                                                className="h-auto p-0"
                                                onClick={() => setTarget(r.post?.ip_address || "")}
                                            >
                                                Trace User
                                            </Button>
                                        </div>
                                        <p className="text-sm whitespace-pre-wrap">{r.post?.content || "[Content Deleted]"}</p>
                                        {r.images.length > 0 && (
                                            <div className="flex gap-2 mt-3">
                                                {r.images.map(img => (
                                                    <img key={img.id} src={`${img.thumbnail_url}`} className="h-16 w-16 object-cover rounded" />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {reports?.length === 0 && (
                            <div className="text-center py-20 text-muted-foreground">
                                <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                <p>No open reports. All clear.</p>
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* INVESTIGATION TAB */}
                <TabsContent value="investigate">
                    <Card>
                        <CardHeader>
                            <CardTitle>Trace Digital Footprint</CardTitle>
                            <CardDescription>Enter an IP address or Session ID to find all associated posts and linked identities.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex gap-2 mb-6">
                                <Input
                                    placeholder="IP Address (e.g. 1.2.3.4) or Session UUID"
                                    value={target}
                                    onChange={e => setTarget(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && triggerInvestigate({ target })}
                                />
                                <Button onClick={() => triggerInvestigate({ target })} disabled={invLoading}>
                                    {invLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Trace"}
                                </Button>
                            </div>

                            {invData && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Card className="bg-muted/20">
                                            <CardHeader className="py-3"><CardTitle className="text-sm">Related IPs ({invData.related_ips.length})</CardTitle></CardHeader>
                                            <CardContent className="py-2">
                                                <ScrollArea className="h-32 rounded-md border bg-background p-2">
                                                    <div className="font-mono text-xs space-y-1">
                                                        {invData.related_ips.map(ip => (
                                                            <div key={ip} className="flex justify-between hover:bg-muted cursor-pointer px-1" onClick={() => setTarget(ip)}>
                                                                <span>{ip}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </CardContent>
                                        </Card>
                                        <Card className="bg-muted/20">
                                            <CardHeader className="py-3"><CardTitle className="text-sm">Related Sessions ({invData.related_sessions.length})</CardTitle></CardHeader>
                                            <CardContent className="py-2">
                                                <ScrollArea className="h-32 rounded-md border bg-background p-2">
                                                    <div className="font-mono text-xs space-y-1">
                                                        {invData.related_sessions.map(s => (
                                                            <div key={s} className="truncate hover:bg-muted cursor-pointer px-1" onClick={() => setTarget(s)}>
                                                                {s}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <h3 className="font-bold text-lg flex items-center gap-2">
                                        Content Graph
                                        <Badge variant="secondary">{invData.posts_found.length} posts</Badge>
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {invData.posts_found.map(p => (
                                            <div key={p.id} className="border p-3 rounded text-sm bg-card shadow-sm">
                                                <div className="flex justify-between text-muted-foreground mb-2 text-xs font-mono border-b pb-1">
                                                    <span>No.{p.id}</span>
                                                    <span>{new Date(p.created_at).toLocaleDateString()}</span>
                                                </div>
                                                <div className="line-clamp-4 break-words">{p.content}</div>
                                                <div className="mt-2 pt-2 border-t flex justify-between text-[10px] text-muted-foreground font-mono">
                                                    <span title="IP">{p.ip_address}</span>
                                                    <span title="Session" className="truncate max-w-[80px]">{p.session_id}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* VISUAL SEARCH TAB */}
                <TabsContent value="visual">
                    <Card>
                        <CardHeader>
                            <CardTitle>Perceptual Hash Search</CardTitle>
                            <CardDescription>Find duplicate or modified images using pHash algorithms. Detects resizing, cropping, and minor edits.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="mb-8 p-12 border-2 border-dashed rounded-xl text-center hover:bg-muted/20 transition-colors">
                                <ImageIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                                <p className="mb-4 text-muted-foreground">Upload a source image to scan the database</p>
                                <Input type="file" onChange={handleVisualSearch} className="max-w-xs mx-auto" />
                            </div>

                            {visLoading && (
                                <div className="text-center py-10">
                                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                                    <p>Calculating Hamming distances...</p>
                                </div>
                            )}

                            {visData && (
                                <div className="space-y-4">
                                    <h3 className="font-bold">Matches Found ({visData.length})</h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                        {visData.map((match: any, i: number) => (
                                            <div key={i} className="border rounded overflow-hidden group relative">
                                                <img src={match.image.thumbnail_url} className="w-full h-40 object-cover" />
                                                <div className="p-2 text-xs">
                                                    <div className="flex justify-between mb-1">
                                                        <span className="font-semibold">Dist: {match.distance}</span>
                                                        <span className="text-muted-foreground">No.{match.post?.id || "N/A"}</span>
                                                    </div>
                                                    <Button
                                                        variant="secondary"
                                                        className="w-full h-6 text-[10px]"
                                                        onClick={() => setTarget(match.post?.ip_address)}
                                                    >
                                                        Trace User
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
