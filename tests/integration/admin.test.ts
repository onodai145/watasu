import request from "supertest"
import { setup, teardown, reset, prisma } from "../helpers/db"
import { app } from "../../server/app"
import * as users from "../../server/users"

beforeAll(setup);
afterAll(teardown);
beforeEach(reset);

// ── /setup ────────────────────────────────────────────────────────────────────
describe('GET /setup', () => {
  it('ユーザーが0人のとき SPA シェルを返す', async () => {
    const res = await request(app).get('/setup');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="app">');
  });

  it('ユーザーが存在するとき / にリダイレクト（本番動作）', async () => {
    await users.createUser({ username: 'admin', password: 'pass1234', role: 'admin' });
    process.env.NODE_ENV = 'production';
    const res = await request(app).get('/setup');
    process.env.NODE_ENV = 'test';
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

describe('POST /setup', () => {
  it('最初の管理者を作成し /admin にリダイレクト', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/setup').type('form')
      .send({ username: 'admin', displayName: 'Administrator', password: 'pass1234' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/users');

    const row = await prisma.user.findUnique({ where: { username: 'admin' } });
    expect(row!.role).toBe('admin');
  });

  it('必須項目欠如は /setup?error=missing にリダイレクト', async () => {
    const res = await request(app).post('/setup').type('form').send({ username: 'admin' });
    expect(res.headers.location).toBe('/setup?error=missing');
  });

  it('ユーザーが存在するとき POST も弾かれる（本番動作）', async () => {
    await users.createUser({ username: 'existing', password: 'pass1234', role: 'admin' });
    process.env.NODE_ENV = 'production';
    const res = await request(app).post('/setup').type('form')
      .send({ username: 'admin', password: 'pass1234' });
    process.env.NODE_ENV = 'test';
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

// ── /admin アクセス制御 ───────────────────────────────────────────────────────
describe('GET /admin', () => {
  beforeEach(() => users.createUser({ username: 'admin', password: 'pass1234', role: 'admin' }));

  it('未ログインは /login にリダイレクト', async () => {
    const res = await request(app).get('/admin/users');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('一般ユーザーは / にリダイレクト', async () => {
    await users.createUser({ username: 'bob', password: 'pass1234', role: 'user' });
    const agent = request.agent(app);
    await agent.post('/auth/local/login').type('form').send({ username: 'bob', password: 'pass1234' });
    const res = await agent.get('/admin/users');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('admin ロールは SPA シェルを返す', async () => {
    const agent = request.agent(app);
    await agent.post('/auth/local/login').type('form').send({ username: 'admin', password: 'pass1234' });
    const res = await agent.get('/admin/users');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="app">');
  });
});

// ── admin ユーザー CRUD ────────────────────────────────────────────────────────
describe('admin ユーザー API', () => {
  let agent: ReturnType<typeof request.agent>;

  beforeEach(async () => {
    await users.createUser({ username: 'admin', password: 'pass1234', role: 'admin' });
    agent = request.agent(app);
    await agent.post('/auth/local/login').type('form').send({ username: 'admin', password: 'pass1234' });
  });

  it('ユーザー一覧を返す', async () => {
    const res = await agent.get('/admin/api/users');
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body[0].username).toBe('admin');
    expect(res.body[0]).not.toHaveProperty('password_hash');
  });

  it('ユーザーを作成できる', async () => {
    const res = await agent.post('/admin/api/users')
      .send({ username: 'newuser', password: 'pass1234', role: 'user' });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('newuser');
    expect(res.body.role).toBe('user');
  });

  it('ユーザー名重複は 409', async () => {
    await agent.post('/admin/api/users').send({ username: 'dup', password: 'pass1234' });
    const res = await agent.post('/admin/api/users').send({ username: 'dup', password: 'other' });
    expect(res.status).toBe(409);
  });

  it('必須項目欠如は 400', async () => {
    const res = await agent.post('/admin/api/users').send({ username: 'nobody' });
    expect(res.status).toBe(400);
  });

  it('ユーザーを更新できる', async () => {
    const created = await agent.post('/admin/api/users')
      .send({ username: 'bob', password: 'pass1234', role: 'user' });
    const res = await agent.patch(`/admin/api/users/${created.body.id}`)
      .send({ role: 'admin', displayName: 'Bob Admin' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
    expect(res.body.display_name).toBe('Bob Admin');
  });

  it('自分自身のロール変更は 400', async () => {
    const meRes = await agent.get('/admin/api/me');
    const myId  = meRes.body.sub.replace('local:', '');
    const res   = await agent.patch(`/admin/api/users/${myId}`).send({ role: 'user' });
    expect(res.status).toBe(400);
  });

  it('ユーザーを削除できる', async () => {
    const created = await agent.post('/admin/api/users')
      .send({ username: 'todelete', password: 'pass1234' });
    const res = await agent.delete(`/admin/api/users/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(await users.findById(created.body.id)).toBeNull();
  });

  it('非 admin は /admin/api/* が 403', async () => {
    await users.createUser({ username: 'bob', password: 'pass1234', role: 'user' });
    const bobAgent = request.agent(app);
    await bobAgent.post('/auth/local/login').type('form').send({ username: 'bob', password: 'pass1234' });
    const res = await bobAgent.get('/admin/api/users');
    expect(res.status).toBe(403);
  });
});
