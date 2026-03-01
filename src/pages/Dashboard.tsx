import { Users, UserX, UserMinus, Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const chartData = [
  { month: "Jan", ativos: 120 },
  { month: "Fev", ativos: 135 },
  { month: "Mar", ativos: 148 },
  { month: "Abr", ativos: 162 },
  { month: "Mai", ativos: 175 },
  { month: "Jun", ativos: 188 },
  { month: "Jul", ativos: 201 },
  { month: "Ago", ativos: 215 },
  { month: "Set", ativos: 228 },
  { month: "Out", ativos: 242 },
  { month: "Nov", ativos: 256 },
  { month: "Dez", ativos: 270 },
];

const clientMetrics = [
  {
    title: "Clientes Ativos",
    value: 270,
    icon: Users,
    gradient: "gradient-primary",
    change: "+12%",
  },
  {
    title: "Clientes Vencidos",
    value: 34,
    icon: UserX,
    gradient: "gradient-warning",
    change: "-5%",
  },
  {
    title: "Clientes Desativados",
    value: 18,
    icon: UserMinus,
    gradient: "gradient-danger",
    change: "-2%",
  },
];

export default function Dashboard() {
  const [showValues, setShowValues] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral do sistema de cobrança
          </p>
        </div>
        <button
          onClick={() => setShowValues(!showValues)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {showValues ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showValues ? "Ocultar valores" : "Mostrar valores"}
        </button>
      </div>

      {/* Client Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {clientMetrics.map((metric) => (
          <Card key={metric.title} className="border-0 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center gap-4 p-5">
                <div className={`h-12 w-12 rounded-xl ${metric.gradient} flex items-center justify-center shrink-0`}>
                  <metric.icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{metric.title}</p>
                  <p className="text-2xl font-bold text-foreground">{metric.value}</p>
                </div>
                <span className={`ml-auto text-xs font-semibold px-2 py-1 rounded-full ${
                  metric.change.startsWith("+") 
                    ? "bg-success/10 text-success" 
                    : "bg-destructive/10 text-destructive"
                }`}>
                  {metric.change}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Financial Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saldo Líquido do Mês</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">Março 2026</p>
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground mt-3">
              {showValues ? "R$ 42.850,00" : "R$ ••••••"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Saldo Líquido do Ano</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">2026</p>
              </div>
            </div>
            <p className="text-3xl font-bold text-foreground mt-3">
              {showValues ? "R$ 128.450,00" : "R$ ••••••"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Clientes Ativados</h3>
              <p className="text-sm text-muted-foreground">
                Período de 01/01/2026 a 31/12/2026
              </p>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorAtivos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(199, 89%, 48%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 90%)" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(220, 10%, 46%)", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(220, 10%, 46%)", fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(0, 0%, 100%)",
                    border: "1px solid hsl(220, 13%, 90%)",
                    borderRadius: "8px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="ativos"
                  stroke="hsl(199, 89%, 48%)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorAtivos)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
