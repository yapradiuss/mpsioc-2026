"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, AlertCircle } from "lucide-react";
import { logActivity } from "@/lib/audit-logger";
import { isAuthenticated } from "@/lib/auth";
import { API_BASE_URL } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check authentication once on mount
  useEffect(() => {
    if (isAuthenticated()) {
      const redirectTo = searchParams.get('redirect') || '/admin';
      router.replace(redirectTo);
    }
  }, [router, searchParams]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || data.error || `Login failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Login failed');
      }

      // Store auth data
      localStorage.setItem('user', JSON.stringify(data.user));
      const token = data.token || 'authenticated';
      localStorage.setItem('token', token);
      document.cookie = `auth_token=${token}; path=/; max-age=${604800}; SameSite=Lax`;
      
      // Notify other components
      window.dispatchEvent(new Event('userUpdated'));
      
      // Log activity (non-blocking)
      logActivity({
        action: 'LOGIN',
        category: 'SECURITY',
        resource: 'Authentication',
        description: `User logged in: ${data.user.username}`,
        status: 'SUCCESS',
      });

      // Redirect
      router.push(searchParams.get('redirect') || '/admin');
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to login. Please check your credentials.';
      setError(errorMessage);
      
      // Log failed attempt (non-blocking)
      if (username) {
        logActivity({
          action: 'LOGIN',
          category: 'SECURITY',
          resource: 'Authentication',
          description: `Failed login attempt: ${username}`,
          status: 'FAILED',
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [username, password, isLoading, router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative bg-cover bg-center bg-no-repeat bg-[url('/MPsepang_a.jpg.png')]">
      <div className="absolute inset-0 bg-black/40" />
      <Card className="w-full max-w-md relative z-10">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <Image
              src="/Logo_mpsepang.png"
              alt="MPSepang Logo"
              width={120}
              height={120}
              className="object-contain"
              priority
              loading="eager"
            />
          </div>
          <CardTitle className="text-3xl font-bold">MPSepang Admin</CardTitle>
          <CardDescription>Sign in to your account to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  className="pl-9"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={isLoading}
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Sign In
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

