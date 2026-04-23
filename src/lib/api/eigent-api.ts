/**
 * Eigent REST API
 * 
 * API REST pública para expor funcionalidades do Eigent.
 * Permite integração com agentes externos, automações e webhooks.
 * 
 * @version 1.0.0
 */

import { z } from 'zod';

// ===== Schemas =====

export const AgentRunRequestSchema = z.object({
  input: z.string().min(1).max(10000),
  model: z.string().optional().default('gpt-4'),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().min(1).max(4000).optional().default(1000),
  context: z.record(z.any()).optional(),
  plugins: z.array(z.string()).optional(),
});

export const AgentRunResponseSchema = z.object({
  output: z.string(),
  model: z.string(),
  tokens: z.number(),
  finishReason: z.enum(['stop', 'length', 'content_filter']),
 latency: z.number(), // ms
});

export const PluginStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  enabled: z.boolean(),
  capabilities: z.array(z.string()),
});

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  status: z.enum(['online', 'offline', 'loading']),
  contextWindow: z.number(),
});

// ===== API Routes =====

export const EigentAPI = {
  
  // ===== Agent Routes =====
  
  /**
   * POST /api/agent/run
   * Executa um agent com o input fornecido
   */
  async runAgent(request: z.infer<typeof AgentRunRequestSchema>): Promise<z.infer<typeof AgentRunResponseSchema>> {
    const start = Date.now();
    
    const response = await fetch('/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      throw new Error(`Agent run failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    return {
      ...result,
      latency: Date.now() - start,
    };
  },
  
  /**
   * GET /api/agent/models
   * Lista modelos disponíveis
   */
  async listModels(): Promise<z.infer<typeof ModelSchema>[]> {
    const response = await fetch('/api/agent/models');
    return response.json();
  },
  
  /**
   * POST /api/agent/stream
   * Executa agent com streaming de resposta
   */
  async* streamAgent(input: string, options?: Partial<AgentRunRequestSchema>) {
    const response = await fetch('/api/agent/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, ...options }),
    });
    
    if (!response.body) {
      throw new Error('No streaming support');
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        yield chunk;
      }
    } finally {
      reader.releaseLock();
    }
  },
  
  // ===== Project Routes =====
  
  /**
   * GET /api/projects
   * Lista todos os projetos
   */
  async listProjects(): Promise<z.infer<typeof ProjectSchema>[]> {
    const response = await fetch('/api/projects');
    return response.json();
  },
  
  /**
   * POST /api/projects
   * Cria novo projeto
   */
  async createProject(data: { name: string; description?: string }) {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },
  
  /**
   * GET /api/projects/:id
   * Busca projeto por ID
   */
  async getProject(id: string) {
    const response = await fetch(`/api/projects/${id}`);
    return response.json();
  },
  
  /**
   * DELETE /api/projects/:id
   * Deleta projeto
   */
  async deleteProject(id: string) {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  },
  
  // ===== Plugin Routes =====
  
  /**
   * GET /api/plugins
   * Lista plugins instalados
   */
  async listPlugins(): Promise<z.infer<typeof PluginStatusSchema>[]> {
    const response = await fetch('/api/plugins');
    return response.json();
  },
  
  /**
   * POST /api/plugins/:id/enable
   * Habilita plugin
   */
  async enablePlugin(pluginId: string) {
    const response = await fetch(`/api/plugins/${pluginId}/enable`, { method: 'POST' });
    return response.json();
  },
  
  /**
   * POST /api/plugins/:id/disable
   * Desabilita plugin
   */
  async disablePlugin(pluginId: string) {
    const response = await fetch(`/api/plugins/${pluginId}/disable`, { method: 'POST' });
    return response.json();
  },
  
  // ===== Webhook Routes =====
  
  /**
   * POST /api/webhooks
   * Registra novo webhook
   */
  async registerWebhook(url: string, events: string[]) {
    const response = await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, events }),
    });
    return response.json();
  },
  
  /**
   * DELETE /api/webhooks/:id
   * Remove webhook
   */
  async deleteWebhook(webhookId: string) {
    await fetch(`/api/webhooks/${webhookId}`, { method: 'DELETE' });
  },
  
  // ===== Health =====
  
  /**
   * GET /api/health
   * Status da API
   */
  async health() {
    const response = await fetch('/api/health');
    return response.json();
  },
};

// ===== OpenAPI Spec =====

export const OpenAPISpec = {
  openapi: '3.1.0',
  info: {
    title: 'Eigent API',
    description: 'REST API for Eigent Desktop Cowork AI Agent',
    version: '1.0.0',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local development' },
    { url: 'https://api.eigent.ai', description: 'Production' },
  ],
  paths: {
    '/api/health': {
      get: {
        summary: 'Health check',
        responses: { '200': { description: 'API is healthy' } },
      },
    },
    '/api/agent/run': {
      post: {
        summary: 'Run agent',
        requestBody: {
          content: {
            'application/json': {
              schema: AgentRunRequestSchema,
            },
          },
        },
        responses: {
          '200': { description: 'Agent response', content: { 'application/json': { schema: AgentRunResponseSchema } } },
        },
      },
    },
    '/api/agent/stream': {
      post: {
        summary: 'Run agent with streaming',
        responses: {
          '200': { description: 'Streaming response', content: { 'text/event-stream': {} } },
        },
      },
    },
    '/api/projects': {
      get: {
        summary: 'List projects',
        responses: { '200': { description: 'List of projects' } },
      },
      post: {
        summary: 'Create project',
        responses: { '201': { description: 'Project created' } },
      },
    },
    '/api/plugins': {
      get: {
        summary: 'List plugins',
        responses: { '200': { description: 'List of plugins' } },
      },
    },
  },
};

export default EigentAPI;