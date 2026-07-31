import SizeCalculator from '@/components/size-calculator/SizeCalculator';

export const metadata = {
  title: 'Real-Time Size Calculator',
  description: 'Calculate your perfect clothing size using AI and your camera.',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 text-black py-12">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Find Your Perfect Fit
          </h1>
          <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
            Step in front of your camera and let our AI calculate your measurements to recommend the best clothing size for you.
          </p>
        </div>
        
        <SizeCalculator />
      </div>
    </main>
  );
}
