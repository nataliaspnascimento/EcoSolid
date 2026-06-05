import { Test, TestingModule } from '@nestjs/testing';
import { ImpactActionController } from './ImpactActionController';
import { RegisterImpactUseCase } from '../../application/use-cases/RegisterImpactUseCase';
import { getModelToken } from '@nestjs/mongoose';
import { ActionType } from '../../domain/enums/ActionType';

describe('ImpactActionController', () => {
  let controller: ImpactActionController;
  let mockRegisterImpactUseCase: any;
  let mockImpactRepo: any;
  let mockCitizenRepo: any;
  let mockBlockchainService: any;
  let mockImpactModel: any;
  let mockCitizenModel: any;

  beforeEach(async () => {
    mockRegisterImpactUseCase = {
      execute: jest.fn(),
    };
    mockImpactRepo = {
      save: jest.fn(),
      findByCitizenId: jest.fn(),
    };
    mockCitizenRepo = {
      save: jest.fn(),
      findById: jest.fn(),
    };
    mockBlockchainService = {
      registerAction: jest.fn(),
      mintSolidToken: jest.fn(),
      confirmRedemption: jest.fn(),
    };
    mockImpactModel = {
      findById: jest.fn(),
      find: jest.fn().mockReturnThis(),
      findOne: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };
    mockCitizenModel = {
      findById: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImpactActionController],
      providers: [
        {
          provide: RegisterImpactUseCase,
          useValue: mockRegisterImpactUseCase,
        },
        {
          provide: 'IImpactActionRepository',
          useValue: mockImpactRepo,
        },
        {
          provide: 'ICitizenRepository',
          useValue: mockCitizenRepo,
        },
        {
          provide: 'IBlockchainService',
          useValue: mockBlockchainService,
        },
        {
          provide: getModelToken('ImpactAction'),
          useValue: mockImpactModel,
        },
        {
          provide: getModelToken('Citizen'),
          useValue: mockCitizenModel,
        },
      ],
    }).compile();

    controller = module.get<ImpactActionController>(ImpactActionController);
  });

  describe('registerImpact', () => {
    it('deve chamar o use case para registrar a ação de impacto com sucesso', async () => {
      const dto = {
        citizenId: 'citizen-1',
        actionType: ActionType.RECYCLING,
        pointsEarned: 100,
        validatorId: 'partner-1',
        evidenceUrl: 'http://evidence.url',
      };
      const useCaseResult = {
        action: { id: 'action-1', status: 'PENDENTE_VALIDACAO' },
        txHash: 'pending-validation',
      };
      mockRegisterImpactUseCase.execute.mockResolvedValue(useCaseResult);

      const result = await controller.registerImpact(dto);

      expect(mockRegisterImpactUseCase.execute).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ success: true, data: useCaseResult });
    });

    it('deve retornar success: false se o use case lançar erro', async () => {
      const dto = {
        citizenId: 'citizen-1',
        actionType: ActionType.RECYCLING,
        pointsEarned: 100,
        validatorId: 'partner-1',
        evidenceUrl: 'http://evidence.url',
      };
      mockRegisterImpactUseCase.execute.mockRejectedValue(new Error('Erro no use case'));

      const result = await controller.registerImpact(dto);

      expect(result).toEqual({ success: false, error: 'Erro no use case' });
    });
  });

  describe('validateAction', () => {
    it('deve validar a ação e registrar na blockchain Sepolia com sucesso', async () => {
      const mockAction = {
        _id: 'action-1',
        citizenId: 'citizen-1',
        pointsEarned: 100,
        actionType: 'RECYCLING',
        status: 'PENDENTE_VALIDACAO',
        txHash: 'pending-validation',
        save: jest.fn().mockResolvedValue(true),
      };
      const mockCitizen = {
        _id: 'citizen-1',
        walletAddress: '0x123abc',
        totalPoints: 450,
        level: 'SEED',
        save: jest.fn().mockResolvedValue(true),
      };

      mockImpactModel.findById.mockResolvedValue(mockAction);
      mockCitizenModel.findById.mockResolvedValue(mockCitizen);
      mockBlockchainService.registerAction.mockResolvedValue('0xtxhash123');

      const result = await controller.validateAction('action-1', 'partner-code-123');

      expect(mockImpactModel.findById).toHaveBeenCalledWith('action-1');
      expect(mockCitizenModel.findById).toHaveBeenCalledWith('citizen-1');
      expect(mockBlockchainService.registerAction).toHaveBeenCalledWith(
        'action-1',
        '0x123abc',
        100,
        'RECYCLING',
      );
      expect(mockCitizen.totalPoints).toBe(550);
      expect(mockCitizen.level).toBe('SPROUT'); // 550 points is SPROUT
      expect(mockAction.status).toBe('VALIDADO');
      expect(mockAction.txHash).toBe('0xtxhash123');
      expect(result.success).toBe(true);
      expect(result.data.txHash).toBe('0xtxhash123');
    });

    it('deve retornar erro se o cabeçalho x-partner-code estiver ausente', async () => {
      const result = await controller.validateAction('action-1', '');
      expect(result).toEqual({ success: false, error: 'x-partner-code header obrigatório' });
    });

    it('deve retornar erro se a ação não for encontrada', async () => {
      mockImpactModel.findById.mockResolvedValue(null);
      const result = await controller.validateAction('action-1', 'partner-code');
      expect(result).toEqual({ success: false, error: 'Ação não encontrada' });
    });

    it('deve retornar erro se a ação já estiver processada', async () => {
      const mockAction = {
        _id: 'action-1',
        status: 'VALIDADO',
      };
      mockImpactModel.findById.mockResolvedValue(mockAction);
      const result = await controller.validateAction('action-1', 'partner-code');
      expect(result).toEqual({ success: false, error: 'Ação já foi processada' });
    });
  });
});
