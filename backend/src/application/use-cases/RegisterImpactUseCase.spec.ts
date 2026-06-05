import { RegisterImpactUseCase } from './RegisterImpactUseCase';
import { Citizen } from '../../domain/entities/Citizen';
import { CitizenLevel } from '../../domain/enums/CitizenLevel';
import { ActionType } from '../../domain/enums/ActionType';

describe('RegisterImpactUseCase', () => {
  let useCase: RegisterImpactUseCase;
  let mockCitizenRepository: any;
  let mockImpactRepository: any;
  let mockBlockchainService: any;

  beforeEach(() => {
    mockCitizenRepository = {
      findById: jest.fn(),
      save: jest.fn(),
    };
    mockImpactRepository = {
      save: jest.fn(),
    };
    mockBlockchainService = {
      registerAction: jest.fn(),
      mintSolidToken: jest.fn(),
      confirmRedemption: jest.fn(),
    };
    useCase = new RegisterImpactUseCase(
      mockCitizenRepository,
      mockImpactRepository,
      mockBlockchainService,
    );
  });

  it('deve registrar uma ação de impacto com status PENDENTE_VALIDACAO', async () => {
    const citizen = new Citizen('citizen-1', 'João', '0x123', '123.456.789-00', 'joao@example.com');
    mockCitizenRepository.findById.mockResolvedValue(citizen);

    const dto = {
      citizenId: 'citizen-1',
      actionType: ActionType.RECYCLING,
      pointsEarned: 100,
      validatorId: 'partner-1',
      evidenceUrl: 'http://evidence.url',
      latitude: -23.55,
      longitude: -46.63,
      locationAddress: 'Rua A, 123',
    };

    const result = await useCase.execute(dto);

    expect(mockCitizenRepository.findById).toHaveBeenCalledWith('citizen-1');
    expect(mockImpactRepository.save).toHaveBeenCalled();
    expect(result.action.status).toBe('PENDENTE_VALIDACAO');
    expect(result.txHash).toBe('pending-validation');
    expect(result.action.pointsEarned).toBe(100);
  });

  it('deve atualizar o tipo sanguíneo do cidadão se for uma doação de sangue', async () => {
    const citizen = new Citizen('citizen-1', 'João', '0x123', '123.456.789-00', 'joao@example.com');
    mockCitizenRepository.findById.mockResolvedValue(citizen);

    const dto = {
      citizenId: 'citizen-1',
      actionType: ActionType.BLOOD_DONATION,
      pointsEarned: 200,
      validatorId: 'partner-1',
      evidenceUrl: 'http://evidence.url',
      bloodType: 'O+',
    };

    const result = await useCase.execute(dto);

    expect(citizen.bloodType).toBe('O+');
    expect(mockCitizenRepository.save).toHaveBeenCalledWith(citizen);
  });

  it('deve lançar erro se o cidadão não for encontrado', async () => {
    mockCitizenRepository.findById.mockResolvedValue(null);

    const dto = {
      citizenId: 'non-existent',
      actionType: ActionType.RECYCLING,
      pointsEarned: 100,
      validatorId: 'partner-1',
      evidenceUrl: 'http://evidence.url',
    };

    await expect(useCase.execute(dto)).rejects.toThrow('Cidadão não encontrado.');
  });
});
