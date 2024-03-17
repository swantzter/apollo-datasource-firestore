module.exports = {
  extends: 'love',
  parserOptions: {
    project: 'tsconfig.json'
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/strict-boolean-expressions': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off'
  }
}
