import { prisma, setup, teardown, reset } from "../helpers/db"
import * as users from "../../server/users"
import { authenticator } from 'otplib'

beforeAll(setup);
afterAll(teardown);
beforeEach(reset);

// ── createUser ─────────────────────────────────────────────────────────────
describe('createUser', () => {
  it('デフォルトロール user で作成される', async () => {
    const user = await users.createUser({ username: 'alice', password: 'pass1234' });
    expect(user.username).toBe('alice');
    expect(user.role).toBe('user');
    expect(user.enabled).toBe(true);
  });

  it('表示名省略時はユーザー名が使われる', async () => {
    const user = await users.createUser({ username: 'alice', password: 'pass1234' });
    expect(user.display_name).toBe('alice');
  });

  it('表示名を指定できる', async () => {
    const user = await users.createUser({ username: 'alice', displayName: 'Alice A', password: 'pass1234' });
    expect(user.display_name).toBe('Alice A');
  });

  it('admin ロールで作成できる', async () => {
    const user = await users.createUser({ username: 'admin', password: 'pass1234', role: 'admin' });
    expect(user.role).toBe('admin');
  });

  it('不正なロールは弾かれる', async () => {
    await expect(
      users.createUser({ username: 'alice', password: 'pass1234', role: 'superadmin' })
    ).rejects.toThrow('Invalid role');
  });

  it('ユーザー名重複はエラー', async () => {
    await users.createUser({ username: 'alice', password: 'pass1234' });
    await expect(
      users.createUser({ username: 'alice', password: 'other' })
    ).rejects.toThrow();
  });

  it('password_hash と totp_secret はレスポンスに含まれない', async () => {
    const user = await users.createUser({ username: 'alice', password: 'pass1234' });
    expect(user).not.toHaveProperty('password_hash');
    expect(user).not.toHaveProperty('totp_secret');
  });
});

// ── verifyPassword ──────────────────────────────────────────────────────────
describe('verifyPassword', () => {
  beforeEach(() => users.createUser({ username: 'alice', password: 'correct' }));

  it('正しいパスワードでユーザーを返す', async () => {
    const user = await users.verifyPassword('alice', 'correct');
    expect(user).not.toBeNull();
    expect(user!.username).toBe('alice');
  });

  it('誤ったパスワードは null', async () => {
    expect(await users.verifyPassword('alice', 'wrong')).toBeNull();
  });

  it('存在しないユーザーは null', async () => {
    expect(await users.verifyPassword('nobody', 'pass')).toBeNull();
  });

  it('無効化ユーザーは null', async () => {
    const u = await prisma.user.findUnique({ where: { username: 'alice' } });
    await users.updateUser(u!.id, { enabled: false });
    expect(await users.verifyPassword('alice', 'correct')).toBeNull();
  });
});

// ── updateUser ──────────────────────────────────────────────────────────────
describe('updateUser', () => {
  it('表示名を更新できる', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    const updated = await users.updateUser(u.id, { displayName: 'Alice Updated' });
    expect(updated!.display_name).toBe('Alice Updated');
  });

  it('ロールを変更できる', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    const updated = await users.updateUser(u.id, { role: 'admin' });
    expect(updated!.role).toBe('admin');
  });

  it('不正なロールは弾かれる', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    await expect(users.updateUser(u.id, { role: 'god' })).rejects.toThrow('Invalid role');
  });
});

// ── changePassword ──────────────────────────────────────────────────────────
describe('changePassword', () => {
  it('正しい現在のパスワードで変更できる', async () => {
    const u = await users.createUser({ username: 'alice', password: 'old1234' });
    await users.changePassword(u.id, 'old1234', 'new5678');
    expect(await users.verifyPassword('alice', 'new5678')).not.toBeNull();
  });

  it('誤った現在のパスワードはエラー', async () => {
    const u = await users.createUser({ username: 'alice', password: 'old1234' });
    await expect(
      users.changePassword(u.id, 'wrong', 'new5678')
    ).rejects.toThrow('現在のパスワードが正しくありません');
  });
});

// ── deleteUser ──────────────────────────────────────────────────────────────
describe('deleteUser', () => {
  it('ユーザーを削除できる', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    await users.deleteUser(u.id);
    expect(await users.findById(u.id)).toBeNull();
  });
});

// ── TOTP ────────────────────────────────────────────────────────────────────
describe('TOTP', () => {
  it('シークレットを生成できる', () => {
    const secret = users.generateTotpSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(10);
  });

  it('正しいコードで有効化できる', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    const secret = users.generateTotpSecret();
    const token  = authenticator.generate(secret);
    await users.enableTotp(u.id, secret, token);
    const updated = await prisma.user.findUnique({ where: { id: u.id } });
    expect(updated!.totp_enabled).toBe(true);
  });

  it('誤ったコードは有効化を拒否', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    await expect(
      users.enableTotp(u.id, users.generateTotpSecret(), '000000')
    ).rejects.toThrow('コードが正しくありません');
  });

  it('正しいコードでログイン検証できる', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    const secret = users.generateTotpSecret();
    const token  = authenticator.generate(secret);
    await users.enableTotp(u.id, secret, token);
    expect(await users.verifyTotpToken(u.id, authenticator.generate(secret))).toBe(true);
  });

  it('誤ったコードはログイン拒否', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    const secret = users.generateTotpSecret();
    await users.enableTotp(u.id, secret, authenticator.generate(secret));
    expect(await users.verifyTotpToken(u.id, '000000')).toBe(false);
  });

  it('同じコードを2回使うと2回目は拒否（リプレイ防止）', async () => {
    const u = await users.createUser({ username: 'alice', password: 'pass1234' });
    const secret = users.generateTotpSecret();
    await users.enableTotp(u.id, secret, authenticator.generate(secret));
    const token = authenticator.generate(secret);
    expect(await users.verifyTotpToken(u.id, token)).toBe(true);
    expect(await users.verifyTotpToken(u.id, token)).toBe(false);
  });
});
