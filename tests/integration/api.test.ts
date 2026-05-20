import request from "supertest"
import { setup, teardown, reset } from "../helpers/db"
import { app } from "../../server/app"
import * as users from "../../server/users"

beforeAll(setup);
afterAll(teardown);
beforeEach(reset);

// ── /health ─────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('200 ok を返す', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// ── /api/ice-servers ─────────────────────────────────────────────────────────
describe('GET /api/ice-servers', () => {
  it('デフォルトで Google STUN を返す', async () => {
    const res = await request(app).get('/api/ice-servers');
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].urls).toMatch(/^stun:/);
  });

  it('STUN_URLS を設定すると上書きされる', async () => {
    const orig = process.env.STUN_URLS;
    process.env.STUN_URLS = 'stun:custom.example.com:3478';
    const res = await request(app).get('/api/ice-servers');
    expect(res.body[0].urls).toBe('stun:custom.example.com:3478');
    process.env.STUN_URLS = orig;
  });
});

// ── /api/me ─────────────────────────────────────────────────────────────────
describe('GET /api/me', () => {
  it('未ログインは authenticated: false', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(false);
  });

  it('ログイン後は user 情報を返す', async () => {
    await users.createUser({ username: 'alice', password: 'pass1234', role: 'user' });
    const agent = request.agent(app);
    await agent.post('/auth/local/login').type('form').send({ username: 'alice', password: 'pass1234' });
    const res = await agent.get('/api/me');
    expect(res.body.authenticated).toBe(true);
    expect(res.body.user.name).toBe('alice');
    expect(res.body.user.role).toBe('user');
    expect(res.body.user.totpEnabled).toBe(false);
  });
});

// ── PATCH /api/me ────────────────────────────────────────────────────────────
describe('PATCH /api/me', () => {
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    await users.createUser({ username: 'alice', password: 'pass1234' });
    agent = request.agent(app);
    await agent.post('/auth/local/login').type('form').send({ username: 'alice', password: 'pass1234' });
  });

  it('表示名を変更できる', async () => {
    const res = await agent.patch('/api/me').send({ displayName: 'Alice New' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Alice New');
  });

  it('正しい現在のパスワードでパスワードを変更できる', async () => {
    const res = await agent.patch('/api/me').send({ currentPassword: 'pass1234', newPassword: 'new56789' });
    expect(res.status).toBe(200);
  });

  it('誤った現在のパスワードは 400', async () => {
    const res = await agent.patch('/api/me').send({ currentPassword: 'wrong', newPassword: 'new56789' });
    expect(res.status).toBe(400);
  });

  it('短すぎるパスワードは 400', async () => {
    const res = await agent.patch('/api/me').send({ currentPassword: 'pass1234', newPassword: 'abc' });
    expect(res.status).toBe(400);
  });

  it('未ログインは 401', async () => {
    const res = await request(app).patch('/api/me').send({ displayName: 'X' });
    expect(res.status).toBe(401);
  });
});
