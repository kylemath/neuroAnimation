/**
 * biophysics.js - Biophysical calculations for neuron voltage
 */

import { ION_CONC, PERM } from './config.js';

/**
 * Goldman-Hodgkin-Katz equation to calculate membrane voltage from ion concentrations
 * @param {string} compartment - 'soma', 'hillock', or 'axon'
 * @param {string} permState - 'rest' or 'peak'
 * @returns {number} Voltage in mV
 */
export function calculateGHKVoltage(compartment, permState = 'rest') {
  const conc = ION_CONC[compartment];
  if (!conc) return -70;
  
  const P = PERM[permState];
  
  const numerator = P.K * ION_CONC.K_out + P.Na * ION_CONC.Na_out + P.Cl * conc.Cl;
  const denominator = P.K * conc.K + P.Na * conc.Na + P.Cl * ION_CONC.Cl_out;
  
  if (denominator <= 0) return -70;
  
  // RT/F * ln(ratio) ≈ 61.5 * log10(ratio) at 37°C
  return 61.5 * Math.log10(numerator / denominator);
}

/**
 * Nernst equation for single ion equilibrium potential
 * @param {string} ionType - 'Na', 'K', or 'Cl'
 * @param {string} compartment - 'soma', 'hillock', or 'axon'
 * @returns {number} Equilibrium potential in mV
 */
export function calculateNernst(ionType, compartment) {
  const conc = ION_CONC[compartment];
  if (!conc) return 0;
  
  const z = ionType === 'Cl' ? -1 : 1; // Valence
  let outConc, inConc;
  
  if (ionType === 'Na') {
    outConc = ION_CONC.Na_out;
    inConc = conc.Na;
  } else if (ionType === 'K') {
    outConc = ION_CONC.K_out;
    inConc = conc.K;
  } else { // Cl
    outConc = ION_CONC.Cl_out;
    inConc = conc.Cl;
  }
  
  if (inConc <= 0) return 0;
  
  // E = (RT/zF) * ln(out/in) ≈ (61.5/z) * log10(out/in) at 37°C
  return (61.5 / z) * Math.log10(outConc / inConc);
}

/**
 * Calculate the action potential waveform at a given position and time
 * This is a phenomenological model matching the shape of real APs
 * @param {number} position - Position along axon (x coordinate)
 * @param {number} time - Current simulation time
 * @param {number} apStartTime - When the AP was triggered
 * @param {number} waveSpeed - Propagation speed
 * @param {number} axonStart - Starting position of axon
 * @returns {number} Voltage in mV
 */
export function calculateAPWaveform(position, time, apStartTime, waveSpeed, axonStart) {
  if (apStartTime < 0) return -70;
  
  const timeSinceAP = time - apStartTime;
  const wavePos = axonStart + timeSinceAP * waveSpeed;
  const distance = position - wavePos;
  
  // Outside the wave region
  if (distance > 10 || distance < -25) return -70;
  
  // Rising phase (depolarization)
  if (distance > 0 && distance <= 10) {
    const t = 1 - distance / 10;
    return -70 + 110 * Math.pow(t, 1.5);
  }
  
  // Peak phase
  if (distance >= -2 && distance <= 0) {
    return 40;
  }
  
  // Falling phase (repolarization)
  if (distance >= -8 && distance < -2) {
    const t = (Math.abs(distance) - 2) / 6;
    return 40 - 120 * t;
  }
  
  // Hyperpolarization (undershoot)
  if (distance >= -15 && distance < -8) {
    const t = (Math.abs(distance) - 8) / 7;
    return -80 + 5 * t;
  }
  
  // Recovery to rest
  const t = (Math.abs(distance) - 15) / 10;
  return -75 + 5 * Math.min(1, t);
}

/**
 * Determine refractory state based on position relative to wave
 * @param {number} position - Position along axon
 * @param {number} wavePos - Current wave position
 * @returns {number} 0 = normal, 1 = absolute refractory, 2 = relative refractory
 */
export function calculateRefractoryState(position, wavePos) {
  const distance = position - wavePos;
  
  // Absolute refractory period (Na channels inactivated)
  if (distance >= -15 && distance < -2) return 1;
  
  // Relative refractory period (recovering)
  if (distance >= -25 && distance < -15) return 2;
  
  return 0;
}
