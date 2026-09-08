// Node harness: stubs the few Apps Script globals the calculation layer touches.
const fs = require('fs');
const prelude = `
var PropertiesService = { getScriptProperties: () => ({ getProperties: () => ({}), getProperty: () => null }) };
var Logger = { log: (m) => console.log(m) };
`;
const files = ['Config.gs', 'Parse.gs', 'Compute.gs', 'Test.gs'];
const src = prelude + files.map(f => fs.readFileSync('apps-script/' + f, 'utf8')).join('\n');
const result = new Function(src + '\nreturn runSelfTest();')();
console.log(result.summary);
result.failures.forEach(f => console.log('FAIL ' + f));
process.exit(result.failed ? 1 : 0);
