import { createCasino } from './casino.js';
import { createRacing } from './racing.js';
import { createHorror } from './horror.js';
import { createInk } from './ink.js';
import { createEncrypted } from './encrypted.js';
import { createGas } from './gas.js';

/** 星球风格预设注册表：games.js 里 world.style 的取值 */
export const PRESETS = {
  casino: { create: createCasino, accent: '#e8c46a' },
  racing: { create: createRacing, accent: '#ff5fa2' },
  horror: { create: createHorror, accent: '#7fd1b9' },
  ink: { create: createInk, accent: '#e2b04a' },
  encrypted: { create: createEncrypted, accent: '#9aa4b2' },
  gas: { create: createGas, accent: '#7fd8ff' },
};
