import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">系統載入中...</div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return <>{children}</>;
}