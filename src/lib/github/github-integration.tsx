/**
 * Eigent GitHub Advanced Integration
 * 
 * Integração avançada com GitHub:
 * Code Review, PRs, Issues, Actions, e mais.
 * 
 * @version 1.0.0
 */

import { z } from 'zod';
import { useState, useEffect, useCallback } from 'react';

// ===== Types =====

export const GitHubRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  fullName: z.string(),
  description: z.string().optional(),
  private: z.boolean(),
  owner: z.object({
    login: z.string(),
    avatarUrl: z.string(),
  }),
  language: z.string().optional(),
  stars: z.number(),
  forks: z.number(),
  openIssues: z.number(),
  defaultBranch: z.string(),
  updatedAt: z.string(),
});

export const GitHubPRSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string(),
  state: z.enum(['open', 'closed', 'merged']),
  user: z.object({
    login: z.string(),
    avatarUrl: z.string(),
  }),
  head: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  base: z.object({
    ref: z.string(),
    sha: z.string(),
  }),
  additions: z.number(),
  deletions: z.number(),
  changedFiles: z.number(),
  createdAt: z.string(),
  mergedAt: z.string().optional(),
  closedAt: z.string().optional(),
});

export const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string(),
  state: z.enum(['open', 'closed']),
  user: z.object({
    login: z.string(),
    avatarUrl: z.string(),
  }),
  labels: z.array(z.object({
    name: z.string(),
    color: z.string(),
  })),
  comments: z.number(),
  createdAt: z.string(),
  closedAt: z.string().optional(),
});

export const GitHubActionRunSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.enum(['queued', 'in_progress', 'completed']),
  conclusion: z.enum(['success', 'failure', 'cancelled', 'skipped']).optional(),
  workflow: z.object({
    name: z.string(),
  }),
  headBranch: z.string(),
  runNumber: z.number(),
  event: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CodeReviewSchema = z.object({
  files: z.array(z.object({
    filename: z.string(),
    status: z.enum(['added', 'removed', 'modified', 'renamed']),
    additions: z.number(),
    deletions: z.number(),
    patch: z.string(),
  })),
  comments: z.array(z.object({
    path: z.string(),
    line: z.number(),
    body: z.string(),
    user: z.string(),
    createdAt: z.string(),
  })),
  suggestions: z.array(z.object({
    path: z.string(),
    line: z.number(),
    body: z.string(),
    category: z.enum(['bug', 'suggestion', 'security']),
  })),
});

export type GitHubRepo = z.infer<typeof GitHubRepoSchema>;
export type GitHubPR = z.infer<typeof GitHubPRSchema>;
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;
export type GitHubActionRun = z.infer<typeof GitHubActionRunSchema>;
export type CodeReview = z.infer<typeof CodeReviewSchema>;

// ===== GitHub API Client =====

class GitHubClient {
  private token: string;
  private baseUrl = 'https://api.github.com';
  
  constructor(token: string) {
    this.token = token;
  }
  
  private async request(endpoint: string, options?: RequestInit) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    
    return response.json();
  }
  
  // Repositories
  async listRepos(): Promise<GitHubRepo[]> {
    const repos = await this.request('/user/repos?sort=updated&per_page=50');
    return repos;
  }
  
  async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    return this.request(`/repos/${owner}/${repo}`);
  }
  
  // Pull Requests
  async listPRs(owner: string, repo: string): Promise<GitHubPR[]> {
    return this.request(`/repos/${owner}/${repo}/pulls`);
  }
  
  async getPR(owner: string, repo: string, number: number): Promise<GitHubPR> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}`);
  }
  
  async createPR(owner: string, repo: string, data: {
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<GitHubPR> {
    return this.request(`/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  
  // Issues
  async listIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    return this.request(`/repos/${owner}/${repo}/issues`);
  }
  
  async createIssue(owner: string, repo: string, data: {
    title: string;
    body: string;
    labels?: string[];
  }): Promise<GitHubIssue> {
    return this.request(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  
  // Code Review
  async getCodeReview(owner: string, repo: string, prNumber: number): Promise<CodeReview> {
    const files = await this.request(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files`
    );
    const comments = await this.request(
      `/repos/${owner}/${repo}/pulls/${prNumber}/comments`
    );
    
    // AI-powered suggestions (mock)
    const suggestions = files.map((file: any) => ({
      path: file.filename,
      line: 1,
      body: await this.generateSuggestion(file),
      category: 'suggestion' as const,
    }));
    
    return { files, comments, suggestions };
  }
  
  private async generateSuggestion(file: any): Promise<string> {
    // In production, use AI to analyze the diff
    if (file.status === 'modified' && file.additions > 50) {
      return `Consider breaking this file into smaller modules (${file.additions} additions)`;
    }
    return '';
  }
  
  // Actions
  async listWorkflows(owner: string, repo: string): Promise<any[]> {
    return this.request(`/repos/${owner}/${repo}/actions/workflows`);
  }
  
  async listRuns(owner: string, repo: string): Promise<GitHubActionRun[]> {
    const runs = await this.request(
      `/repos/${owner}/${repo}/actions/runs?per_page=20`
    );
    return runs.workflow_runs;
  }
  
  async triggerWorkflow(owner: string, repo: string, workflowId: number, ref: string): Promise<void> {
    await this.request(
      `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        body: JSON.stringify({ ref }),
      }
    );
  }
  
  // Search
  async searchCode(query: string): Promise<any> {
    return this.request(`/search/code?q=${encodeURIComponent(query)}`);
  }
  
  async searchRepos(query: string): Promise<any> {
    return this.request(`/search/repositories?q=${encodeURIComponent(query)}`);
  }
}

// ===== Components =====

export function GitHubPanel() {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Load repos
    async function load() {
      try {
        const client = new GitHubClient(''); // Token from env
        const data = await client.listRepos();
        setRepos(data);
      } catch {
        // Use mock data
        setRepos([
          {
            id: 1,
            name: 'eigent',
            fullName: 'user/eigent',
            description: 'Desktop Cowork AI Agent',
            private: false,
            owner: { login: 'user', avatarUrl: '' },
            language: 'TypeScript',
            stars: 100,
            forks: 20,
            openIssues: 5,
            defaultBranch: 'main',
            updatedAt: new Date().toISOString(),
          },
        ]);
      }
      setLoading(false);
    }
    load();
  }, []);
  
  const handleRepoSelect = useCallback((repoFullName: string) => {
    setSelectedRepo(repoFullName);
  }, []);
  
  return (
    <div className="github-panel">
      <h2 className="text-2xl font-bold mb-4">GitHub Integration</h2>
      
      {loading ? (
        <Spinner>Loading repositories...</Spinner>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Repo List */}
          <Card>
            <CardHeader>
              <CardTitle>Repositories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {repos.map(repo => (
                  <div
                    key={repo.id}
                    className={`p-3 border rounded cursor-pointer ${
                      selectedRepo === repo.fullName ? 'border-blue-500 bg-blue-50' : ''
                    }`}
                    onClick={() => handleRepoSelect(repo.fullName)}
                  >
                    <div className="font-medium">{repo.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {repo.description || 'No description'}
                    </div>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span>⭐ {repo.stars}</span>
                      <span>🍴 {repo.forks}</span>
                      <span>📝 {repo.openIssues}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          {/* Detail Panel */}
          {selectedRepo && (
            <RepoDetails repoFullName={selectedRepo} />
          )}
        </div>
      )}
    </div>
  );
}

function RepoDetails({ repoFullName }: { repoFullName: string }) {
  const [prs, setPRs] = useState<GitHubPR[]>([]);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [runs, setRuns] = useState<GitHubActionRun[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const [owner, repo] = repoFullName.split('/');
    const client = new GitHubClient('');
    
    async function load() {
      try {
        const [prsData, issuesData, runsData] = await Promise.all([
          client.listPRs(owner, repo),
          client.listIssues(owner, repo),
          client.listRuns(owner, repo),
        ]);
        
        setPRs(prsData);
        setIssues(issuesData);
        setRuns(runsData);
      } catch {
        // Use mock
      }
      setLoading(false);
    }
    load();
  }, [repoFullName]);
  
  if (loading) return <Spinner>Loading details...</Spinner>;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{repoFullName}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* PRs */}
        <div className="mb-4">
          <h4 className="font-medium mb-2">Open PRs</h4>
          {prs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open PRs</p>
          ) : (
            <div className="space-y-2">
              {prs.slice(0, 5).map(pr => (
                <div key={pr.id} className="p-2 border rounded">
                  <div className="font-medium">#{pr.number} {pr.title}</div>
                  <div className="text-xs text-muted-foreground">
                    +{pr.additions} -{pr.deletions}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Issues */}
        <div className="mb-4">
          <h4 className="font-medium mb-2">Recent Issues</h4>
          {issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No issues</p>
          ) : (
            <div className="space-y-2">
              {issues.slice(0, 5).map(issue => (
                <div key={issue.id} className="p-2 border rounded">
                  <div className="font-medium">#{issue.number} {issue.title}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div>
          <h4 className="font-medium mb-2">Recent Runs</h4>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs</p>
          ) : (
            <div className="space-y-2">
              {runs.slice(0, 5).map(run => (
                <div key={run.id} className="p-2 border rounded">
                  <div className="font-medium">{run.name}</div>
                  <Badge variant={run.conclusion === 'success' ? 'default' : 'destructive'}>
                    {run.conclusion || run.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default GitHubClient;