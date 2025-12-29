import Dashboard from '@/components/Dashboard';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl md:text-6xl">
            <span className="block italic text-blue-600">Money App</span>
            <span className="block text-2xl mt-2 font-medium text-slate-600 dark:text-slate-400">All your balances, one view.</span>
          </h1>
        </header>

        <Dashboard />
      </div>
    </main>
  );
}
