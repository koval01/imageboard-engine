import { useState } from 'react';
import {
    useGetAdminStatsQuery,
    useGetReportsQuery,
    useResolveReportMutation,
    useBanUserMutation,
    useDeleteContentMutation
} from '@/store/apiSlice';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from 'sonner';
import { Shield, Ban, Trash2, CheckCircle, Activity } from 'lucide-react';

export default function AdminDashboard() {
    const { data: stats } = useGetAdminStatsQuery();
    const { data: reports, refetch: refetchReports } = useGetReportsQuery();
    const [resolveReport] = useResolveReportMutation();
    const [banUser] = useBanUserMutation();
    const [deleteContent] = useDeleteContentMutation();

    const handleResolve = async (id: number) => {
        try {
            await resolveReport({ report_id: id, status: 'RESOLVED' }).unwrap();
            toast.success("Report resolved");
        } catch {
            toast.error("Failed to resolve");
        }
    };

    const handleBan = async (ip: string) => {
        const reason = prompt("Ban reason:", "Shitposting");
        if (!reason) return;
        try {
            await banUser({
                ip,
                reason,
                duration: 24,
                delete_content: confirm("Delete all content from this IP?")
            }).unwrap();
            toast.success("User banned");
            refetchReports();
        } catch {
            toast.error("Ban failed");
        }
    };

    return (
        <div className="container mx-auto p-6">
            <div className="flex items-center gap-2 mb-8">
                <Shield className="h-8 w-8 text-destructive" />
                <h1 className="text-3xl font-bold">Admin Command Center</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <StatCard title="Total Posts" value={stats?.total_posts} icon={Activity} />
                <StatCard title="Total Bans" value={stats?.total_bans} icon={Ban} />
                <StatCard title="Open Reports" value={stats?.open_reports} icon={Shield} color="text-destructive" />
            </div>

            <Tabs defaultValue="reports" className="w-full">
                <TabsList>
                    <TabsTrigger value="reports">Reports ({stats?.open_reports || 0})</TabsTrigger>
                    <TabsTrigger value="logs">Audit Logs</TabsTrigger>
                </TabsList>

                <TabsContent value="reports" className="space-y-4">
                    {reports?.map(report => (
                        <Card key={report.id} className="border-destructive/20 bg-destructive/5">
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <CardTitle className="text-base font-medium">
                                        Report #{report.id}: <span className="font-bold text-destructive">{report.reason}</span>
                                    </CardTitle>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="destructive" onClick={() => handleBan(report.post?.ip_address || '')}>
                                            <Ban className="w-4 h-4 mr-1" /> Ban IP
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => handleResolve(report.id)}>
                                            <CheckCircle className="w-4 h-4 mr-1" /> Resolve
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm">
                                <div className="bg-background p-3 rounded border mb-2">
                                    <p className="text-xs text-muted-foreground mb-1">
                                        Offender IP: {report.post?.ip_address} | Post #{report.post?.id}
                                    </p>
                                    <p>{report.post?.content || "[Content Deleted]"}</p>
                                    {report.images.length > 0 && (
                                        <div className="flex gap-2 mt-2">
                                            {report.images.map(img => (
                                                <img
                                                    key={img.id}
                                                    src={`/media/${img.thumbnail_url}`}
                                                    className="h-16 w-16 object-cover rounded"
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-end">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:bg-destructive/10"
                                        onClick={async () => {
                                            if(confirm("Delete this post?")) {
                                                await deleteContent({ id: report.post!.id, type_: 'post' }).unwrap();
                                                refetchReports();
                                            }
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4 mr-1" /> Delete Content
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    {reports?.length === 0 && <p className="text-muted-foreground text-center py-10">No open reports. Good job!</p>}
                </TabsContent>

                <TabsContent value="logs">
                    <div className="p-4 border rounded bg-muted/20">
                        Logs implementation placeholder...
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function StatCard({ title, value, icon: Icon, color }: any) {
    return (
        <Card>
            <CardContent className="p-6 flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium text-muted-foreground">{title}</p>
                    <h2 className={`text-2xl font-bold ${color}`}>{value ?? '-'}</h2>
                </div>
                <Icon className={`h-8 w-8 text-muted-foreground opacity-20`} />
            </CardContent>
        </Card>
    );
}
