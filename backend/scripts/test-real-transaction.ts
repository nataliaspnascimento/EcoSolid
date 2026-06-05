// Script para testar o envio de transações reais na Sepolia com sua carteira
// Executar: npx ts-node scripts/test-real-transaction.ts
// Requer BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY e CONTRACT_ADDRESS no .env

import { ethers } from 'ethers';
import * as path from 'path';
import * as fs from 'fs';

// Carrega .env manualmente
function loadEnv() {
  const scriptDir = __dirname;
  const possiblePaths = [
    path.resolve(scriptDir, '..', '.env'),        // backend/.env
    path.resolve(scriptDir, '..', '.env.local'),  // backend/.env.local
    path.resolve(process.cwd(), '.env'),          // .env no cwd
    path.resolve(process.cwd(), '..', '.env'),    // ../.env
  ];
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      console.log('Usando .env:', envPath);
      parseEnvContent(fs.readFileSync(envPath, 'utf8'));
      return;
    }
  }
  console.warn('Aviso: Nenhum arquivo .env encontrado. Usando valores padrão.');
}

function parseEnvContent(content: string) {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

async function main() {
  const RPC_URL = process.env.BLOCKCHAIN_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
  const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY;
  const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

  if (!PRIVATE_KEY || PRIVATE_KEY === '0x0000000000000000000000000000000000000000000000000000000000000001') {
    console.error('ERRO: BLOCKCHAIN_PRIVATE_KEY não definida ou padrão no .env');
    process.exit(1);
  }

  if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
    console.error('ERRO: CONTRACT_ADDRESS não definido no .env');
    console.error('Execute primeiro o deploy do contrato: npx ts-node scripts/deploy-contract.ts');
    process.exit(1);
  }

  console.log('Conectando à rede Sepolia...');
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log('Sua Carteira:', wallet.address);
  console.log('Saldo:', ethers.formatEther(balance), 'ETH');

  if (balance === 0n) {
    console.error('ERRO: Sua carteira está sem Sepolia ETH para taxas de gás.');
    console.error('Obtenha fundos gratuitos em https://sepoliafaucet.com');
    process.exit(1);
  }

  // ABI mínimo do contrato implantado (EcoSolid)
  const abi = [
    "function registerAction(bytes32 actionId, address citizen, uint256 points, string memory actionType) public",
    "event ActionRegistered(bytes32 indexed actionId, address indexed citizen, uint256 points, string actionType, uint256 timestamp)"
  ];

  console.log(`\nInstanciando contrato em ${CONTRACT_ADDRESS}...`);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

  // Parâmetros de teste para a transação
  const actionIdBytes = ethers.hexlify(ethers.randomBytes(32));
  const testCitizenAddress = '0x71C7656EC7ab88b098defB751B7401B5f6d1476B'; // Endereço de teste
  const points = 100n;
  const actionType = 'RECYCLING';

  console.log('\nEnviando transação real para a blockchain...');
  console.log(`- ID da Ação: ${actionIdBytes}`);
  console.log(`- Carteira do Cidadão: ${testCitizenAddress}`);
  console.log(`- Pontos: ${points}`);
  console.log(`- Tipo de Ação: ${actionType}`);

  try {
    const tx = await contract.registerAction(actionIdBytes, testCitizenAddress, points, actionType);
    console.log(`\nTransação enviada! Hash: ${tx.hash}`);
    console.log('Aguardando mineração na rede Sepolia (pode levar alguns segundos)...');

    const receipt = await tx.wait();
    console.log('Transação confirmada com sucesso no bloco:', receipt.blockNumber);
    console.log('\n============================================');
    console.log('VER NO ETHERSCAN:');
    console.log(`https://sepolia.etherscan.io/tx/${tx.hash}`);
    console.log('============================================');
  } catch (error: any) {
    console.error('\nErro ao executar a transação:', error.reason || error.message || error);
  }
}

main().catch(err => {
  console.error('Falha de execução:', err);
  process.exit(1);
});
