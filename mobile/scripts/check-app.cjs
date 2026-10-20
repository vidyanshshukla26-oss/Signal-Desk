const path = require('node:path');
const babel = require('@babel/core');

const appPath = path.resolve(__dirname, '..', 'App.js');

babel.transformFileSync(appPath, {
  configFile: path.resolve(__dirname, '..', 'babel.config.js'),
  sourceType: 'unambiguous',
  ast: false,
  code: false,
});

process.stdout.write(`Expo Babel syntax check passed: ${appPath}\n`);
