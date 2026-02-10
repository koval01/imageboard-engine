const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'core.js');
const outputFile = path.join(__dirname, '../assets/js/core.min.js');

console.log(`Reading from ${inputFile}...`);

const sourceCode = fs.readFileSync(inputFile, 'utf8');

const obfuscationResult = JavaScriptObfuscator.obfuscate(sourceCode, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false, // Changed to false so we can see errors
    identifierNamesGenerator: 'mangled-shuffled',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    target: 'browser',
    unicodeEscapeSequence: false,
    // CRITICAL FIX: Reserve these strings so they aren't broken
    reservedStrings: [
        'htmx:configRequest',
        'htmx:afterSwap',
        'X-K-Proof',
        'client_key',
        'post',
        '__kr_hydrate',
        '__kr_config'
    ]
});

fs.writeFileSync(outputFile, obfuscationResult.getObfuscatedCode());

console.log(`\x1b[32m[SUCCESS]\x1b[0m Obfuscated JS written to ${outputFile}`);
