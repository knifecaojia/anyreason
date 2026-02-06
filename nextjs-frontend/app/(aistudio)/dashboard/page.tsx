"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { Users, Video, Film, HardDrive } from "lucide-react";
import type { LucideIcon } from "lucide-react";

function StatCard({
  label,
  value,
  trend,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  trend: string;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-6 flex items-start justify-between hover:border-border/80 transition-colors">
      <div>
        <p className="text-textMuted text-sm font-medium mb-1">{label}</p>
        <h3 className="text-3xl font-bold text-textMain tracking-tight">{value}</h3>
        <p
          className={`text-xs mt-2 ${
            trend.startsWith("+") ? "text-green-400" : "text-red-400"
          }`}
        >
          {trend} 较上月
        </p>
      </div>
      <div className={`p-3 rounded-xl ${color} bg-opacity-10`}>
        <Icon size={24} className={color.replace("bg-", "text-")} />
      </div>
    </div>
  );
}

const data = [
  { name: "Jan", output: 4, cost: 2400 },
  { name: "Feb", output: 3, cost: 1398 },
  { name: "Mar", output: 9, cost: 9800 },
  { name: "Apr", output: 6, cost: 3908 },
  { name: "May", output: 8, cost: 4800 },
  { name: "Jun", output: 12, cost: 6800 },
];

export default function Page() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-textMain mb-2">欢迎回来, 李策划</h2>
        <p className="text-textMuted">这里是您的漫剧制作效率中心。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="在制剧集" value="12" trend="+2" icon={Film} color="bg-blue-500" />
        <StatCard label="AI 生成时长" value="324m" trend="+15%" icon={Video} color="bg-purple-500" />
        <StatCard label="团队成员" value="28" trend="+4" icon={Users} color="bg-green-500" />
        <StatCard label="资产总数" value="1.2k" trend="+120" icon={HardDrive} color="bg-orange-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-96">
        <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-6 flex flex-col">
          <h3 className="text-lg font-semibold mb-6">产能趋势 (Output Trend)</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#94A3B8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#94A3B8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1F222E",
                    border: "1px solid #2D3748",
                    borderRadius: "8px",
                  }}
                  itemStyle={{ color: "#E2E8F0" }}
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                />
                <Bar dataKey="output" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col">
          <h3 className="text-lg font-semibold mb-6">成本消耗 (Cost)</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#94A3B8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1F222E",
                    border: "1px solid #2D3748",
                    borderRadius: "8px",
                  }}
                  itemStyle={{ color: "#E2E8F0" }}
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="#06B6D4"
                  strokeWidth={3}
                  dot={{ fill: "#06B6D4", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-r from-blue-900/40 to-surface border border-blue-500/20 rounded-2xl p-8 flex flex-col items-start justify-center">
          <h3 className="text-xl font-bold text-blue-100 mb-2">开始新的漫剧项目</h3>
          <p className="text-blue-200/60 mb-6 text-sm">
            使用 AI 辅助从剧本到分镜的全流程创作。
          </p>
          <button className="bg-primary hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition-colors">
            立即创建
          </button>
        </div>
        <div className="bg-gradient-to-r from-purple-900/40 to-surface border border-purple-500/20 rounded-2xl p-8 flex flex-col items-start justify-center">
          <h3 className="text-xl font-bold text-purple-100 mb-2">资产库批量导入</h3>
          <p className="text-purple-200/60 mb-6 text-sm">拖拽上传角色模型、场景Lora或道具素材。</p>
          <button className="bg-surfaceHighlight hover:bg-surface border border-purple-500/50 text-purple-300 px-6 py-2 rounded-lg font-medium transition-colors">
            管理资产
          </button>
        </div>
      </div>
    </div>
  );
}
