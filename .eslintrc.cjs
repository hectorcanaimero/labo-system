const path = require('path');

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['import', '@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: ['./tsconfig.base.json', './apps/web/tsconfig.json', './packages/*/tsconfig.json'],
      },
    },
  },
  rules: {
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          // packages/lib is leaf — cannot import from anyone else
          {
            target: path.resolve(__dirname, 'packages/lib'),
            from: path.resolve(__dirname, 'apps/web'),
            message: 'ADR-08: packages/lib is a leaf package and cannot import from apps/web',
          },
          {
            target: path.resolve(__dirname, 'packages/lib'),
            from: path.resolve(__dirname, 'packages/ui'),
            message: 'ADR-08: packages/lib is a leaf package and cannot import from packages/ui',
          },
          {
            target: path.resolve(__dirname, 'packages/lib'),
            from: path.resolve(__dirname, 'packages/convex'),
            message:
              'ADR-08: packages/lib is a leaf package and cannot import from packages/convex',
          },
          {
            target: path.resolve(__dirname, 'packages/lib'),
            from: path.resolve(__dirname, 'packages/pdf'),
            message: 'ADR-08: packages/lib is a leaf package and cannot import from packages/pdf',
          },
          // packages/pdf can only import from packages/lib
          {
            target: path.resolve(__dirname, 'packages/pdf'),
            from: path.resolve(__dirname, 'apps/web'),
            message: 'ADR-08: packages/pdf can only import from packages/lib',
          },
          {
            target: path.resolve(__dirname, 'packages/pdf'),
            from: path.resolve(__dirname, 'packages/ui'),
            message: 'ADR-08: packages/pdf can only import from packages/lib',
          },
          {
            target: path.resolve(__dirname, 'packages/pdf'),
            from: path.resolve(__dirname, 'packages/convex'),
            message: 'ADR-08: packages/pdf can only import from packages/lib',
          },
          // packages/ui can only import from packages/lib
          {
            target: path.resolve(__dirname, 'packages/ui'),
            from: path.resolve(__dirname, 'apps/web'),
            message: 'ADR-08: packages/ui can only import from packages/lib',
          },
          {
            target: path.resolve(__dirname, 'packages/ui'),
            from: path.resolve(__dirname, 'packages/pdf'),
            message: 'ADR-08: packages/ui can only import from packages/lib',
          },
          {
            target: path.resolve(__dirname, 'packages/ui'),
            from: path.resolve(__dirname, 'packages/convex'),
            message: 'ADR-08: packages/ui can only import from packages/lib',
          },
          // packages/convex can only import from packages/lib
          {
            target: path.resolve(__dirname, 'packages/convex'),
            from: path.resolve(__dirname, 'apps/web'),
            message: 'ADR-08: packages/convex can only import from packages/lib',
          },
          {
            target: path.resolve(__dirname, 'packages/convex'),
            from: path.resolve(__dirname, 'packages/ui'),
            message: 'ADR-08: packages/convex can only import from packages/lib',
          },
          {
            target: path.resolve(__dirname, 'packages/convex'),
            from: path.resolve(__dirname, 'packages/pdf'),
            message: 'ADR-08: packages/convex can only import from packages/lib',
          },
        ],
      },
    ],
  },
};
