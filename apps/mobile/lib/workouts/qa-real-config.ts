/**
 * The independent QA Android package is the only release that may expose M3
 * workout navigation. Ordinary releases retain the catalogue route.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getApiBaseUrl } from '@/lib/api/client';

export const M3_QA_API = 'http://127.0.0.1:8001';
export const M3_QA_DATABASE = 'keylorforge_m3_e2e';
export const M3_QA_PACKAGE = 'com.jonathansalgadonieto.keylorforge.qareal';

export function isIsolatedRealWorkoutQa(): boolean {
  return (
    Platform.OS === 'android' &&
    Constants.expoConfig?.android?.package === M3_QA_PACKAGE &&
    Constants.expoConfig?.extra?.m3RealQaWorkoutEnabled === true &&
    getApiBaseUrl() === M3_QA_API
  );
}
