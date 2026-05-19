import { RegisterUseCase } from '../../src/application/use-cases/register.use-case.js';
import type { IAuthUserRepository } from '../../src/domain/repositories/auth-user.repository.js';
import type { ITokenService } from '../../src/domain/services/token.service.js';
import type { NatsJetStreamClient } from '@tik-live-pro/events';
import { ConflictError } from '@tik-live-pro/domain';

const makeMockRepo = (existing: boolean): IAuthUserRepository => ({
  findByEmail: jest.fn().mockResolvedValue(existing ? { id: 'u1' } : null),
  findById: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
});

const makeMockTokenService = (): ITokenService => ({
  generateTokenPair: jest.fn().mockResolvedValue({
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresIn: 900,
  }),
  verifyAccessToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
  revokeRefreshToken: jest.fn(),
});

const makeMockNats = (): NatsJetStreamClient =>
  ({ publish: jest.fn().mockResolvedValue(undefined) } as unknown as NatsJetStreamClient);

describe('RegisterUseCase', () => {
  it('creates a new user and returns tokens', async () => {
    const repo = makeMockRepo(false);
    const tokenService = makeMockTokenService();
    const nats = makeMockNats();
    const useCase = new RegisterUseCase(repo, tokenService, nats);

    const result = await useCase.execute(
      { email: 'new@example.com', password: 'password123', displayName: 'New User' },
      'corr-id-1',
    );

    expect(result.accessToken).toBe('access');
    expect(result.refreshToken).toBe('refresh');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(nats.publish).toHaveBeenCalledTimes(1);
  });

  it('throws ConflictError if email already exists', async () => {
    const repo = makeMockRepo(true);
    const useCase = new RegisterUseCase(repo, makeMockTokenService(), makeMockNats());

    await expect(
      useCase.execute(
        { email: 'existing@example.com', password: 'password123', displayName: 'User' },
        'corr-id-2',
      ),
    ).rejects.toThrow(ConflictError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('throws ValidationError for invalid email', async () => {
    const repo = makeMockRepo(false);
    const useCase = new RegisterUseCase(repo, makeMockTokenService(), makeMockNats());

    await expect(
      useCase.execute({ email: 'bad-email', password: 'password123', displayName: 'User' }, 'c'),
    ).rejects.toThrow();
  });
});
