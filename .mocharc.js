module.exports = {
  file: ['tests/setup.ts'],
  exit: true,
  extensions: ['ts'],
  'node-option': [
    'import=ts-node/esm',
  ],
}
