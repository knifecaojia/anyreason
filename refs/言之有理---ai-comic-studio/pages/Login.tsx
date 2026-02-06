
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wand2, Lock, Mail, ArrowRight, Loader2 } from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('password');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      navigate('/dashboard');
    }, 1000);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full grid-bg opacity-40 pointer-events-none" />
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary/20 blur-[100px] rounded-full pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-accent/20 blur-[100px] rounded-full pointer-events-none" />

      {/* Login Card */}
      <div className="w-full max-w-md mx-4 bg-surface/60 backdrop-blur-xl border border-border/50 rounded-3xl p-8 shadow-2xl relative z-10 animate-fade-in-up">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent mb-6 shadow-lg shadow-primary/20">
            <Wand2 className="text-white" size={28} />
          </div>
          <h2 className="text-3xl font-bold text-textMain mb-2">欢迎回来</h2>
          <p className="text-textMuted">登录您的言之有理工作台</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-textMuted ml-1">工作邮箱</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted group-focus-within:text-primary transition-colors" size={20} />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/20 border border-border rounded-xl py-3.5 pl-12 pr-4 text-textMain placeholder-textMuted/50 focus:ring-2 focus:ring-primary/50 focus:border-primary focus:bg-black/10 transition-all outline-none"
                placeholder="name@company.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center ml-1">
              <label className="text-sm font-medium text-textMuted">密码</label>
              <a href="#" className="text-xs text-primary hover:text-blue-400 transition-colors">忘记密码?</a>
            </div>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted group-focus-within:text-primary transition-colors" size={20} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/20 border border-border rounded-xl py-3.5 pl-12 pr-4 text-textMain placeholder-textMuted/50 focus:ring-2 focus:ring-primary/50 focus:border-primary focus:bg-black/10 transition-all outline-none"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                登录平台 <ArrowRight size={20} />
              </>
            )}
          </button>
        </form>
        
        <div className="mt-8 text-center">
           <p className="text-sm text-textMuted">
             还没有账号? <button onClick={() => navigate('/')} className="text-accent hover:text-cyan-400 font-medium transition-colors">联系管理员</button>
           </p>
        </div>
      </div>
    </div>
  );
};
