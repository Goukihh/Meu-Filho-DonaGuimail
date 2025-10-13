const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// Configuração de ofuscação
const obfuscationOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: true,
    debugProtectionInterval: 2000,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 5,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
};

// Função para ofuscar um arquivo
function obfuscateFile(inputPath, outputPath) {
    try {
        console.log(`🔒 Ofuscando: ${inputPath}`);
        
        const sourceCode = fs.readFileSync(inputPath, 'utf8');
        const obfuscatedCode = JavaScriptObfuscator.obfuscate(sourceCode, obfuscationOptions);
        
        // Criar diretório de saída se não existir
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        fs.writeFileSync(outputPath, obfuscatedCode.getObfuscatedCode());
        console.log(`✅ Ofuscado salvo em: ${outputPath}`);
        
    } catch (error) {
        console.error(`❌ Erro ao ofuscar ${inputPath}:`, error.message);
    }
}

// Arquivos para ofuscar
const filesToObfuscate = [
    {
        input: 'src/main.js',
        output: 'dist/main.js'
    },
    {
        input: 'src/renderer/renderer.js',
        output: 'dist/renderer/renderer.js'
    }
];

console.log('🚀 Iniciando ofuscação...\n');

// Ofuscar todos os arquivos
filesToObfuscate.forEach(file => {
    obfuscateFile(file.input, file.output);
});

console.log('\n✅ Ofuscação concluída!');
console.log('📁 Arquivos ofuscados salvos em: dist/');
console.log('🔒 Código protegido contra análise!');
