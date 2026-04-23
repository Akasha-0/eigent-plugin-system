/**
 * Eigent Plugin System
 * 
 * Arquitetura de plugins para extensões do Eigent.
 * Permite que terceiros estendam funcionalidades sem modificar o core.
 * 
 * @version 1.0.0
 */

import { z } from 'zod';

// ===== Tipos do Plugin =====

export const PluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().url().optional(),
  license: z.string().default('MIT'),
  
  // Capabilities que o plugin expose
  capabilities: z.array(z.enum([
    'agent',
    'connector', 
    'ui',
    'storage',
    'api',
    'middleware',
  ])).default(['agent']),
  
  // Dependências de outros plugins
  dependencies: z.record(z.string()).optional(),
  
  // Entry points
  entry: z.string().default('index.js'),
  
  //Permissões requeridas
  permissions: z.array(z.enum([
    'filesystem',
    'network',
    'exec',
    'storage',
    'clipboard',
    'notifications',
  ])).default([]),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export interface Plugin {
  manifest: PluginManifest;
  
  // Lifecycle
  onLoad?: () => Promise<void> | void;
  onUnload?: () => Promise<void> | void;
  onEnable?: () => Promise<void> | void;
  onDisable?: () => Promise<void> | void;
  
  // Agent hooks
  beforeAgentRun?: (context: AgentContext) => Promise<AgentContext> | AgentContext;
  afterAgentRun?: (result: AgentResult) => Promise<AgentResult>;
  
  // UI hooks
  renderSidebar?: () => React.ReactNode;
  renderSettings?: () => React.ReactNode;
  
  // API routes
  routes?: PluginRoute[];
}

export interface AgentContext {
  input: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  plugins: string[];
}

export interface AgentResult {
  output: string;
  model: string;
  tokens: number;
 FinishReason: 'stop' | 'length' | 'content_filter';
}

export interface PluginRoute {
  path: string;
  method: 'get' | 'post' | 'put' | 'delete';
  handler: (req: Request, res: Response) => Promise<Response>;
}

// ===== Plugin Loader =====

class PluginLoader {
  private plugins = new Map<string, Plugin>();
  private enabledPlugins = new Set<string>();
  
  /**
   * Carrega um plugin de um diretório
   */
  async loadFromDir(dirPath: string): Promise<Plugin> {
    const manifestPath = path.join(dirPath, 'plugin.json');
    const manifest: PluginManifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    
    const plugin: Plugin = {
      manifest,
      ...require(path.join(dirPath, manifest.entry)),
    };
    
    // Valida dependências
    if (manifest.dependencies) {
      for (const [depId, version] of Object.entries(manifest.dependencies)) {
        if (!this.plugins.has(depId)) {
          throw new Error(`Missing dependency: ${depId} v${version}`);
        }
      }
    }
    
    this.plugins.set(manifest.id, plugin);
    return plugin;
  }
  
  /**
   * Habilita um plugin carregado
   */
  async enable(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginId}`);
    }
    
    await plugin.onEnable?.();
    this.enabledPlugins.add(pluginId);
  }
  
  /**
   * Desabilita um plugin
   */
  async disable(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    
    await plugin.onDisable?.();
    this.enabledPlugins.delete(pluginId);
  }
  
  /**
   * Lista plugins habilitados
   */
  getEnabled(): Plugin[] {
    return Array.from(this.enabledPlugins).map(id => this.plugins.get(id)!;
  }
  
  /**
   * Processa hook de agent
   */
  async processAgentHook(
    hook: 'beforeAgentRun' | 'afterAgentRun',
    context: AgentContext | AgentResult
  ): Promise<AgentContext | AgentResult> {
    let result = context;
    
    for (const pluginId of this.enabledPlugins) {
      const plugin = this.plugins.get(pluginId)!;
      const hookFn = plugin[hook];
      if (hookFn) {
        result = await hookFn(result as any);
      }
    }
    
    return result;
  }
}

// ===== API Exposta =====

export const PluginAPI = {
  // Registro
  register: (plugin: Plugin) => plugins.plugins.set(plugin.manifest.id, plugin),
  unregister: (pluginId: string) => plugins.plugins.delete(pluginId),
  
  // Lifecycle
  enable: (pluginId: string) => plugins.enable(pluginId),
  disable: (pluginId: string) => plugins.disable(pluginId),
  
  // Query
  list: () => Array.from(plugins.plugins.values()),
  listEnabled: () => plugins.getEnabled(),
  get: (pluginId: string) => plugins.plugins.get(pluginId),
  
  // Hooks
  beforeAgentRun: (context: AgentContext) => plugins.processAgentHook('beforeAgentRun', context),
  afterAgentRun: (result: AgentResult) => plugins.processAgentHook('afterAgentRun', result),
};

// ===== UI Components =====

export function PluginCard({ plugin }: { plugin: Plugin }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{plugin.manifest.name}</CardTitle>
        <Badge variant="outline">v{plugin.manifest.version}</Badge>
      </CardHeader>
      <CardDescription>{plugin.manifest.description}</CardDescription>
      <CardFooter>
        <div className="flex gap-2">
          {plugin.manifest.capabilities.map(cap => (
            <Badge key={cap} variant="secondary">{cap}</Badge>
          ))}
        </div>
      </CardFooter>
    </Card>
  );
}

export function PluginManager() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  
  // Carrega lista de plugins disponíveis
  useEffect(() => {
    setPlugins(PluginAPI.list());
    setEnabled(new Set(PluginAPI.listEnabled().map(p => p.manifest.id)));
  }, []);
  
  const togglePlugin = async (pluginId: string) => {
    if (enabled.has(pluginId)) {
      await PluginAPI.disable(pluginId);
    } else {
      await PluginAPI.enable(pluginId);
    }
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(pluginId)) next.delete(pluginId);
      else next.add(pluginId);
      return next;
    });
  };
  
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {plugins.map(plugin => (
        <PluginCard key={plugin.manifest.id} plugin={plugin} />
      ))}
    </div>
  );
}