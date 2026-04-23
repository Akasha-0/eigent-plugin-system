# Eigent Plugin System & REST API

Sistema de plugins e API REST para o Eigent — Desktop Cowork AI Agent.

## 🏗️ Arquitetura

```
eigent-plugin-system/
├── src/lib/
│   ├── plugin-system/          # Sistema de plugins
│   │   ├── index.ts            # Core do sistema
│   │   ├── templates/          # Templates de plugins
│   │   └── examples/           # Exemplos
│   └── api/                    # REST API
│       ├── eigent-api.ts       # Client TypeScript
│       └── server.py           # Backend FastAPI
```

## 🔌 Plugin System

### Conceitos

- **Plugin**: Extensão que expoe funcionalidades ao Eigent
- **Capability**: Tipo de funcionalidade exposta (agent, connector, ui, storage, api)
- **Hook**: Ponto de interceptação no ciclo de vida do agent
- **Permission**: Permissão requerida pelo plugin

### Tipos de Capability

| Capability | Descrição |
|------------|-----------|
| `agent` | Adiciona comportamento customizado ao agent |
| `connector` | Conecta com serviços externos |
| `ui` | Adiciona componentes de interface |
| `storage` | Persistência customizada |
| `api` | Expõe rotas REST próprias |
| `middleware` | Intercepta e modifica requisições |

### Criando um Plugin

```typescript
import { Plugin, PluginAPI } from './index';

const myPlugin: Plugin = {
  manifest: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'Descrição do plugin',
    capabilities: ['agent'],
    permissions: ['network'],
  },
  
  async onLoad() {
    console.log('Plugin carregado!');
  },
  
  async beforeAgentRun(context) {
    // Modifica contexto antes de executar
    return { ...context, input: `[context] ${context.input}` };
  },
  
  async afterAgentRun(result) {
    // Processa resultado após execução
    return result;
  },
};

// Auto-registro em desenvolvimento
PluginAPI.register(myPlugin);
```

### Plugin Manifest

```json
{
  "id": "unique-plugin-id",
  "name": "Nome do Plugin",
  "version": "1.0.0",
  "description": "Descrição",
  "author": "Autor",
  "capabilities": ["agent", "ui"],
  "dependencies": {},
  "entry": "dist/index.js",
  "permissions": ["network", "storage"]
}
```

## 🌐 REST API

### Endpoints

#### Health Check

```bash
GET /api/health
```

#### Agent

```bash
# Executar agent
POST /api/agent/run
{
  "input": "Sua pergunta",
  "model": "gpt-4",
  "temperature": 0.7,
  "maxTokens": 1000
}

# Streaming
POST /api/agent/stream

# Listar modelos
GET /api/agent/models
```

#### Projects

```bash
# Listar
GET /api/projects

# Criar
POST /api/projects
{ "name": "Meu Projeto", "description": "..." }

# Buscar
GET /api/projects/:id

# Deletar
DELETE /api/projects/:id
```

#### Plugins

```bash
# Listar
GET /api/plugins

# Habilitar
POST /api/plugins/:id/enable

# Desabilitar
POST /api/plugins/:id/disable
```

#### Webhooks

```bash
# Registrar
POST /api/webhooks
{ "url": "https://...", "events": ["agent.run"] }

# Remover
DELETE /api/webhooks/:id
```

### Cliente TypeScript

```typescript
import { EigentAPI } from './eigent-api';

// Executar agent
const result = await EigentAPI.runAgent({
  input: 'Hello!',
  model: 'gpt-4',
});

// Streaming
for await (const chunk of EigentAPI.streamAgent('Hello')) {
  process.stdout.write(chunk);
}

// Projetos
const projects = await EigentAPI.listProjects();
```

## 🔒 Segurança

- Todos os endpoints requerem autenticação (exceto `/api/health`)
- Tokens de API via header `Authorization: Bearer <token>`
- Plugins requerem aprovação antes de serem habilitados
- Webhooks usam HTTPS obrigatório

## 📦 Instalação

```bash
# Clonar repo
git clone https://github.com/Akasha-0/eigent-plugin-system.git
cd eigent-plugin-system

# Backend
pip install fastapi uvicorn pydantic
python src/lib/api/server.py

# Frontend (integrar ao Eigent)
# Adicionar ao tsconfig.json paths:
# "@/lib/plugin-system": ["./src/lib/plugin-system"]
```

## 🚀 Deploy

### Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY src/lib/api/ .
RUN pip install fastapi uvicorn pydantic
EXPOSE 3000
CMD ["python", "server.py"]
```

### Railway / Render

Adicione `server.py` como entry point com:
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn server:app --host 0.0.0.0 --port $PORT`

## 📖 Recursos

- [Documentação completa](https://eigent.ai/docs)
- [Exemplos de plugins](./src/lib/plugin-system/examples)
- [Cookbook](https://eigent.ai/docs/plugins/cookbook)

## 📝 Licença

MIT License - see LICENSE file