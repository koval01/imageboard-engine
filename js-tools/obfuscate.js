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
    deadCodeInjectionThreshold: 0.0,
    debugProtection: false, // Set true if you want to annoy devtools users
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true, // This makes the code break if formatted/beautified
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    target: 'browser',
    unicodeEscapeSequence: false
});

fs.writeFileSync(outputFile, obfuscationResult.getObfuscatedCode());

console.log(`\x1b[32m[SUCCESS]\x1b[0m Obfuscated JS written to ${outputFile}`);
