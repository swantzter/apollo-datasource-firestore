module.exports = {
  extends: 'standard-with-typescript',
  parserOptions: {
    project: 'tsconfig.dev.json'
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/strict-boolean-expressions': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off'
  }
}
