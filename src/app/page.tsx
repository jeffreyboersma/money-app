import Dashboard from '@/components/Dashboard';

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-12 text-center">
          <h1 className="text-4xl tracking-wider text-foreground sm:text-5xl md:text-6xl">
            <span className="block font-thin tracking-wider text-muted-foreground">soldi</span>
          </h1>
        </header>

        <Dashboard />
      </div>
    </main>
  );
}
