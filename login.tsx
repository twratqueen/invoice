import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoginPending } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      toast({
        title: "錯誤",
        description: "請輸入用戶名和密碼",
        variant: "destructive",
      });
      return;
    }

    try {
      await login({ username, password });
      toast({
        title: "登入成功",
        description: "歡迎使用電子發票管理系統",
      });
      // Redirect after successful login
      window.location.href = "/dashboard";
    } catch (error) {
      toast({
        title: "登入失敗",
        description: "請檢查用戶名和密碼",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">電子發票管理系統</CardTitle>
          <CardDescription className="text-center">
            請登入您的帳號
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用戶名</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="請輸入用戶名"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密碼</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="請輸入密碼"
                required
              />
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoginPending}
            >
              {isLoginPending ? "登入中..." : "登入"}
            </Button>
          </form>
          
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-sm font-medium text-blue-800 mb-2">測試帳號</h3>
            <div className="text-sm text-blue-600">
              <p>管理員：admin / admin123</p>
              <p>操作員：operator / operator123</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}