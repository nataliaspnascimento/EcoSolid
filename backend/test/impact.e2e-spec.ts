import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ImpactActionController } from '../src/presentation/controllers/ImpactActionController';
import { RegisterImpactUseCase } from '../src/application/use-cases/RegisterImpactUseCase';
import { getModelToken } from '@nestjs/mongoose';
import { ActionType } from '../src/domain/enums/ActionType';

describe('ImpactAction (Integration)', () => {
  let app: INestApplication<App>;

  // Banco de dados em memória simplificado para a integração
  const db = {
    citizens: new Map<string, any>(),
    impactActions: new Map<string, any>(),
  };

  const mockCitizenModel = {
    findById: jest.fn().mockImplementation((id) => {
      const data = db.citizens.get(id);
      if (!data) return null;
      return {
        ...data,
        save: jest.fn().mockImplementation(function (this: any) {
          db.citizens.set(id, { ...data, ...this });
          return Promise.resolve(this);
        }),
      };
    }),
  };

  const mockImpactModel = {
    findById: jest.fn().mockImplementation((id) => {
      const data = db.impactActions.get(id);
      if (!data) return null;
      return {
        ...data,
        save: jest.fn().mockImplementation(function (this: any) {
          db.impactActions.set(id, { ...data, ...this });
          return Promise.resolve(this);
        }),
      };
    }),
    create: jest.fn().mockImplementation((data) => {
      const id = data._id || 'action-' + Math.random().toString(36).substring(2, 9);
      const record = { ...data, _id: id };
      db.impactActions.set(id, record);
      return Promise.resolve(record);
    }),
  };

  const mockCitizenRepo = {
    findById: jest.fn().mockImplementation(async (id) => {
      return db.citizens.get(id) || null;
    }),
    save: jest.fn().mockImplementation(async (citizen) => {
      db.citizens.set(citizen.id, citizen);
    }),
  };

  const mockImpactRepo = {
    save: jest.fn().mockImplementation(async (action) => {
      db.impactActions.set(action.id, action);
    }),
  };

  const mockBlockchainService = {
    registerAction: jest.fn().mockResolvedValue('0xrealblockchaintransactionhash12345'),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ImpactActionController],
      providers: [
        {
          provide: RegisterImpactUseCase,
          useFactory: (
            citizenRepo: any,
            impactRepo: any,
            blockchainSvc: any,
          ) => {
            return new RegisterImpactUseCase(citizenRepo, impactRepo, blockchainSvc);
          },
          inject: ['ICitizenRepository', 'IImpactActionRepository', 'IBlockchainService'],
        },
        {
          provide: 'ICitizenRepository',
          useValue: mockCitizenRepo,
        },
        {
          provide: 'IImpactActionRepository',
          useValue: mockImpactRepo,
        },
        {
          provide: 'IBlockchainService',
          useValue: mockBlockchainService,
        },
        {
          provide: getModelToken('Citizen'),
          useValue: mockCitizenModel,
        },
        {
          provide: getModelToken('ImpactAction'),
          useValue: mockImpactModel,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    db.citizens.clear();
    db.impactActions.clear();

    // Adicionar cidadão de teste inicial no "banco"
    db.citizens.set('citizen-1', {
      id: 'citizen-1',
      _id: 'citizen-1',
      name: 'Maria Silva',
      walletAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d1476B',
      cpf: '11122233344',
      email: 'maria@example.com',
      totalPoints: 0,
      level: 'SEED',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('deve registrar e validar uma ação de impacto integrando controller, useCase e blockchain', async () => {
    // 1. Registrar Impacto (POST /impact/register)
    const registerPayload = {
      citizenId: 'citizen-1',
      actionType: ActionType.RECYCLING,
      pointsEarned: 150,
      validatorId: 'partner-code-99',
      evidenceUrl: 'https://example.com/image.jpg',
    };

    const registerRes = await request(app.getHttpServer())
      .post('/impact/register')
      .send(registerPayload)
      .expect(201);

    expect(registerRes.body.success).toBe(true);
    const registeredAction = registerRes.body.data.action;
    expect(registeredAction.status).toBe('PENDENTE_VALIDACAO');
    expect(registeredAction.txHash).toBe('pending-validation');

    // Verificar se foi salvo no banco em memória
    expect(db.impactActions.has(registeredAction.id)).toBe(true);
    const actionInDb = db.impactActions.get(registeredAction.id);
    expect(actionInDb.status).toBe('PENDENTE_VALIDACAO');

    // 2. Validar Impacto (POST /impact/:id/validate)
    const validateRes = await request(app.getHttpServer())
      .post(`/impact/${registeredAction.id}/validate`)
      .set('x-partner-code', 'partner-code-99')
      .expect(201);

    expect(validateRes.body.success).toBe(true);
    expect(validateRes.body.message).toBe('Ação validada e blockchain registrada!');
    expect(validateRes.body.data.txHash).toBe('0xrealblockchaintransactionhash12345');

    // Verificar se o status da ação foi atualizado para VALIDADO na base de dados
    const validatedActionInDb = db.impactActions.get(registeredAction.id);
    expect(validatedActionInDb.status).toBe('VALIDADO');
    expect(validatedActionInDb.txHash).toBe('0xrealblockchaintransactionhash12345');

    // Verificar se a carteira e pontos do Cidadão integrados foram atualizados
    const updatedCitizenInDb = db.citizens.get('citizen-1');
    expect(updatedCitizenInDb.totalPoints).toBe(150);
    expect(updatedCitizenInDb.level).toBe('SEED');
  });
});
