import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/router';

export default function Home() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !isLoading && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [mounted, isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated) {
      window.location.replace('https://gr8bux.com');
    }
  }, [mounted, isLoading, isAuthenticated]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
    </div>
  );
}
