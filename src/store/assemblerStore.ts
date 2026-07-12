import { create } from 'zustand';
import { emptyAssemblerConfig, type AssemblerConfig } from '../../shared/assembler';
import { DEFAULT_H2S_SYSTEM_CONFIG, type H2sSystemConfig } from '../../shared/h2sSystem';
import { getAssemblerConfig, setAssemblerConfig, getH2sConfig, setH2sConfig } from '../lib/idb';

interface AssemblerState {
  config: AssemblerConfig;
  h2sConfig: H2sSystemConfig;
  loaded: boolean;
  load: () => Promise<void>;
  setConfig: (config: AssemblerConfig) => void;
  setH2sConfig: (config: H2sSystemConfig) => void;
}

export const useAssemblerStore = create<AssemblerState>((set) => ({
  config: emptyAssemblerConfig(),
  h2sConfig: DEFAULT_H2S_SYSTEM_CONFIG,
  loaded: false,

  load: async () => {
    const [saved, savedH2s] = await Promise.all([
      getAssemblerConfig().catch(() => null),
      getH2sConfig().catch(() => null),
    ]);
    set({
      config: saved ?? emptyAssemblerConfig(),
      h2sConfig: savedH2s ?? DEFAULT_H2S_SYSTEM_CONFIG,
      loaded: true,
    });
  },

  setConfig: (config) => {
    set({ config });
    setAssemblerConfig(config).catch(() => {});
  },

  setH2sConfig: (config) => {
    set({ h2sConfig: config });
    setH2sConfig(config).catch(() => {});
  },
}));
