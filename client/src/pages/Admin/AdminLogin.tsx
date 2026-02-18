import { useState } from 'react';
import { useAdminLoginMutation } from '@/store/apiSlice';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AdminLogin() {
    const [key, setKey] = useState('');
    const [login, { isLoading, error }] = useAdminLoginMutation();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await login({ key }).unwrap();
            navigate('/admin/dashboard');
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-muted/30">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Restricted Access</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            type="password"
                            placeholder="Service Key"
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                        />
                        {error && <p className="text-destructive text-sm">Invalid key</p>}
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? 'Authenticating...' : 'Login'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
