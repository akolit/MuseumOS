import type { Config } from 'tailwindcss';
import sharedConfig from '../../packages/config/tailwind.config';

const config: Config = {
  presets: [sharedConfig as Config],
  content: [
    './src/**/*.{ts,tsx}',
    './index.html',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
