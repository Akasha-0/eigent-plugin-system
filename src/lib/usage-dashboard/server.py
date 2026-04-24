"""
Eigent Usage Dashboard Backend
"""

from fastapi import FastAPI, HTTPException, Depends, Header
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from enum import Enum
import uuid

app = FastAPI(
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",title="Eigent Usage API", version="1.0.0")

# ===== Models =====

class PricingTier(str, Enum):
    FREE = "free"
    PRO = "pro"
    TEAM = "team"
    ENTERPRISE = "enterprise"

class Pricing(BaseModel):
    id: str
    name: str
    price: int  # centavos
    currency: str = "USD"
    period: str = "month"
    monthly_tokens: int
    monthly_requests: int
    max_projects: int
    max_agents: int
    features: List[str]

class UsageMetrics(BaseModel):
    period: str = "month"
    tokens_in: int = 0
    tokens_out: int = 0
    total_tokens: int = 0
    requests: int = 0
    cost: int = 0  # centavos

class UsageRecord(BaseModel):
    user_id: str
    model: str
    tokens_in: int
    tokens_out: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)

# ===== Pricing Tiers =====

PRICING_TIERS = {
    "free": {
        "id": "free",
        "name": "Free",
        "price": 0,
        "monthly_tokens": 100000,
        "monthly_requests": 100,
        "max_projects": 1,
        "max_agents": 1,
        "features": ["basic_chat"],
    },
    "pro": {
        "id": "pro", 
        "name": "Pro",
        "price": 1900,
        "monthly_tokens": 1000000,
        "monthly_requests": 10000,
        "max_projects": 10,
        "max_agents": 5,
        "features": ["basic_chat", "agents", "projects"],
    },
    "team": {
        "id": "team",
        "name": "Team",
        "price": 4900,
        "monthly_tokens": 5000000,
        "monthly_requests": 100000,
        "max_projects": 50,
        "max_agents": 20,
        "features": ["basic_chat", "agents", "projects", "team", "api"],
    },
    "enterprise": {
        "id": "enterprise",
        "name": "Enterprise",
        "price": 0,
        "monthly_tokens": -1,
        "monthly_requests": -1,
        "max_projects": -1,
        "max_agents": -1,
        "features": ["all"],
    },
}

# Cost per 1K tokens (centavos)
COST_PER_1K = {
    "gpt-4": 30,
    "gpt-3.5-turbo": 2,
    "gpt-4-turbo": 30,
    "gpt-4o": 15,
    "claude-3-opus": 75,
    "claude-3-sonnet": 15,
    "claude-3-haiku": 1,
    "claude-3-5-sonnet": 15,
    "local-ollama": 0,
}

# ===== Storage =====

usage_db: Dict[str, List[Dict[str, Any]]] = {}
user_tiers: Dict[str, str] = {}

# Seed data
usage_db["default"] = [
    {
        "period": "month",
        "tokens_in": 45000,
        "tokens_out": 23000,
        "total_tokens": 68000,
        "requests": 45,
        "cost": 1500,
        "by_model": {
            "gpt-4": {"tokens": 50000, "requests": 30, "cost": 1500},
            "claude-3-haiku": {"tokens": 18000, "requests": 15, "cost": 180},
        }
    }
]

# ===== Routes =====

@app.get("/api/usage/tiers")
async def get_tiers():
    """Lista pricing tiers"""
    return list(PRICING_TIERS.values())

@app.get("/api/usage/tier")
async def get_user_tier(authorization: str = Header(None)):
    """Get current user's tier"""
    user_id = "default"  # Extract from auth in production
    tier_id = user_tiers.get(user_id, "free")
    return PRICING_TIERS[tier_id]

@app.get("/api/usage/current")
async def get_current_usage(authorization: str = Header(None)):
    """Get current usage metrics"""
    user_id = "default"
    metrics = usage_db.get(user_id, [])
    
    if not metrics:
        metrics = [{
            "period": "month",
            "tokens_in": 0,
            "tokens_out": 0,
            "total_tokens": 0,
            "requests": 0,
            "cost": 0,
            "by_model": {},
        }]
    
    return metrics[0]

@app.post("/api/usage/record")
async def record_usage(record: UsageRecord):
    """Record API usage"""
    user_id = record.user_id
    model = record.model
    
    # Calculate cost
    tokens = record.tokens_in + record.tokens_out
    cost_per_1k = COST_PER_1K.get(model, 10)
    cost = int((tokens / 1000) * cost_per_1k)
    
    # Get current or create
    if user_id not in usage_db:
        usage_db[user_id] = [{
            "period": "month",
            "tokens_in": 0,
            "tokens_out": 0,
            "total_tokens": 0,
            "requests": 0,
            "cost": 0,
            "by_model": {},
        }]
    
    current = usage_db[user_id][0]
    current["tokens_in"] += record.tokens_in
    current["tokens_out"] += record.tokens_out
    current["total_tokens"] += tokens
    current["requests"] += 1
    current["cost"] += cost
    
    # Per model breakdown
    if model not in current["by_model"]:
        current["by_model"][model] = {"tokens": 0, "requests": 0, "cost": 0}
    current["by_model"][model]["tokens"] += tokens
    current["by_model"][model]["requests"] += 1
    current["by_model"][model]["cost"] += cost
    
    return {"success": True, "added_cost": cost}

@app.get("/api/usage/history")
async def get_usage_history(
    period: str = "month",
    limit: int = 30,
    authorization: str = Header(None)
):
    """Get usage history"""
    user_id = "default"
    return usage_db.get(user_id, [])[:limit]

@app.post("/api/usage/upgrade")
async def upgrade_tier(
    tier_id: str,
    authorization: str = Header(None)
):
    """Upgrade user's tier"""
    user_id = "default"
    
    if tier_id not in PRICING_TIERS:
        raise HTTPException(404, "Tier not found")
    
    user_tiers[user_id] = tier_id
    
    return {"success": True, "tier": tier_id}

@app.get("/api/pricing/checkout/{tier_id}")
async def create_checkout_session(tier_id: str):
    """Create Stripe checkout session"""
    if tier_id not in PRICING_TIERS:
        raise HTTPException(404, "Tier not found")
    
    tier = PRICING_TIERS[tier_id]
    
    # In production, create actual Stripe checkout
    return {
        "url": f"https://checkout.stripe.com/pay/{uuid.uuid4().hex}",
        "tier": tier,
    }

@app.get("/api/usage/alerts")
async def get_alerts(authorization: str = Header(None)):
    """Get usage alerts"""
    user_id = "default"
    tier_id = user_tiers.get(user_id, "free")
    tier = PRICING_TIERS[tier_id]
    
    metrics = usage_db.get(user_id, [{}])[0]
    alerts = []
    
    if tier["monthly_tokens"] > 0:
        percent = (metrics["total_tokens"] / tier["monthly_tokens"]) * 100
        if percent >= 80:
            alerts.append(f"Usage at {percent:.0f}% of monthly limit")
        if percent >= 95:
            alerts.append("Approaching limit - consider upgrading")
        if percent >= 100:
            alerts.append("Limit reached - upgrade to continue")
    
    return {"alerts": alerts}

@app.get("/api/usage/export")
async def export_usage(authorization: str = Header(None)):
    """Export usage data as CSV"""
    user_id = "default"
    metrics = usage_db.get(user_id, [{}])[0]
    
    # Generate CSV
    csv = "period,tokens_in,tokens_out,total_tokens,requests,cost\n"
    csv += f"month,{metrics['tokens_in']},{metrics['tokens_out']},{metrics['total_tokens']},{metrics['requests']},{metrics['cost']}\n"
    
    return {
        "csv": csv,
        "filename": f"eigent-usage-{datetime.utcnow().isoformat()}.csv",
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)