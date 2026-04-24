"""
Eigent Agent Marketplace API
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

app = FastAPI(
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    title="Eigent Marketplace API",
    description="API for Agent Marketplace operations",
    version="1.0.0",
)

# ===== Models =====

class AgentCategory(str, Enum):
    CODING = "coding"
    WRITING = "writing"
    RESEARCH = "research"
    PRODUCTIVITY = "productivity"
    CREATIVE = "creative"
    UTILITY = "utility"
    ENTERPRISE = "enterprise"

class PricingType(str, Enum):
    FREE = "free"
    ONE_TIME = "one-time"
    SUBSCRIPTION = "subscription"

class AgentBase(BaseModel):
    id: str
    name: str = Field(..., min_length=1)
    description: str
    version: str
    author: str
    tags: List[str] = []
    category: AgentCategory
    pricing_type: PricingType = Field(alias="pricing_type")
    pricing_price: Optional[int] = Field(None, alias="pricing_price")
    pricing_currency: str = "USD"
    capabilities: List[str] = []
    requirements: Dict[str, Any] = {}
    ratings_average: float = 0
    ratings_count: int = 0
    downloads: int = 0
    icon: Optional[str] = None
    screenshots: List[str] = []
    homepage: Optional[str] = None
    documentation: Optional[str] = None
    source_url: Optional[str] = Field(None, alias="sourceUrl")
    license: str = "MIT"
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    
    class Config:
        populate_by_name = True

class AgentInstallRequest(BaseModel):
    agent_id: str

class AgentRatingRequest(BaseModel):
    agent_id: str
    rating: int = Field(..., ge=1, le=5)

# ===== Database (in-memory, replace with DB) =====

agents_db: Dict[str, AgentBase] = {}
installed_db: Dict[str, set] = {}

# Featured agents seed data
FEATURED_AGENTS = [
    {
        "id": "code-reviewer",
        "name": "Code Reviewer",
        "description": "Analisa código, sugere melhorias e identifica bugs.",
        "version": "2.0.0",
        "author": "Eigent",
        "tags": ["code review", "quality", "security"],
        "category": "coding",
        "pricing_type": "free",
        "pricing_price": None,
        "capabilities": ["analyze", "suggest", "security-scan"],
        "requirements": {"minContext": 8000},
        "ratings_average": 4.8,
        "ratings_count": 256,
        "downloads": 15420,
        "license": "MIT",
        "created_at": "2024-01-15T00:00:00Z",
        "updated_at": "2026-04-20T00:00:00Z",
    },
    {
        "id": "tech-writer",
        "name": "Tech Writer", 
        "description": "Transforma código em documentação clara.",
        "version": "1.5.0",
        "author": "Eigent",
        "tags": ["documentation", "docs"],
        "category": "writing",
        "pricing_type": "free",
        "capabilities": ["generate-docs", "readme"],
        "requirements": {"minContext": 4000},
        "ratings_average": 4.6,
        "ratings_count": 189,
        "downloads": 8930,
        "license": "MIT",
        "created_at": "2024-02-01T00:00:00Z",
        "updated_at": "2026-03-15T00:00:00Z",
    },
    {
        "id": "refactor-master",
        "name": "Refactor Master",
        "description": "Refatora código legado com patterns modernos.",
        "version": "3.0.0",
        "author": "Community",
        "tags": ["refactoring", "modernization"],
        "category": "coding",
        "pricing_type": "free",
        "capabilities": ["refactor", "patterns"],
        "requirements": {"minContext": 8000},
        "ratings_average": 4.7,
        "ratings_count": 312,
        "downloads": 22100,
        "license": "MIT",
        "created_at": "2024-01-20T00:00:00Z",
        "updated_at": "2026-04-18T00:00:00Z",
    },
]

# Initialize database
for agent_data in FEATURED_AGENTS:
    agents_db[agent_data["id"]] = AgentBase(**agent_data)

# ===== Routes =====

@app.get("/api/marketplace/agents")
async def list_agents(
    category: Optional[AgentCategory] = None,
    free: bool = False,
    search: Optional[str] = None,
) -> List[AgentBase]:
    """Lista agents disponíveis"""
    result = list(agents_db.values())
    
    if category:
        result = [a for a in result if a.category == category]
    
    if free:
        result = [a for a in result if a.pricing_type == "free"]
    
    if search:
        query = search.lower()
        result = [
            a for a in result 
            if query in a.name.lower() 
            or query in a.description.lower()
            or any(query in tag.lower() for tag in a.tags)
        ]
    
    return sorted(result, key=lambda a: a.downloads, reverse=True)

@app.get("/api/marketplace/agents/{agent_id}")
async def get_agent(agent_id: str) -> AgentBase:
    """Busca agent por ID"""
    if agent_id not in agents_db:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agents_db[agent_id]

@app.post("/api/marketplace/agents/{agent_id}/install")
async def install_agent(agent_id: str, user_id: str):
    """Instala um agent para o usuário"""
    if agent_id not in agents_db:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    if user_id not in installed_db:
        installed_db[user_id] = set()
    
    installed_db[user_id].add(agent_id)
    
    # Incrementa downloads
    agents_db[agent_id].downloads += 1
    
    return {"success": True, "agent_id": agent_id}

@app.post("/api/marketplace/agents/{agent_id}/uninstall")
async def uninstall_agent(agent_id: str, user_id: str):
    """Desinstala um agent"""
    if user_id in installed_db:
        installed_db[user_id].discard(agent_id)
    
    return {"success": True, "agent_id": agent_id}

@app.get("/api/marketplace/agents/installed")
async def list_installed(user_id: str) -> List[AgentBase]:
    """Lista agents instalados pelo usuário"""
    if user_id not in installed_db:
        return []
    
    return [
        agents_db[aid] 
        for aid in installed_db[user_id] 
        if aid in agents_db
    ]

@app.post("/api/marketplace/agents/{agent_id}/rate")
async def rate_agent(agent_id: str, request: AgentRatingRequest):
    """Avalia um agent"""
    if agent_id not in agents_db:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent = agents_db[agent_id]
    
    # Recalcula média
    new_count = agent.ratings_count + 1
    new_average = (
        (agent.ratings_average * agent.ratings_count + request.rating) / new_count
    )
    
    agents_db[agent_id] = AgentBase(
        **{
            **agent.model_dump(),
            "ratings_average": round(new_average, 1),
            "ratings_count": new_count,
        },
        createdAt=str(agent.created_at),
        updatedAt=str(agent.updated_at),
    )
    
    return {"success": True, "new_rating": new_average}

@app.get("/api/marketplace/categories")
async def list_categories():
    """Lista categorias disponíveis"""
    return [
        {"id": "coding", "name": "Coding", "emoji": "💻", "description": "Assistentes de programação"},
        {"id": "writing", "name": "Writing", "emoji": "✍️", "description": "Assistentes de escrita"},
        {"id": "research", "name": "Research", "emoji": "🔍", "description": "Pesquisa e análise"},
        {"id": "productivity", "name": "Productivity", "emoji": "⚡", "description": "Produtividade"},
        {"id": "creative", "name": "Creative", "emoji": "🎨", "description": "Criatividade"},
        {"id": "utility", "name": "Utility", "emoji": "🔧", "description": "Ferramentas"},
        {"id": "enterprise", "name": "Enterprise", "emoji": "🏢", "description": "Empresariais"},
    ]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)