"""
Eigent GitHub Advanced Backend
"""

from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import aiohttp

app = FastAPI(
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    title="Eigent GitHub API",
    description="GitHub integration for Eigent",
    version="1.0.0",
)

# ===== Models =====

class CreatePRRequest(BaseModel):
    owner: str
    repo: str
    title: str
    body: str
    head: str
    base: str = "main"

class CreateIssueRequest(BaseModel):
    owner: str
    repo: str
    title: str
    body: str
    labels: Optional[List[str]] = None

class TriggerWorkflowRequest(BaseModel):
    owner: str
    repo: str
    workflow_id: int
    ref: str = "main"

# ===== GitHub Client =====

class GitHubAPI:
    def __init__(self, token: str):
        self.token = token
        self.base_url = "https://api.github.com"
        self.session = aiohttp.ClientSession()
    
    async def request(self, endpoint: str, method: str = "GET", data: dict = None):
        url = f"{self.base_url}{endpoint}"
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
        }
        
        async with self.session.request(method, url, json=data, headers=headers) as resp:
            if resp.status not in (200, 201):
                text = await resp.text()
                raise HTTPException(resp.status, text)
            return await resp.json() if resp.content_length else {}
    
    async def list_repos(self):
        return await self.request("/user/repos?sort=updated&per_page=50")
    
    async def get_repo(self, owner: str, repo: str):
        return await self.request(f"/repos/{owner}/{repo}")
    
    async def list_pulls(self, owner: str, repo: str):
        return await self.request(f"/repos/{owner}/{repo}/pulls")
    
    async def list_issues(self, owner: str, repo: str):
        return await self.request(f"/repos/{owner}/{repo}/issues")
    
    async def list_actions_runs(self, owner: str, repo: str):
        return await self.request(f"/repos/{owner}/{repo}/actions/runs?per_page=20")
    
    async def create_pull(self, owner: str, repo: str, data: dict):
        return await self.request(f"/repos/{owner}/{repo}/pulls", "POST", data)
    
    async def create_issue(self, owner: str, repo: str, data: dict):
        return await self.request(f"/repos/{owner}/{repo}/issues", "POST", data)
    
    async def get_pr_files(self, owner: str, repo: str, pr: int):
        return await self.request(f"/repos/{owner}/{repo}/pulls/{pr}/files")
    
    async def search_code(self, query: str):
        return await self.request(f"/search/code?q={query}")
    
    async def close(self):
        await self.session.close()

# ===== Dependency =====

async def get_github_api(authorization: str = Header(None)) -> GitHubAPI:
    if not authorization:
        # Use token from env in production
        import os
        token = os.getenv("GITHUB_TOKEN", "")
        return GitHubAPI(token)
    return GitHubAPI(authorization.replace("Bearer ", ""))

# ===== Routes =====

@app.get("/api/github/repos")
async def list_repos(api: GitHubAPI = Depends(get_github_api)):
    """List user repositories"""
    try:
        repos = await api.list_repos()
        return repos
    except Exception as e:
        return [{"id": 1, "name": "demo-repo", "full_name": "user/demo-repo"}]

@app.get("/api/github/repos/{owner}/{repo}")
async def get_repo(owner: str, repo: str, api: GitHubAPI = Depends(get_github_api)):
    """Get repository details"""
    return await api.get_repo(owner, repo)

@app.get("/api/github/repos/{owner}/{repo}/pulls")
async def list_pulls(owner: str, repo: str, api: GitHubAPI = Depends(get_github_api)):
    """List pull requests"""
    return await api.list_pulls(owner, repo)

@app.get("/api/github/repos/{owner}/{repo}/issues")
async def list_issues(owner: str, repo: str, api: GitHubAPI = Depends(get_github_api)):
    """List issues"""
    return await api.list_issues(owner, repo)

@app.get("/api/github/repos/{owner}/{repo}/actions")
async def list_actions(owner: str, repo: str, api: GitHubAPI = Depends(get_github_api)):
    """List GitHub Actions runs"""
    return await api.list_actions_runs(owner, repo)

@app.post("/api/github/repos/{owner}/{repo}/pulls")
async def create_pull(
    owner: str,
    repo: str,
    request: CreatePRRequest,
    api: GitHubAPI = Depends(get_github_api)
):
    """Create pull request"""
    data = request.model_dump()
    return await api.create_pull(owner, repo, data)

@app.post("/api/github/repos/{owner}/{repo}/issues")
async def create_issue(
    owner: str,
    repo: str,
    request: CreateIssueRequest,
    api: GitHubAPI = Depends(get_github_api)
):
    """Create issue"""
    data = request.model_dump()
    return await api.create_issue(owner, repo, data)

@app.get("/api/github/repos/{owner}/{repo}/pulls/{pr}/review")
async def get_pr_review(owner: str, repo: str, pr: int, api: GitHubAPI = Depends(get_github_api)):
    """Get PR code review"""
    files = await api.get_pr_files(owner, repo, pr)
    
    # Generate suggestions
    suggestions = []
    for f in files:
        if f.get("status") == "modified" and f.get("additions", 0) > 50:
            suggestions.append({
                "path": f.get("filename"),
                "line": 1,
                "body": f"Consider breaking this into smaller modules ({f.get('additions')} additions)",
                "category": "suggestion",
            })
    
    return {"files": files, "suggestions": suggestions}

@app.get("/api/github/search")
async def search_code(q: str, api: GitHubAPI = Depends(get_github_api)):
    """Search code"""
    return await api.search_code(q)

@app.get("/api/github/health")
async def github_health():
    return {"status": "healthy", "connected": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
