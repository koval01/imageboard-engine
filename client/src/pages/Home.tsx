import { useGetHomeQuery } from '@/store/apiSlice';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';

export default function Home() {
    const { data, isLoading } = useGetHomeQuery();

    if (isLoading) return <div>Loading...</div>;

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-6">Welcome to Imageboard</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data?.boards.map(b => (
                    <Link key={b.model.slug} to={`/${b.model.slug}`}>
                        <Card className="p-4 hover:bg-accent transition">
                            <h2 className="text-xl font-bold">/{b.model.slug}/ - {b.model.name}</h2>
                            <p className="text-muted-foreground">{b.model.description}</p>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
