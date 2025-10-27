/**
 * Check which OpenAI configuration you're using
 */

require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' }); // Override with .env.local if exists

console.log('\n🔍 Checking OpenAI Configuration...\n');

const azureKey = process.env.AZURE_OPENAI_API_KEY;
const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
const openaiKey = process.env.OPENAI_API_KEY;

console.log('Configuration Status:');
console.log('━'.repeat(60));

if (azureKey && azureKey !== 'your_azure_openai_key_here') {
  console.log('✅ Azure OpenAI API Key: SET (length:', azureKey.length, 'chars)');
} else if (azureKey === 'your_azure_openai_key_here') {
  console.log('⚠️  Azure OpenAI API Key: PLACEHOLDER (not configured)');
} else {
  console.log('❌ Azure OpenAI API Key: NOT SET');
}

if (azureEndpoint && azureEndpoint !== 'https://your-resource.openai.azure.com') {
  console.log('✅ Azure OpenAI Endpoint:', azureEndpoint);
} else if (azureEndpoint === 'https://your-resource.openai.azure.com') {
  console.log('⚠️  Azure OpenAI Endpoint: PLACEHOLDER (not configured)');
} else {
  console.log('❌ Azure OpenAI Endpoint: NOT SET');
}

if (azureDeployment && azureDeployment !== 'your-deployment-name') {
  console.log('✅ Azure OpenAI Deployment:', azureDeployment);
} else if (azureDeployment === 'your-deployment-name') {
  console.log('⚠️  Azure OpenAI Deployment: PLACEHOLDER (not configured)');
} else {
  console.log('❌ Azure OpenAI Deployment: NOT SET');
}

console.log('━'.repeat(60));

if (openaiKey && openaiKey !== 'your_openai_api_key_here') {
  console.log('✅ Standard OpenAI API Key: SET (length:', openaiKey.length, 'chars)');
} else if (openaiKey === 'your_openai_api_key_here') {
  console.log('⚠️  Standard OpenAI API Key: PLACEHOLDER (not configured)');
} else {
  console.log('❌ Standard OpenAI API Key: NOT SET');
}

console.log('\n📊 Current Configuration:\n');

const hasAzureConfig = 
  azureKey && azureKey !== 'your_azure_openai_key_here' &&
  azureEndpoint && azureEndpoint !== 'https://your-resource.openai.azure.com' &&
  azureDeployment && azureDeployment !== 'your-deployment-name';

const hasOpenAIConfig = openaiKey && openaiKey !== 'your_openai_api_key_here';

if (hasAzureConfig) {
  console.log('🎯 Using: AZURE OPENAI');
  console.log('   Endpoint:', azureEndpoint);
  console.log('   Deployment:', azureDeployment);
  console.log('   Model will be:', azureDeployment);
} else if (hasOpenAIConfig) {
  console.log('🎯 Using: STANDARD OPENAI');
  console.log('   API Key is set');
  console.log('   Model will be: gpt-4o-mini (default)');
} else {
  console.log('❌ NO VALID CONFIGURATION FOUND');
  console.log('\n   You need to configure either:');
  console.log('   1. Azure OpenAI (recommended if you have it):');
  console.log('      - AZURE_OPENAI_API_KEY');
  console.log('      - AZURE_OPENAI_ENDPOINT');
  console.log('      - AZURE_OPENAI_DEPLOYMENT_NAME');
  console.log('\n   OR');
  console.log('\n   2. Standard OpenAI:');
  console.log('      - OPENAI_API_KEY (from https://platform.openai.com/api-keys)');
}

console.log('\n━'.repeat(60));
console.log('AnswerPack Assistant Status:', process.env.NEXT_PUBLIC_ANSWERPACK_ASSISTANT === 'true' ? '🟢 ENABLED' : '⚪ DISABLED');
console.log('━'.repeat(60));
console.log();
