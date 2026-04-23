/**
 * Sample Plugin - Exemplo de plugin para Eigent
 * 
 * Este demo mostra como criar um agent customizado.
 */

import { Plugin, PluginAPI } from '../index';

/**
 * Custom agent que adiciona contexto automaticamente
 */
const sampleAgentPlugin: Plugin = {
  manifest: {
    id: 'sample-agent',
    name: 'Sample Agent',
    version: '1.0.0',
    description: 'Adiciona contexto automático às conversas',
    author: 'Eigent',
    capabilities: ['agent'],
    permissions: ['storage'],
  },
  
  // Called when plugin is loaded
  async onLoad() {
    console.log('✅ Sample Agent Plugin loaded');
  },
  
  // Called before agent runs
  async beforeAgentRun(context: any) {
    // Adiciona system prompt com contexto adicional
    const userContext = localStorage.getItem('user_preferences') || 'Nenhuma preferência';
    
    return {
      ...context,
      input: `[Contexto do usuário]\n${userContext}\n\n${context.input}`,
    };
  },
  
  // Called after agent runs
  async afterAgentRun(result: any) {
    console.log(`✅ Agent executou em ${result.tokens} tokens`);
    return result;
  },
};

// ===== Plugin Entry Point =====

export default sampleAgentPlugin;

// Auto-register in development
if (import.meta.env.DEV) {
  PluginAPI.register(sampleAgentPlugin);
}