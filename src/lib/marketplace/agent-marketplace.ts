/**
 * Eigent Agent Marketplace
 * 
 * Marketplace para agents pré-configurados.
 * Permite descoberta, instalação e atualização de agents.
 * 
 * @version 1.0.0
 */

import { z } from 'zod';

// ===== Schemas =====

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  author: z.string(),
  
  // Metadata
  tags: z.array(z.string()),
  category: z.enum([
    'coding',
    'writing', 
    'research',
    'productivity',
    'creative',
    'utility',
    'enterprise',
  ]),
  
  // Pricing
  pricing: z.object({
    type: z.enum(['free', 'one-time', 'subscription']),
    price: z.number().optional(), // em centavos
    currency: z.string().default('USD'),
  }),
  
  // Capabilities
  capabilities: z.array(z.string()),
  requirements: z.object({
    minContext: z.number().default(4000),
    apiKeys: z.array(z.string()).optional(),
    plugins: z.array(z.string()).optional(),
  }),
  
  // Ratings & Stats
  ratings: z.object({
    average: z.number().min(0).max(5),
    count: z.number(),
  }),
  downloads: z.number(),
  
  // Media
  icon: z.string().url().optional(),
  screenshots: z.array(z.string().url()).optional(),
  
  // Links
  homepage: z.string().url().optional(),
  documentation: z.string().url().optional(),
  sourceUrl: z.string().url().optional(),
  license: z.string().default('MIT'),
  
  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Agent = z.infer<typeof AgentSchema>;

// ===== Agent Categories =====

export const CATEGORIES = {
  coding: {
    name: 'Coding',
    emoji: '💻',
    description: 'Assistentes de programação e desenvolvimento',
  },
  writing: {
    name: 'Writing',
    emoji: '✍️',
    description: 'Assistentes de escrita e conteúdo',
  },
  research: {
    name: 'Research',
    emoji: '🔍',
    description: 'Pesquisa e análise',
  },
  productivity: {
    name: 'Productivity',
    emoji: '⚡',
    description: 'Produtividade e automação',
  },
  creative: {
    name: 'Creative',
    emoji: '🎨',
    description: 'Criatividade e arte',
  },
  utility: {
    name: 'Utility',
    emoji: '🔧',
    description: 'Ferramentas utilitárias',
  },
  enterprise: {
    name: 'Enterprise',
    emoji: '🏢',
    description: 'Soluções empresariais',
  },
} as const;

// ===== Featured Agents =====

export const FEATURED_AGENTS: Agent[] = [
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Analisa código, sugere melhorias e identifica bugs antes do merge.',
    version: '2.0.0',
    author: 'Eigent',
    tags: ['code review', 'quality', 'security'],
    category: 'coding',
    pricing: { type: 'free' },
    capabilities: ['analyze', 'suggest', 'security-scan'],
    requirements: { minContext: 8000 },
    ratings: { average: 4.8, count: 256 },
    downloads: 15420,
    icon: 'https://eigent.ai/agents/code-reviewer.png',
    homepage: 'https://eigent.ai/agents/code-reviewer',
    license: 'MIT',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2026-04-20T00:00:00Z',
  },
  {
    id: 'tech-writer',
    name: 'Tech Writer',
    description: 'Transforma código em documentação clara e maintainable.',
    version: '1.5.0',
    author: 'Eigent',
    tags: ['documentation', 'docs', 'readme'],
    category: 'writing',
    pricing: { type: 'free' },
    capabilities: ['generate-docs', 'readme', 'api-docs'],
    requirements: { minContext: 4000 },
    ratings: { average: 4.6, count: 189 },
    downloads: 8930,
    license: 'MIT',
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2026-03-15T00:00:00Z',
  },
  {
    id: 'security-auditor',
    name: 'Security Auditor',
    description: 'Escaneia vulnerabilidades e sugere correções de segurança.',
    version: '1.0.0',
    author: 'Eigent',
    tags: ['security', 'audit', 'vulnerability'],
    category: 'coding',
    pricing: { type: 'subscription', price: 999, currency: 'USD' },
    capabilities: ['scan', 'detect', 'report'],
    requirements: { minContext: 8000, apiKeys: ['snsyk'] },
    ratings: { average: 4.9, count: 67 },
    downloads: 2340,
    icon: 'https://eigent.ai/agents/security.png',
    homepage: 'https://eigent.ai/agents/security-auditor',
    license: 'Proprietary',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2026-04-10T00:00:00Z',
  },
  {
    id: 'refactor-master',
    name: 'Refactor Master',
    description: 'Refatora código legado, aplica patterns modernos e Best Practices.',
    version: '3.0.0',
    author: 'Community',
    tags: ['refactoring', 'modernization', 'patterns'],
    category: 'coding',
    pricing: { type: 'free' },
    capabilities: ['refactor', 'patterns', 'modernize'],
    requirements: { minContext: 8000 },
    ratings: { average: 4.7, count: 312 },
    downloads: 22100,
    license: 'MIT',
    createdAt: '2024-01-20T00:00:00Z',
    updatedAt: '2026-04-18T00:00:00Z',
  },
];

// ===== Marketplace API =====

export class AgentMarketplace {
  private agents: Map<string, Agent> = new Map();
  private installed: Set<string> = new Set();
  
  constructor() {
    // Carrega agents destaque
    FEATURED_AGENTS.forEach(agent => {
      this.agents.set(agent.id, agent);
    });
  }
  
  /**
   * Lista todos os agents disponíveis
   */
  listAgents(filters?: {
    category?: Agent['category'];
    tags?: string[];
    free?: boolean;
    search?: string;
  }): Agent[] {
    let result = Array.from(this.agents.values());
    
    if (filters?.category) {
      result = result.filter(a => a.category === filters.category);
    }
    
    if (filters?.free) {
      result = result.filter(a => a.pricing.type === 'free');
    }
    
    if (filters?.search) {
      const query = filters.search.toLowerCase();
      result = result.filter(a => 
        a.name.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query) ||
        a.tags.some(t => t.toLowerCase().includes(query))
      );
    }
    
    if (filters?.tags) {
      result = result.filter(a => 
        filters.tags!.some(tag => a.tags.includes(tag))
      );
    }
    
    return result.sort((a, b) => b.downloads - a.downloads);
  }
  
  /**
   * Busca agent por ID
   */
  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }
  
  /**
   * Instala um agent
   */
  async install(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    
    // Verifica requisitos
    if (agent.requirements.apiKeys?.length) {
      const missing = agent.requirements.apiKeys.filter(
        key => !localStorage.getItem(`apikey_${key}`)
      );
      if (missing.length) {
        throw new Error(`Missing API keys: ${missing.join(', ')}`);
      }
    }
    
    this.installed.add(agentId);
    
    // Salva no localStorage
    localStorage.setItem('installed_agents', 
      JSON.stringify([...this.installed])
    );
  }
  
  /**
   * Desinstala um agent
   */
  uninstall(agentId: string): void {
    this.installed.delete(agentId);
    localStorage.setItem('installed_agents', 
      JSON.stringify([...this.installed])
    );
  }
  
  /**
   * Lista agents instalados
   */
  listInstalled(): Agent[] {
    return [...this.installed].map(id => this.agents.get(id)!).filter(Boolean);
  }
  
  /**
   * Verifica se agent está instalado
   */
  isInstalled(agentId: string): boolean {
    return this.installed.has(agentId);
  }
  
  /**
   * Avalia um agent
   */
  async rate(agentId: string, rating: number): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    // Recalcula média
    const newCount = agent.ratings.count + 1;
    const newAverage = (
      (agent.ratings.average * agent.ratings.count + rating) / newCount
    );
    
    this.agents.set(agentId, {
      ...agent,
      ratings: {
        count: newCount,
        average: Math.round(newAverage * 10) / 10,
      },
    });
  }
  
  /**
   * Registra novo agent no marketplace
   */
  register(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }
}

// ===== UI Components =====

export function AgentCard({ agent, onInstall, onRate }: {
  agent: Agent;
  onInstall?: (id: string) => void;
  onRate?: (id: string, rating: number) => void;
}) {
  const isInstalled = AgentMarketplace.isInstalled(agent.id);
  const category = CATEGORIES[agent.category];
  
  return (
    <Card className="agent-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <Badge variant="outline">{category.emoji} {category.name}</Badge>
          {agent.pricing.type === 'free' ? (
            <Badge variant="secondary">Free</Badge>
          ) : (
            <span className="text-sm font-semibold">
              ${agent.pricing.price! / 100}/{agent.pricing.currency === 'USD' ? 'mo' : ''}
            </span>
          )}
        </div>
        <CardTitle>{agent.name}</CardTitle>
        <CardDescription>{agent.description}</CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="flex gap-2 flex-wrap">
          {agent.tags.map(tag => (
            <Badge key={tag} variant="ghost">{tag}</Badge>
          ))}
        </div>
        
        <div className="flex items-center gap-4 mt-4">
          <div className="flex items-center gap-1">
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            <span>{agent.ratings.average}</span>
            <span className="text-muted-foreground">({agent.ratings.count})</span>
          </div>
          <div className="flex items-center gap-1">
            <Download className="w-4 h-4" />
            <span>{agent.downloads.toLocaleString()}</span>
          </div>
        </div>
      </CardContent>
      
      <CardFooter>
        <Button 
          onClick={() => onInstall?.(agent.id)}
          disabled={isInstalled}
        >
          {isInstalled ? 'Installed' : 'Install'}
        </Button>
        <Button variant="outline" asChild>
          <a href={agent.documentation} target="_blank">
            Docs
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function Marketplace() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Agent['category'] | null>(null);
  const [showFree, setShowFree] = useState(false);
  
  const marketplace = new AgentMarketplace();
  const agents = marketplace.listAgents({
    category: category ?? undefined,
    search: search || undefined,
    free: showFree,
  });
  
  return (
    <div className="marketplace">
      {/* Search & Filters */}
      <div className="flex gap-4 mb-6">
        <Input 
          placeholder="Search agents..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1"
        />
        <Select value={category ?? ''} onChange={e => setCategory(e.target.value as any)}>
          <SelectTrigger>
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORIES).map(([key, { name, emoji }]) => (
              <SelectItem key={key} value={key}>
                {emoji} {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Switch checked={showFree} onChange={setShowFree} />
        <Label>Free only</Label>
      </div>
      
      {/* Featured */}
      {!search && !category && (
        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Featured Agents</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {FEATURED_AGENTS.slice(0, 4).map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </section>
      )}
      
      {/* All Agents */}
      <section>
        <h2 className="text-2xl font-bold mb-4">
          {category ? CATEGORIES[category].name : 'All Agents'}
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default AgentMarketplace;