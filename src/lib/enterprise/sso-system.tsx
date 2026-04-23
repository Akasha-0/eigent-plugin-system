/**
 * Eigent Enterprise & SSO System
 * 
 * Sistema de autenticação enterprise com SAML 2.0 e OIDC.
 * Suporta múltiplos provedores de identidade (IdP).
 * 
 * @version 1.0.0
 */

import { z } from 'zod';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

// ===== Types =====

export const SSOProviderType = z.enum(['saml', 'oidc', 'oauth2']);
export type SSOProviderType = z.infer<typeof SSOProviderType>;

export const SAMLIdentityProviderSchema = z.object({
  entityId: z.string().url(),
  ssoUrl: z.string().url(),
  sloUrl: z.string().url().optional(),
  certificate: z.string(), // X.509 certificate
  certificateFingerprint: z.string().optional(),
  nameIdFormat: z.string().optional(),
  wantAssertionsSigned: z.boolean().default(true),
  wantAuthnRequestSigned: z.boolean().default(false),
});

export const OIDCIdentityProviderSchema = z.object({
  issuer: z.string().url(),
  authorizationEndpoint: z.string().url(),
  tokenEndpoint: z.string().url(),
  userInfoEndpoint: z.string().url().optional(),
  jwksUri: z.string().url(),
  clientId: z.string(),
  clientSecret: z.string().optional(),
  scopes: z.array(z.string()).default(['openid', 'profile', 'email']),
  responseTypes: z.array(z.string()).default(['code']),
});

export const SSOConfigSchema = z.object({
  enabled: z.boolean().default(true),
  providers: z.record(
    z.object({
      type: SSOProviderType,
      name: z.string(),
      logo: z.string().url().optional(),
      enabled: z.boolean().default(true),
      config: z.union([SAMLIdentityProviderSchema, OIDCIdentityProviderSchema]),
    })
  ),
  defaultProvider: z.string().optional(),
  // Redirect after login
  redirectUrl: z.string().default('/dashboard'),
  // Logout settings
  logoutRedirect: z.string().default('/login'),
  // Session
  sessionLifetime: z.number().default(86400), // seconds
  sessionRefresh: z.boolean().default(true),
});

export type SSOConfig = z.infer<typeof SSOConfigSchema>;

// ===== User & Session Types =====

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  picture: z.string().url().optional(),
  
  // SSO fields
  provider: z.string().optional(),
  providerId: z.string().optional(), // ID no IdP
  
  // Enterprise fields
  organization: z.string().optional(),
  department: z.string().optional(),
  role: z.enum(['admin', 'user', 'viewer']).default('user'),
  
  // Status
  active: z.boolean().default(true),
  mfaEnabled: z.boolean().default(false),
  
  // Metadata
  createdAt: z.string().datetime(),
  lastLogin: z.string().datetime().optional(),
});

export type User = z.infer<typeof UserSchema>;

// ===== Audit Log Types =====

export const AuditActionSchema = z.enum([
  'login',
  'logout',
  'login_failed',
  'password_changed',
  'mfa_enabled',
  'mfa_disabled',
  'session_created',
  'session_revoked',
  'user_created',
  'user_updated',
  'user_deleted',
  'permission_changed',
  'api_key_created',
  'api_key_revoked',
  'settings_changed',
  'agent_installed',
  'agent_uninstalled',
  'data_exported',
  'data_deleted',
]);

export const AuditLogSchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  action: AuditActionSchema,
  userId: z.string(),
  userEmail: z.string(),
  
  // Context
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  provider: z.string().optional(),
  
  // Details
  resource: z.string().optional(),
  resourceId: z.string().optional(),
  changes: z.record(z.any()).optional(),
  
  // Result
  success: z.boolean().default(true),
  error: z.string().optional(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

// ===== SSO Client =====

export class SSOClient {
  private config: SSOConfig;
  private sessionStore: Map<string, Session>;
  
  constructor(config: SSOConfig) {
    this.config = config;
    this.sessionStore = new Map();
  }
  
  /**
   * Inicia fluxo de login SSO
   */
  async initiateLogin(providerId: string): Promise<LoginUrl> {
    const provider = this.config.providers[providerId];
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    
    const state = this.generateState();
    const nonce = this.generateNonce();
    
    // Salva state para verificação
    sessionStorage.setItem('sso_state', state);
    sessionStorage.setItem('sso_nonce', nonce);
    
    if (provider.type === 'oidc') {
      const oidc = provider.config as z.infer<typeof OIDCIdentityProviderSchema>;
      
      const params = new URLSearchParams({
        client_id: oidc.clientId,
        response_type: oidc.responseTypes[0],
        scope: oidc.scopes.join(' '),
        redirect_uri: `${window.location.origin}/auth/callback`,
        state,
        nonce,
      });
      
      return {
        url: `${oidc.authorizationEndpoint}?${params}`,
        state,
      };
    }
    
    if (provider.type === 'saml') {
      const saml = provider.config as z.infer<typeof SAMLIdentityProviderSchema>;
      
      // SAML AuthnRequest
      const authnRequest = this.buildSAMLRequest(providerId, saml);
      
      return {
        url: `${saml.ssoUrl}?SAMLRequest=${encodeURIComponent(authnRequest)}`,
        state,
      };
    }
    
    throw new Error(`Unsupported provider type: ${provider.type}`);
  }
  
  /**
   * Processa callback do IdP
   */
  async handleCallback(params: URLSearchParams): Promise<AuthResult> {
    const state = params.get('state');
    const storedState = sessionStorage.getItem('sso_state');
    
    if (state !== storedState) {
      throw new Error('Invalid state - potential CSRF attack');
    }
    
    const code = params.get('code');
    const error = params.get('error');
    
    if (error) {
      throw new Error(`SSO Error: ${error}`);
    }
    
    if (!code) {
      throw new Error('Missing authorization code');
    }
    
    // Troca code por tokens
    const tokens = await this.exchangeCode(code);
    
    // Valida e extrai user info
    const user = await this.validateTokens(tokens);
    
    // Cria sessão
    const session = this.createSession(user);
    
    return { user, session };
  }
  
  /**
   * Executa logout
   */
  async logout(sessionId: string): Promise<void> {
    this.sessionStore.delete(sessionId);
    sessionStorage.clear();
  }
  
  /**
   * Valida sessão ativa
   */
  async validateSession(sessionId: string): Promise<User | null> {
    const session = this.sessionStore.get(sessionId);
    if (!session) return null;
    
    // Verifica expiração
    if (Date.now() > session.expiresAt) {
      this.sessionStore.delete(sessionId);
      return null;
    }
    
    // Refresh se necessário
    if (this.config.sessionRefresh && this.shouldRefresh(session)) {
      await this.refreshSession(sessionId);
    }
    
    return session.user;
  }
  
  /**
   * Registra audit log
   */
  async auditLog(entry: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
    const log: AuditLog = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    };
    
    // Em produção, envie para seu sistema de logs
    console.log('[AUDIT]', log);
  }
  
  // ===== Helpers =====
  
  private buildSAMLRequest(providerId: string, idp: z.infer<typeof SAMLIdentityProviderSchema>): string {
    const id = `_${this.generateId()}`;
    const issueInstant = new Date().toISOString();
    
    const request = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest 
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  ID="${id}"
  Version="2.0"
  IssueInstant="${issueInstant}"
  AssertionConsumerServiceURL="${window.location.origin}/auth/saml/callback"
  Destination="${idp.ssoUrl}">
  <saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
    ${window.location.origin}
  </saml:Issuer>
  <samlp:NameIDPolicy 
    Format="${idp.nameIdFormat || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'}"
    AllowCreate="true"/>
</samlp:AuthnRequest>`;
    
    // Comprime e codifica
    return btoa(request);
  }
  
  private async exchangeCode(code: string): Promise<Tokens> {
    // Em produção, faça request HTTP real
    return {
      accessToken: code,
      idToken: code,
      refreshToken: code,
      expiresIn: 3600,
    };
  }
  
  private async validateTokens(tokens: Tokens): Promise<User> {
    // Em produção, valide o JWT e extraia claims
    return {
      id: this.generateId(),
      email: 'user@enterprise.com',
      name: 'Enterprise User',
      provider: 'oidc',
      providerId: '123',
      role: 'user',
      active: true,
      createdAt: new Date().toISOString(),
    };
  }
  
  private createSession(user: User): Session {
    const id = this.generateId();
    const expiresAt = Date.now() + this.config.sessionLifetime * 1000;
    
    const session: Session = { id, user, expiresAt, refreshToken: this.generateId() };
    this.sessionStore.set(id, session);
    
    return session;
  }
  
  private generateState(): string {
    return randomBytes(16).toString('hex');
  }
  
  private generateNonce(): string {
    return randomBytes(16).toString('hex');
  }
  
  private generateId(): string {
    return randomBytes(12).toString('hex');
  }
  
  private shouldRefresh(session: Session): boolean {
    const timeLeft = session.expiresAt - Date.now();
    return timeLeft < (this.config.sessionLifetime * 1000 * 0.2); // < 20% remaining
  }
  
  private async refreshSession(sessionId: string): Promise<void> {
    const session = this.sessionStore.get(sessionId);
    if (session) {
      session.expiresAt = Date.now() + this.config.sessionLifetime * 1000;
    }
  }
}

// ===== Supporting Types =====

interface LoginUrl {
  url: string;
  state: string;
}

interface AuthResult {
  user: User;
  session: Session;
}

interface Session {
  id: string;
  user: User;
  expiresAt: number;
  refreshToken: string;
}

interface Tokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ===== SSO Provider Components =====

export function SSOProviderButton({ 
  provider,
  onClick,
}: { 
  provider: SSOConfig['providers'][string];
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="sso-button">
      {provider.logo ? (
        <img src={provider.logo} alt={provider.name} className="sso-logo" />
      ) : (
        <span className="sso-icon">{provider.type === 'saml' ? '🔐' : '🔑'}</span>
      )}
      <span>Continue with {provider.name}</span>
    </button>
  );
}

export function SSOProviderList({ 
  providers,
  onSelect,
}: {
  providers: SSOConfig['providers'];
  onSelect: (providerId: string) => void;
}) {
  return (
    <div className="sso-providers">
      {Object.entries(providers).map(([id, provider]) => (
        <SSOProviderButton 
          key={id} 
          provider={provider} 
          onClick={() => onSelect(id)}
        />
      ))}
    </div>
  );
}

export function AuditLogTable({ logs }: { logs: AuditLog[] }) {
  return (
    <div className="audit-log">
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Action</th>
            <th>User</th>
            <th>Details</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id}>
              <td>{new Date(log.timestamp).toLocaleString()}</td>
              <td><Badge>{log.action}</Badge></td>
              <td>{log.userEmail}</td>
              <td>
                {log.resource && <span>{log.resource}</span>}
                {log.changes && <pre>{JSON.stringify(log.changes)}</pre>}
              </td>
              <td>
                {log.success ? (
                  <Badge variant="success">Success</Badge>
                ) : (
                  <Badge variant="destructive">Failed</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SSOClient;