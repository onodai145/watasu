import request from "supertest"
import { setup, teardown, reset } from "../helpers/db"
import { app } from "../../server/app"
import * as users from "../../server/users"
import { authenticator } from 'otplib'

beforeAll(setup);
afterAll(teardown);
beforeEach(reset);

// ── ローカルログイン ──────────────────────────────────────────────────────────
describe('POST /auth/local/login', () => {
  beforeEach(() => users.createUser({ username: 'alice', password: 'pass1234' }));

  it('正しい認証情報で / にリダイレクト', async () => {
    const res = await request(app)
      .post('/auth/local/login')
      .type('form')
      .send({ username: 'alice', password: 'pass1234' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('誤ったパスワードで /login?error=1 にリダイレクト', async () => {
    const res = await request(app)
      .post('/auth/local/login')
      .type('form')
      .send({ username: 'alice', password: 'wrong' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=1');
  });

  it('存在しないユーザーで /login?error=1 にリダイレクト', async () => {
    const res = await request(app)
      .post('/auth/local/login')
      .type('form')
      .send({ username: 'nobody', password: 'pass' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=1');
  });

  it('ログイン後にセッションが確立される', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/local/login').type('form').send({ username: 'alice', password: 'pass1234' });
    const res = await agent.get('/api/me');
    expect(res.body.authenticated).toBe(true);
  });
});

// ── GET /login ───────────────────────────────────────────────────────────────
describe('GET /login', () => {
  it('SPA シェルを返す', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="app">');
  });
});

// ── ログアウト ────────────────────────────────────────────────────────────────
describe('GET /auth/logout', () => {
  it('ログアウト後にセッションが破棄される', async () => {
    await users.createUser({ username: 'alice', password: 'pass1234' });
    const agent = request.agent(app);
    await agent.post('/auth/local/login').type('form').send({ username: 'alice', password: 'pass1234' });
    await agent.get('/auth/logout');
    const res = await agent.get('/api/me');
    expect(res.body.authenticated).toBe(false);
  });
});

// ── TOTP ログインフロー ──────────────────────────────────────────────────────
describe('TOTP ログインフロー', () => {
  it('TOTP 有効ユーザーは /login/totp にリダイレクト', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    const secret = users.generateTotpSecret();
    await users.enableTotp(u.id, secret, authenticator.generate(secret));

    const res = await request(app)
      .post('/auth/local/login')
      .type('form')
      .send({ username: 'alice', password: 'pass1234' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login/totp');
  });

  it('正しいコードでログイン完了', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    const secret = users.generateTotpSecret();
    await users.enableTotp(u.id, secret, authenticator.generate(secret));

    const agent = request.agent(app);
    await agent.post('/auth/local/login').type('form').send({ username: 'alice', password: 'pass1234' });
    const verifyRes = await agent
      .post('/auth/totp/verify')
      .type('form')
      .send({ token: authenticator.generate(secret) });
    expect(verifyRes.headers.location).toBe('/');

    const meRes = await agent.get('/api/me');
    expect(meRes.body.authenticated).toBe(true);
  });

  it('誤ったコードは /login/totp?error=1 にリダイレクト', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    const secret = users.generateTotpSecret();
    await users.enableTotp(u.id, secret, authenticator.generate(secret));

    const agent = request.agent(app);
    await agent.post('/auth/local/login').type('form').send({ username: 'alice', password: 'pass1234' });
    const res = await agent.post('/auth/totp/verify').type('form').send({ token: '000000' });
    expect(res.headers.location).toBe('/login/totp?error=1');
  });
});
