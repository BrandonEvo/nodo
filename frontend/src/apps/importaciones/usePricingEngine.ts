import { useMemo, useState, useCallback } from 'react';
import {
  calculatePricing,
  DEFAULT_CONFIG,
  DEFAULT_INPUTS,
  type PricingConfig,
  type PricingInputs,
} from './pricingEngine';

export function usePricingEngine(
  initialConfig: PricingConfig = DEFAULT_CONFIG,
  initialInputs: PricingInputs = DEFAULT_INPUTS,
) {
  const [inputs, setInputs] = useState<PricingInputs>(initialInputs);
  const [config, setConfig] = useState<PricingConfig>(initialConfig);

  const result = useMemo(() => calculatePricing(inputs, config), [inputs, config]);

  const updateInput = useCallback(<K extends keyof PricingInputs>(key: K, value: PricingInputs[K]) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateConfig = useCallback(<K extends keyof PricingConfig>(key: K, value: PricingConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setInputs(DEFAULT_INPUTS);
    setConfig(DEFAULT_CONFIG);
  }, []);

  return { inputs, config, result, updateInput, updateConfig, reset, setInputs, setConfig };
}
