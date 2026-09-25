import { requireOptionalNativeModule } from 'expo';

/**
 * Yerel yol tarifi modülü (ios/PuanlaDirectionsModule.swift, Apple MKDirections).
 * Expo Go'da ve web'de yoktur (yalnızca EAS build'de derlenir); o zaman `null`.
 */

export type NativeCoordinate = { latitude: number; longitude: number };

export type NativeRoute = {
  /** Metre */
  distance: number;
  /** Saniye */
  duration: number;
  /** [enlem, boylam] çiftleri */
  coordinates: [number, number][];
  steps: { instruction: string; distance: number; latitude: number; longitude: number }[];
};

type PuanlaDirectionsModule = {
  route(from: NativeCoordinate, to: NativeCoordinate, mode: 'walking' | 'driving'): Promise<NativeRoute>;
  eta(from: NativeCoordinate, to: NativeCoordinate, mode: 'walking' | 'driving' | 'transit'): Promise<number>;
};

export default requireOptionalNativeModule<PuanlaDirectionsModule>('PuanlaDirections');
