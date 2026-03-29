/**
 * Trigger a short vibration for tactile feedback on mobile devices.
 * No-op on devices that don't support the Vibration API.
 * @param {number} ms - vibration duration in milliseconds (default 50)
 */
export const haptic = (ms = 50) => { try { navigator?.vibrate?.(ms); } catch {} };
