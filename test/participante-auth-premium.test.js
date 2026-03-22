// test/participante-auth-premium.test.js
import { jest } from '@jest/globals';

// ESM-compatible mocking: must use unstable_mockModule BEFORE importing the module under test
const mockAutenticar = jest.fn();
const mockBuscarMeuTime = jest.fn();
const mockLigaFindOne = jest.fn();

jest.unstable_mockModule('../services/cartolaProService.js', () => ({
  default: { autenticar: mockAutenticar, buscarMeuTime: mockBuscarMeuTime }
}));

jest.unstable_mockModule('../models/Liga.js', () => ({
  default: { findOne: mockLigaFindOne }
}));

// Dynamic import AFTER mocks are registered
const { handlerAuthPremium } = await import('../routes/participante-auth.js');

describe('POST /api/participante/auth/premium', () => {
  beforeEach(() => jest.clearAllMocks());

  test('retorna NOT_PREMIUM quando participante não tem premium=true', async () => {
    mockAutenticar.mockResolvedValue({ success: true, glbId: 'glb123' });
    mockBuscarMeuTime.mockResolvedValue({ success: true, time: { timeId: 999 } });
    mockLigaFindOne.mockResolvedValue({
      _id: 'liga1',
      participantes: [{ time_id: 999, premium: false }]
    });

    const req = { body: { email: 'x@x.com', senha: 'abc' }, session: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handlerAuthPremium(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'NOT_PREMIUM' })
    );
  });

  test('cria sessão com premium=true quando participante é premium', async () => {
    mockAutenticar.mockResolvedValue({ success: true, glbId: 'glb123' });
    mockBuscarMeuTime.mockResolvedValue({ success: true, time: { timeId: 13935277 } });
    mockLigaFindOne.mockResolvedValue({
      _id: { toString: () => 'liga1' },
      participantes: [{ time_id: 13935277, premium: true, nome_cartola: 'Paulinett', nome_time: 'Urubu Play' }]
    });

    const req = {
      body: { email: 'p@p.com', senha: 'abc' },
      session: { save: jest.fn((cb) => cb(null)) }
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handlerAuthPremium(req, res);

    // Estrutura aninhada — igual aos outros handlers do arquivo
    expect(req.session.participante).toMatchObject({
      timeId: '13935277',
      premium: true,
      participante: expect.objectContaining({ nome_cartola: 'Paulinett', nome_time: 'Urubu Play' })
    });
    expect(req.session.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('retorna INVALID_CREDENTIALS quando Globo rejeita', async () => {
    mockAutenticar.mockResolvedValue({ success: false, error: 'Credenciais invalidas' });

    const req = { body: { email: 'x@x.com', senha: 'wrong' }, session: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await handlerAuthPremium(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS' })
    );
  });
});
