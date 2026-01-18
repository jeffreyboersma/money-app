import Image from 'next/image';
import Dashboard from '@/components/Dashboard';

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <header className="mb-12 flex justify-center">
          <Image
            src="/soldi_logo.png"
            alt="soldi"
            width={200}
            height={60}
            priority
            className="object-contain brightness-0 dark:brightness-100"
          />
        </header>

        <Dashboard />
      </div>
    </main>
  );
}
