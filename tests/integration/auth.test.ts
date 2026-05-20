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

  it('TOTP コードのリプレイは拒否される', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    const secret = users.generateTotpSecret();
    await users.enableTotp(u.id, secret, authenticator.generate(secret));
    const token = authenticator.generate(secret);

    const agent1 = request.agent(app);
    await agent1.post('/auth/local/login').type('form').send({ username: 'alice', password: 'pass1234' });
    const res1 = await agent1.post('/auth/totp/verify').type('form').send({ token });
    expect(res1.headers.location).toBe('/');

    const agent2 = request.agent(app);
    await agent2.post('/auth/local/login').type('form').send({ username: 'alice', password: 'pass1234' });
    const res2 = await agent2.post('/auth/totp/verify').type('form').send({ token });
    expect(res2.headers.location).toBe('/login/totp?error=1');
  });

  it('無効化ユーザーは TOTP 検証を完了できない', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    const secret = users.generateTotpSecret();
    await users.enableTotp(u.id, secret, authenticator.generate(secret));

    const agent = request.agent(app);
    await agent.post('/auth/local/login').type('form').send({ username: 'alice', password: 'pass1234' });

    // TOTP フロー開始後にユーザーを無効化
    await users.updateUser(u.id, { enabled: false });

    const res = await agent.post('/auth/totp/verify').type('form').send({ token: authenticator.generate(secret) });
    expect(res.headers.location).toBe('/login');
  });
});

// ── 自己登録 ─────────────────────────────────────────────────────────────────
describe('POST /auth/register', () => {
  const valid = { username: 'newuser', email: 'newuser@example.com', password: 'pass1234' };

  describe('ALLOW_REGISTRATION=true のとき', () => {
    beforeEach(() => { process.env.ALLOW_REGISTRATION = 'true' });
    afterEach(() => { delete process.env.ALLOW_REGISTRATION });

    it('正常登録で 200 を返す', async () => {
      const res = await request(app).post('/auth/register').send(valid);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('登録後にセッションが確立される', async () => {
      const agent = request.agent(app);
      await agent.post('/auth/register').send(valid);
      const me = await agent.get('/api/me');
      expect(me.body.authenticated).toBe(true);
      expect(me.body.user.name).toBe('newuser');
    });

    it('項目不足は 400', async () => {
      const res = await request(app).post('/auth/register').send({ username: 'a', password: 'pass1234' });
      expect(res.status).toBe(400);
    });

    it('メール形式不正は 400', async () => {
      const res = await request(app).post('/auth/register').send({ ...valid, email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('パスワード短すぎは 400', async () => {
      const res = await request(app).post('/auth/register').send({ ...valid, password: 'abc' });
      expect(res.status).toBe(400);
    });

    it('ユーザー名重複は 409', async () => {
      await request(app).post('/auth/register').send(valid);
      const res = await request(app).post('/auth/register').send(valid);
      expect(res.status).toBe(409);
    });

    it('許可ドメイン外は 400', async () => {
      process.env.ALLOWED_EMAIL_DOMAINS = 'allowed.com';
      const res = await request(app).post('/auth/register').send({ ...valid, email: 'user@other.com' });
      expect(res.status).toBe(400);
      delete process.env.ALLOWED_EMAIL_DOMAINS;
    });

    it('許可ドメインは大文字小文字を区別しない', async () => {
      process.env.ALLOWED_EMAIL_DOMAINS = 'example.com';
      const res = await request(app).post('/auth/register').send({ ...valid, email: 'user@EXAMPLE.COM' });
      expect(res.status).toBe(200);
      delete process.env.ALLOWED_EMAIL_DOMAINS;
    });
  });

  describe('ALLOW_REGISTRATION 未設定のとき', () => {
    it('登録は 403', async () => {
      const res = await request(app).post('/auth/register').send(valid);
      expect(res.status).toBe(403);
    });

    it('ALLOW_REGISTRATION=false も 403', async () => {
      process.env.ALLOW_REGISTRATION = 'false';
      const res = await request(app).post('/auth/register').send(valid);
      expect(res.status).toBe(403);
      delete process.env.ALLOW_REGISTRATION;
    });
  });
});
