/**
 * Eigent Usage Dashboard
 * 
 * Dashboard de uso e custos para monetização.
 * Tracking de tokens, requests, tempo de uso.
 * 
 * @version 1.0.0
 */

import { z } from 'zod';
import { useState, useEffect, useMemo } from 'react';

// ===== Types =====

export const PricingTierSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(), // centavos
  currency: z.string().default('USD'),
  period: z.enum(['month', 'year', 'one-time']).default('month'),
  
  // Limits
  monthlyTokens: z.number(),
  monthlyRequests: z.number(),
  maxProjects: z.number(),
  maxAgents: z.number(),
  features: z.array(z.string()),
});

export type PricingTier = z.infer<typeof PricingTierSchema>;

export const UsageMetricsSchema = z.object({
  period: z.enum(['day', 'week', 'month']),
  tokensIn: z.number().default(0),
  tokensOut: z.number().default(0),
  totalTokens: z.number().default(0),
  requests: z.number().default(0),
  cost: z.number().default(0), // centavos
  
  // Details
  byModel: z.record(z.object({
    tokens: z.number(),
    requests: z.number(),
    cost: z.number(),
  })).default({}),
});

export type UsageMetrics = z.infer<typeof UsageMetricsSchema>;

export const UsageConfigSchema = z.object({
  // Pricing
  pricingTiers: z.array(PricingTierSchema),
  defaultTier: z.string(),
  
  // Cost per 1K tokens ( centavos)
  costPer1K: z.record(z.number()).default({
    'gpt-4': 30,
    'gpt-3.5-turbo': 2,
    'claude-3-opus': 75,
    'claude-3-sonnet': 15,
    'claude-3-haiku': 1,
    'local-ollama': 0, // free
  }),
  
  // Alerts
  alertThreshold: z.number().default(0.8), // 80%
  alertEmail: z.boolean().default(true),
});

export type UsageConfig = z.infer<typeof UsageConfigSchema>;

// ===== Pricing Tiers =====

export const DEFAULT_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    period: 'month',
    monthlyTokens: 100000,
    monthlyRequests: 100,
    maxProjects: 1,
    maxAgents: 1,
    features: ['basic-chat'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 1900, // $19
    currency: 'USD',
    period: 'month',
    monthlyTokens: 1000000,
    monthlyRequests: 10000,
    maxProjects: 10,
    maxAgents: 5,
    features: ['basic-chat', 'agents', 'projects'],
  },
  {
    id: 'team',
    name: 'Team',
    price: 4900, // $49
    currency: 'USD',
    period: 'month',
    monthlyTokens: 5000000,
    monthlyRequests: 100000,
    maxProjects: 50,
    maxAgents: 20,
    features: ['basic-chat', 'agents', 'projects', 'team', 'api'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 0, // custom
    currency: 'USD',
    period: 'one-time',
    monthlyTokens: -1, // unlimited
    monthlyRequests: -1,
    maxProjects: -1,
    maxAgents: -1,
    features: ['all'],
  },
];

// ===== Usage Tracking =====

class UsageTracker {
  private config: UsageConfig;
  private storage: Map<string, UsageMetrics>;
  
  constructor(config: UsageConfig) {
    this.config = config;
    this.storage = new Map();
  }
  
  /**
   * Registra uso de API
   */
  async recordUsage(params: {
    userId: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    requests?: number;
  }): Promise<void> {
    const period = 'month'; // monthly by default
    const key = `${params.userId}:${period}`;
    
    const cost = this.calculateCost(params.model, params.tokensIn + params.tokensOut);
    
    const current = this.storage.get(key) || {
      period: 'month' as const,
      tokensIn: 0,
      tokensOut: 0,
      totalTokens: 0,
      requests: 0,
      cost: 0,
      byModel: {},
    };
    
    // Update
    current.tokensIn += params.tokensIn;
    current.tokensOut += params.tokensOut;
    current.totalTokens += params.tokensIn + params.tokensOut;
    current.requests += params.requests || 1;
    current.cost += cost;
    
    // By model
    if (!current.byModel[params.model]) {
      current.byModel[params.model] = { tokens: 0, requests: 0, cost: 0 };
    }
    current.byModel[params.model].tokens += params.tokensIn + params.tokensOut;
    current.byModel[params.model].requests += 1;
    current.byModel[params.model].cost += cost;
    
    this.storage.set(key, current);
    
    // Save to storage
    localStorage.setItem('usage_metrics', JSON.stringify([...this.storage]));
  }
  
  /**
   * Calcula custo
   */
  calculateCost(model: string, tokens: number): number {
    const costPer1K = this.config.costPer1K[model] || 10;
    return Math.round((tokens / 1000) * costPer1K);
  }
  
  /**
   * Pega métricas do usuário
   */
  getUsage(userId: string, period: 'day' | 'week' | 'month' = 'month'): UsageMetrics {
    return this.storage.get(`${userId}:${period}`) || {
      period,
      tokensIn: 0,
      tokensOut: 0,
      totalTokens: 0,
      requests: 0,
      cost: 0,
      byModel: {},
    };
  }
  
  /**
   * Calcula % usado do tier
   */
  getUsagePercent(userId: string, tier: PricingTier): number {
    const usage = this.getUsage(userId);
    if (tier.monthlyTokens === -1) return 0; // unlimited
    return (usage.totalTokens / tier.monthlyTokens) * 100;
  }
  
  /**
   * Verifica se pode fazer request
   */
  canMakeRequest(userId: string, tier: PricingTier): boolean {
    const usage = this.getUsage(userId);
    
    if (tier.monthlyRequests === -1) return true;
    if (usage.requests >= tier.monthlyRequests) return false;
    
    if (tier.monthlyTokens === -1) return true;
    if (usage.totalTokens >= tier.monthlyTokens) return false;
    
    return true;
  }
  
  /**
   * Alerta de uso
   */
  getAlerts(userId: string, tier: PricingTier): string[] {
    const alerts: string[] = [];
    const percent = this.getUsagePercent(userId, tier);
    
    if (percent >= this.config.alertThreshold * 100) {
      alerts.push(`You've used ${percent.toFixed(0)}% of your monthly tokens`);
    }
    
    return alerts;
  }
}

// ===== Components =====

export function UsageCard({ 
  metrics, 
  tier,
  onUpgrade,
}: {
  metrics: UsageMetrics;
  tier: PricingTier;
  onUpgrade?: () => void;
}) {
  const percent = tier.monthlyTokens === -1 ? 0 : (metrics.totalTokens / tier.monthlyTokens) * 100;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage This Month</CardTitle>
        <CardDescription>{tier.name} Plan</CardDescription>
      </CardHeader>
      
      <CardContent>
        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span>{metrics.totalTokens.toLocaleString()} / {tier.monthlyTokens.toLocaleString()}</span>
            <span>{percent.toFixed(1)}%</span>
          </div>
          <Progress value={percent} max={100} />
        </div>
        
        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{metrics.tokensIn.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Tokens In</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{metrics.tokensOut.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Tokens Out</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{metrics.requests.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Requests</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">${(metrics.cost / 100).toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">Est. Cost</div>
          </div>
        </div>
        
        {/* By Model */}
        {Object.keys(metrics.byModel).length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">By Model</h4>
            <div className="space-y-2">
              {Object.entries(metrics.byModel).map(([model, data]) => (
                <div key={model} className="flex justify-between text-sm">
                  <span>{model}</span>
                  <span>{data.tokens.toLocaleString()} tokens</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      
      <CardFooter>
        {percent >= 80 && (
          <Button onClick={onUpgrade}>
            Upgrade Plan
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export function PricingTable({ 
  currentTier, 
  onSelect,
}: {
  currentTier: string;
  onSelect: (tierId: string) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Plan</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Tokens</TableHead>
          <TableHead>Features</TableHead>
          <TableHead></TableHead>
        </TableRoot>
      </TableHeader>
      <TableBody>
        {DEFAULT_TIERS.map(tier => (
          <TableRow key={tier.id}>
            <TableCell className="font-medium">{tier.name}</TableCell>
            <TableCell>
              {tier.price === 0 ? (
                'Free'
              ) : tier.price === 0 && tier.id === 'enterprise' ? (
                'Custom'
              ) : (
                `$${(tier.price / 100).toFixed(0)}/${tier.period === 'month' ? 'mo' : 'yr'}`
              )}
            </TableCell>
            <TableCell>
              {tier.monthlyTokens === -1 ? '∞' : tier.monthlyTokens.toLocaleString()}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {tier.features.map(f => (
                  <Badge key={f} variant="outline">{f}</Badge>
                ))}
              </div>
            </TableCell>
            <TableCell>
              {currentTier !== tier.id && (
                <Button 
                  variant={tier.id === currentTier ? 'secondary' : 'default'}
                  onClick={() => onSelect(tier.id)}
                >
                  {currentTier === tier.id ? 'Current' : 'Select'}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function UsageDashboard() {
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
  const [tier, setTier] = useState<PricingTier>(DEFAULT_TIERS[0]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Load from API
    async function load() {
      try {
        const res = await fetch('/api/usage/current');
        const data = await res.json();
        setMetrics(data);
        
        // Find user tier
        const tierRes = await fetch('/api/usage/tier');
        const tierData = await tierRes.json();
        setTier(tierData);
      } catch {
        // Use defaults
      }
      setLoading(false);
    }
    load();
  }, []);
  
  if (loading) return <Spinner>Loading usage...</Spinner>;
  
  return (
    <div className="usage-dashboard">
      <h1 className="text-3xl font-bold mb-6">Usage & Billing</h1>
      
      <div className="grid gap-6 lg:grid-cols-2">
        <UsageCard metrics={metrics!} tier={tier} onUpgrade={() => {}} />
        <PricingTable currentTier={tier.id} onSelect={setTier} />
      </div>
    </div>
  );
}

export default UsageTracker;